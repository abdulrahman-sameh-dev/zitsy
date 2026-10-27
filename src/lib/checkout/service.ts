import { db } from "@/lib/db/prisma";
import { notifyOrderPaid } from "@/lib/email/order-notifications";
import { fulfillPaidOrder } from "@/lib/fulfillment/service";
import { log } from "@/lib/log";
import { validateShippingAddress } from "@/lib/markets";
import { toDecimalString } from "@/lib/money";
import { generateOrderNumber } from "@/lib/orders/order-number";
import { isPaidOrderStatus, isPayableOrderStatus } from "@/lib/orders/state";
import { PayPalApiError, getPayPalClient } from "@/lib/paypal/client";
import { PAYPAL_PROVIDER } from "@/lib/paypal/config";
import {
  paymentFeeFixedMinor,
  paymentFeePercent,
  storeMerchantCostMinor,
  storeMinContributionMinor,
} from "@/lib/config/env";
import { toStoreMinor } from "@/lib/pricing";
import {
  calculateShipping,
  type ShippingDestination,
  type ShippingGateway,
} from "@/lib/shipping";
import type {
  PaypalCapture,
  PaypalGateway,
  PaypalOrder,
} from "@/lib/paypal/types";

import { MAX_ITEM_QUANTITY } from "@/lib/cart/schemas";

import { CheckoutError } from "./errors";
import { evaluateProfitability } from "./profitability";

export interface CheckoutLine {
  productId: string;
  variantId: string;
  productSlug: string;
  printifyProductId: string;
  printifyVariantId: number;
  title: string;
  variantTitle: string;
  sku: string | null;
  quantity: number;
  unitPriceMinor: number;
  costMinor: number;
  totalPriceMinor: number;
  currency: string;
}

export interface PreparedCheckout {
  cartId: string;
  lines: CheckoutLine[];
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  currency: string;
  /**
   * Raw Printify shipping quote in the source currency, captured so the
   * actual amount booked by Printify can be reconciled after order creation.
   * Null when no destination was supplied (no quote was requested).
   */
  printifyQuotedShippingMinor: number | null;
  printifyQuotedShippingCurrency: string | null;
  /**
   * Expected Printify shipping cost for this order, converted to store
   * currency. Derived from the pre-order Printify quote — the customer-facing
   * `shippingMinor` may in future differ from it, so the two are kept separate.
   */
  expectedShippingCostMinor: number;
}

export interface BeginCheckoutResult {
  orderId: string;
  orderNumber: string;
  paypalOrderId: string;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  currency: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  email: string;
  recipientName: string;
  shipping: {
    address1: string;
    address2: string | null;
    city: string;
    region: string | null;
    postalCode: string;
    country: string;
  };
  lines: Array<{
    productId: string;
    variantId: string;
    title: string;
    variantTitle: string;
    sku: string | null;
    quantity: number;
    unitPriceMinor: number;
    totalPriceMinor: number;
  }>;
  paidAt: Date | null;
  fulfillment: {
    status: string;
    printifyStatus: string | null;
    tracking: {
      carrier: string | null;
      number: string | null;
      url: string | null;
    };
    submittedAt: Date | null;
    fulfilledAt: Date | null;
  };
}

/**
 * Reload the cart from the database and rebuild it into an authoritative,
 * snapshot-ready checkout. Rejects if anything is missing or unavailable.
 */
export async function prepareCheckout(
  cartId: string,
  options?: {
    destination?: ShippingDestination;
    shippingGateway?: ShippingGateway;
  },
): Promise<PreparedCheckout> {
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          variant: { include: { product: true } },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) throw new CheckoutError("empty_cart");

  const currency = cart.items[0].variant.currency;

  const lines = cart.items.map((item) => {
    const { variant } = item;
    const product = variant.product;

    if (!product.visible) throw new CheckoutError("cart_invalid");
    if (variant.productId !== item.productId) throw new CheckoutError("cart_invalid");
    if (!variant.isEnabled) throw new CheckoutError("cart_invalid");
    if (!variant.isAvailable) throw new CheckoutError("cart_invalid");
    if (item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY) {
      throw new CheckoutError("cart_invalid");
    }
    if (variant.currency !== currency) throw new CheckoutError("cart_invalid");

    return {
      productId: product.id,
      variantId: variant.id,
      productSlug: product.slug,
      printifyProductId: product.printifyId,
      printifyVariantId: variant.printifyVariantId,
      title: product.title,
      variantTitle: variant.title,
      sku: variant.sku,
      quantity: item.quantity,
      unitPriceMinor: variant.priceMinor,
      costMinor: variant.costMinor,
      totalPriceMinor: variant.priceMinor * item.quantity,
      currency: variant.currency,
    };
  });

  const subtotalMinor = lines.reduce((sum, line) => sum + line.totalPriceMinor, 0);

  let shippingMinor = 0;
  let printifyQuotedShippingMinor: number | null = null;
  let printifyQuotedShippingCurrency: string | null = null;
  let expectedShippingCostMinor = 0;
  if (options?.destination) {
    const quote = await calculateShipping(
      lines.map((line) => ({
        productId: line.printifyProductId,
        variantId: line.printifyVariantId,
        quantity: line.quantity,
      })),
      options.destination,
      options.shippingGateway,
    );
    shippingMinor = quote.shippingMinor;
    printifyQuotedShippingMinor = quote.sourceMinor;
    printifyQuotedShippingCurrency = quote.sourceCurrency;
    expectedShippingCostMinor = toStoreMinor(
      quote.sourceMinor,
      quote.sourceCurrency,
    );
  }

  return {
    cartId,
    lines,
    subtotalMinor,
    shippingMinor,
    totalMinor: subtotalMinor + shippingMinor,
    currency,
    printifyQuotedShippingMinor,
    printifyQuotedShippingCurrency,
    expectedShippingCostMinor,
  };
}

/**
 * Validate the delivery address for the selected market and compute a
 * server-authoritative quote (subtotal + Printify shipping + total).
 */
export async function quoteCheckout(
  cartId: string,
  customer: {
    country: string;
    address1: string;
    address2?: string;
    city: string;
    region?: string;
    postalCode: string;
  },
  shippingGateway?: ShippingGateway,
): Promise<PreparedCheckout> {
  const addressCheck = validateShippingAddress(customer.country, {
    address1: customer.address1,
    address2: customer.address2,
    city: customer.city,
    region: customer.region,
    postalCode: customer.postalCode,
  });
  if (!addressCheck.ok) {
    throw new CheckoutError(
      addressCheck.field === "country" ? "unsupported_country" : "invalid_address",
    );
  }
  return prepareCheckout(cartId, {
    destination: {
      country: addressCheck.country,
      address1: customer.address1,
      city: customer.city,
      region: customer.region,
      postalCode: customer.postalCode,
    },
    shippingGateway,
  });
}

export interface BeginCheckoutArgs {
  cartId: string;
  customer: {
    fullName: string;
    email: string;
    country: string;
    address1: string;
    address2?: string;
    city: string;
    region?: string;
    postalCode: string;
    phone?: string;
  };
  /** An order the same browser already started, if any. */
  existingOrderId?: string | null;
}

function snapshotKey(
  items: Array<{ variantId: string; quantity: number; unitPriceMinor: number }>,
): string {
  return items
    .map((i) => `${i.variantId}:${i.quantity}:${i.unitPriceMinor}`)
    .sort()
    .join("|");
}

/**
 * Refuse to start payment when the order as a whole cannot cover its production
 * cost, the expected Printify shipping cost, a payment-processing allowance and
 * any configured merchant-side cost. Shipping is charged to the customer
 * separately but is still a merchant cost, so it participates here — it is never
 * merged into the product price.
 *
 * Never creates a PayPal order: `beginCheckout` calls this before contacting
 * PayPal.
 */
function assertProfitable(prepared: PreparedCheckout): void {
  const productionCostMinor = prepared.lines.reduce(
    (sum, line) => sum + line.costMinor * line.quantity,
    0,
  );

  const result = evaluateProfitability({
    productRevenueMinor: prepared.subtotalMinor,
    shippingRevenueMinor: prepared.shippingMinor,
    productionCostMinor,
    expectedShippingCostMinor: prepared.expectedShippingCostMinor,
    paymentFeePercent: paymentFeePercent(),
    paymentFeeFixedMinor: paymentFeeFixedMinor(),
    merchantFixedCostMinor: storeMerchantCostMinor(),
    minContributionMinor: storeMinContributionMinor(),
  });

  if (!result.profitable) {
    log.warn("checkout rejected: unprofitable order", {
      cartId: prepared.cartId,
      currency: prepared.currency,
      productSubtotalMinor: result.productRevenueMinor,
      customerShippingMinor: result.shippingRevenueMinor,
      orderRevenueMinor: result.orderRevenueMinor,
      productionCostMinor: result.productionCostMinor,
      expectedPrintifyShippingMinor: result.expectedShippingCostMinor,
      paymentFeeMinor: result.paymentFeeMinor,
      merchantCostMinor: result.merchantFixedCostMinor,
      expectedContributionMinor: result.expectedContributionMinor,
      reason: result.reason,
    });
    throw new CheckoutError("unprofitable_order");
  }
}

/**
 * Create (or safely reuse) a local order for the current cart and create the
 * matching PayPal order. The local total is authoritative; PayPal is told
 * exactly that amount.
 */
export async function beginCheckout(
  args: BeginCheckoutArgs,
  paypal: PaypalGateway = getPayPalClient(),
  shippingGateway?: ShippingGateway,
): Promise<{
  orderId: string;
  paypalOrderId: string;
  orderNumber: string;
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  currency: string;
}> {
  const addressCheck = validateShippingAddress(args.customer.country, {
    address1: args.customer.address1,
    address2: args.customer.address2,
    city: args.customer.city,
    region: args.customer.region,
    postalCode: args.customer.postalCode,
  });
  if (!addressCheck.ok) {
    throw new CheckoutError(
      addressCheck.field === "country" ? "unsupported_country" : "invalid_address",
    );
  }

  const prepared = await prepareCheckout(args.cartId, {
    destination: {
      country: addressCheck.country,
      address1: args.customer.address1,
      city: args.customer.city,
      region: args.customer.region,
      postalCode: args.customer.postalCode,
    },
    shippingGateway,
  });
  assertProfitable(prepared);

  // Reuse a previously started order for the same browser only if everything it
  // would be fulfilled with still matches — cart snapshot, contact details and
  // the full shipping address. Otherwise cancel it so it can never be paid:
  // an address-only edit keeps the same flat-rate shipping (and therefore the
  // same total), so a total/snapshot comparison alone would hand back an order
  // that ships to the customer's previous address.
  if (args.existingOrderId) {
    const existing = await db.order.findFirst({
      where: { id: args.existingOrderId, cartId: args.cartId },
      include: { items: true, payment: true },
    });
    if (existing && existing.status === "PAYMENT_PENDING") {
      const matches =
        existing.email === args.customer.email &&
        existing.recipientName === args.customer.fullName &&
        existing.address1 === args.customer.address1 &&
        (existing.address2 ?? "") === (args.customer.address2 ?? "") &&
        existing.city === args.customer.city &&
        (existing.region ?? "") === (args.customer.region ?? "") &&
        existing.postalCode === args.customer.postalCode &&
        existing.country === args.customer.country &&
        (existing.phone ?? "") === (args.customer.phone ?? "") &&
        existing.totalMinor === prepared.totalMinor &&
        snapshotKey(existing.items) === snapshotKey(prepared.lines);
      if (matches && existing.paypalOrderId) {
        return {
          orderId: existing.id,
          paypalOrderId: existing.paypalOrderId,
          orderNumber: existing.orderNumber,
          subtotalMinor: existing.subtotalMinor,
          shippingMinor: existing.shippingMinor,
          totalMinor: existing.totalMinor,
          currency: existing.currency,
        };
      }
      if (!matches) {
        await db.order.updateMany({
          where: { id: existing.id, status: "PAYMENT_PENDING" },
          data: { status: "CANCELLED" },
        });
      }
    }
  }

  const customer = args.customer;
  const order = await createLocalOrder(args.cartId, customer, prepared);

  let paypalOrder: PaypalOrder;
  try {
    paypalOrder = await paypal.createOrder({
      referenceId: order.id,
      customId: order.id,
      description: `Zitsy order ${order.orderNumber}`,
      amount: {
        currency_code: prepared.currency,
        value: toDecimalString(prepared.totalMinor),
      },
    });
  } catch (err) {
    log.error("paypal order creation failed", { orderId: order.id, err });
    throw new CheckoutError("paypal_unavailable");
  }

  if (!paypalOrder.id) {
    throw new CheckoutError("paypal_unavailable");
  }

  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: { paypalOrderId: paypalOrder.id },
    }),
    db.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: PAYPAL_PROVIDER,
        providerOrderId: paypalOrder.id,
        status: "PENDING",
        amountMinor: prepared.totalMinor,
        currency: prepared.currency,
      },
      update: {
        providerOrderId: paypalOrder.id,
        amountMinor: prepared.totalMinor,
        currency: prepared.currency,
      },
    }),
  ]);

  return {
    orderId: order.id,
    paypalOrderId: paypalOrder.id,
    orderNumber: order.orderNumber,
    subtotalMinor: prepared.subtotalMinor,
    shippingMinor: prepared.shippingMinor,
    totalMinor: prepared.totalMinor,
    currency: prepared.currency,
  };
}

async function createLocalOrder(
  cartId: string,
  customer: BeginCheckoutArgs["customer"],
  prepared: Awaited<ReturnType<typeof prepareCheckout>>,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = generateOrderNumber();
    try {
      return await db.order.create({
        data: {
          orderNumber,
          email: customer.email,
          status: "PAYMENT_PENDING",
          currency: prepared.currency,
          cartId,
          subtotalMinor: prepared.subtotalMinor,
          shippingMinor: prepared.shippingMinor,
          totalMinor: prepared.totalMinor,
          printifyQuotedShippingMinor: prepared.printifyQuotedShippingMinor,
          printifyQuotedShippingCurrency: prepared.printifyQuotedShippingCurrency,
          printifyShippingReconcileStatus:
            prepared.printifyQuotedShippingMinor === null ? "UNAVAILABLE" : "PENDING",
          recipientName: customer.fullName,
          address1: customer.address1,
          address2: customer.address2 ?? null,
          city: customer.city,
          region: customer.region ?? null,
          postalCode: customer.postalCode,
          country: customer.country,
          phone: customer.phone ?? null,
          items: {
            createMany: {
              data: prepared.lines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                printifyProductId: line.printifyProductId,
                printifyVariantId: line.printifyVariantId,
                title: line.title,
                variantTitle: line.variantTitle,
                sku: line.sku,
                quantity: line.quantity,
                unitPriceMinor: line.unitPriceMinor,
                totalPriceMinor: line.totalPriceMinor,
                currency: line.currency,
              })),
            },
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not allocate a unique order number");
}

function extractCapture(order: PaypalOrder): PaypalCapture | null {
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  return captures.find((c) => c.status === "COMPLETED") ?? captures[0] ?? null;
}

function isAlreadyCapturedError(err: unknown): boolean {
  return (
    err instanceof PayPalApiError &&
    (err.paypalName === "ORDER_ALREADY_CAPTURED" ||
      err.paypalName === "ORDER_ALREADY_COMPLETED")
  );
}

/**
 * Verify an authoritative capture against the local order before any state
 * change. A mismatch is recorded as a failure and never marks the order paid.
 */
async function verifyCaptureAgainstOrder(
  order: { id: string; currency: string; totalMinor: number },
  capture: PaypalCapture,
): Promise<void> {
  if (!capture.amount) {
    await markPaymentFailed(order.id);
    throw new CheckoutError("amount_mismatch");
  }
  if (capture.amount.currency_code !== order.currency) {
    await markPaymentFailed(order.id);
    throw new CheckoutError("currency_mismatch");
  }
  if (capture.amount.value !== toDecimalString(order.totalMinor)) {
    await markPaymentFailed(order.id);
    throw new CheckoutError("amount_mismatch");
  }
}

/**
 * Idempotently apply PAID: payment PENDING -> COMPLETED and order
 * PAYMENT_PENDING -> PAID in one transaction, then clear the cart.
 */
export async function markOrderPaid(
  orderId: string,
  capture: PaypalCapture,
): Promise<{ applied: boolean }> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (isPaidOrderStatus(order.status)) return { applied: false };

    await tx.payment.updateMany({
      where: { orderId, status: "PENDING" },
      data: {
        status: "COMPLETED",
        providerPaymentId: capture.id,
        completedAt: new Date(),
      },
    });

    const updated = await tx.order.updateMany({
      where: { id: orderId, status: "PAYMENT_PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    });

    if (updated.count === 0) return { applied: false };

    if (order.cartId) {
      await tx.cartItem.deleteMany({ where: { cartId: order.cartId } });
    }
    return { applied: true };
  });
}

export async function markPaymentFailed(orderId: string): Promise<void> {
  await db.$transaction([
    db.payment.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "FAILED" },
    }),
    db.order.updateMany({
      where: { id: orderId, status: "PAYMENT_PENDING" },
      data: { status: "PAYMENT_FAILED" },
    }),
  ]);
}

/**
 * Server-side capture + verification. The browser can request this but can
 * never declare success: the order only becomes PAID after we verify PayPal's
 * authoritative capture response (order id, amount, currency).
 */
export async function captureOrderPayment(
  orderId: string,
  paypal: PaypalGateway = getPayPalClient(),
): Promise<{ alreadyPaid: boolean }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true },
  });
  if (!order) throw new CheckoutError("order_not_found");
  if (isPaidOrderStatus(order.status)) {
    // Healing path. Notification only, and deduped: a retry can never
    // double-send (§8, §9). Fulfillment is retried too — an order that was
    // already paid when Printify was unreachable gets another attempt on every
    // later capture/webhook; both calls are idempotent and never throw.
    await notifyOrderPaid(order.id);
    await fulfillPaidOrder(order.id);
    return { alreadyPaid: true };
  }
  if (!isPayableOrderStatus(order.status)) {
    throw new CheckoutError("payment_not_payable");
  }
  if (!order.paypalOrderId) throw new CheckoutError("payment_not_payable");

  let result: PaypalOrder;
  try {
    result = await paypal.captureOrder(
      order.paypalOrderId,
      `zitsy-capture-${order.id}`,
    );
  } catch (err) {
    if (isAlreadyCapturedError(err)) {
      // A concurrent caller (or a prior attempt) already captured — fetch the
      // existing capture rather than charging again.
      result = await paypal.getOrder(order.paypalOrderId);
    } else {
      log.error("paypal capture failed", { orderId, err });
      throw new CheckoutError("capture_failed");
    }
  }

  const unit = result.purchase_units?.[0];
  if (
    unit &&
    (unit.custom_id || unit.reference_id) &&
    unit.custom_id !== order.id &&
    unit.reference_id !== order.id
  ) {
    await markPaymentFailed(order.id);
    throw new CheckoutError("payment_reference_mismatch");
  }

  const capture = extractCapture(result);
  if (!capture || capture.status !== "COMPLETED") {
    throw new CheckoutError("capture_failed");
  }

  await verifyCaptureAgainstOrder(order, capture);
  await markOrderPaid(order.id, capture);
  // Email is notification, never business truth (§9): a Resend failure here
  // must not affect the PAID order or the fulfillment that follows.
  await notifyOrderPaid(order.id);
  // Fulfillment is a separate state machine: a Printify failure here must never
  // un-pay the order, so this call is safe and never throws.
  await fulfillPaidOrder(order.id);
  return { alreadyPaid: false };
}

/**
 * Apply an already-authoritative capture (e.g. from a verified
 * `PAYMENT.CAPTURE.COMPLETED` webhook): verify amount/currency against the
 * local order, then mark paid idempotently.
 */
export async function confirmCapturedPayment(
  orderId: string,
  capture: PaypalCapture,
): Promise<{ applied: boolean }> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new CheckoutError("order_not_found");
  if (isPaidOrderStatus(order.status)) {
    // Idempotent healing: a later webhook for an order that is already paid
    // retries fulfillment (deduped, never throws) as well as the email.
    await notifyOrderPaid(order.id);
    await fulfillPaidOrder(order.id);
    return { applied: false };
  }
  if (!isPayableOrderStatus(order.status)) {
    throw new CheckoutError("payment_not_payable");
  }
  await verifyCaptureAgainstOrder(order, capture);
  const result = await markOrderPaid(order.id, capture);
  await notifyOrderPaid(order.id);
  await fulfillPaidOrder(order.id);
  return result;
}

/** Resolve a local order id from its PayPal order id (webhook lookups). */
export async function findOrderIdByPaypalOrderId(
  paypalOrderId: string,
): Promise<string | null> {
  const order = await db.order.findUnique({
    where: { paypalOrderId },
    select: { id: true },
  });
  return order?.id ?? null;
}

/** Authoritative order summary for the success page (ownership checked by caller). */
export async function getOrderSummary(
  orderId: string,
): Promise<OrderSummary | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    shippingMinor: order.shippingMinor,
    totalMinor: order.totalMinor,
    email: order.email,
    recipientName: order.recipientName,
    shipping: {
      address1: order.address1,
      address2: order.address2,
      city: order.city,
      region: order.region,
      postalCode: order.postalCode,
      country: order.country,
    },
    lines: order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      title: item.title,
      variantTitle: item.variantTitle,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalPriceMinor: item.totalPriceMinor,
    })),
    paidAt: order.paidAt,
    fulfillment: {
      status: order.fulfillmentStatus,
      printifyStatus: order.printifyStatus,
      tracking: {
        carrier: order.trackingCarrier,
        number: order.trackingNumber,
        url: order.trackingUrl,
      },
      submittedAt: order.printifySubmittedAt,
      fulfilledAt: order.printifyFulfilledAt,
    },
  };
}