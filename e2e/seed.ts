import { db } from "@/lib/db/prisma";

let seq = 0;

export interface SeededOrder {
  id: string;
  orderNumber: string;
  email: string;
  productTitle: string;
  variantTitle: string;
  /** Carrier tracking number when `tracking: true` was requested. */
  trackingNumber?: string;
  trackingUrl?: string;
}

/** Wipes the dedicated E2E database so each spec starts from a known state. */
export async function resetStore(): Promise<void> {
  await db.rateLimitBucket.deleteMany();
  await db.webhookEvent.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.product.deleteMany();
}

export interface SeedOptions {
  /** Attach carrier + tracking details so the tracking panel has something to show. */
  tracking?: boolean;
}

export async function seedPaidOrder(opts: SeedOptions = {}): Promise<SeededOrder> {
  seq += 1;
  const stamp = Date.now().toString(36).toUpperCase();
  const productTitle = `E2E Tee ${stamp}-${seq}`;
  const variantTitle = "Black / M";
  const email = `buyer-${stamp}-${seq}@example.com`;

  const product = await db.product.create({
    data: {
      printifyId: `PP-E2E-${stamp}-${seq}`,
      title: productTitle,
      slug: `e2e-tee-${stamp.toLowerCase()}-${seq}`,
      currency: "GBP",
      minPriceMinor: 2500,
      variants: {
        create: [
          {
            printifyVariantId: 11,
            title: variantTitle,
            sku: `SKU-E2E-${stamp}-${seq}`,
            priceMinor: 2500,
            costMinor: 1000,
            currency: "GBP",
            isDefault: true,
          },
        ],
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];

  const order = await db.order.create({
    data: {
      orderNumber: `ZS-E2E${stamp}${seq}`,
      email,
      status: "PAID",
      currency: "GBP",
      subtotalMinor: 2500,
      shippingMinor: 0,
      totalMinor: 2500,
      paidAt: new Date(),
      placedAt: new Date(),
      recipientName: "Jane Smith",
      address1: "1 Main Street",
      city: "London",
      postalCode: "SW1A 1AA",
      country: "GB",
      paypalOrderId: `PP-E2E-${stamp}-${seq}`,
      printifyOrderId: opts.tracking ? `PFY-E2E-${stamp}-${seq}` : null,
      printifySubmittedAt: new Date(),
      fulfillmentStatus: opts.tracking ? "FULFILLED" : "SUBMITTED",
      trackingCarrier: opts.tracking ? "USPS" : null,
      trackingNumber: opts.tracking ? `TRACK-E2E-${seq}` : null,
      trackingUrl: opts.tracking ? `https://track.example/TRACK-E2E-${seq}` : null,
      items: {
        create: [
          {
            productId: product.id,
            variantId: variant.id,
            printifyProductId: product.printifyId,
            printifyVariantId: 11,
            title: productTitle,
            variantTitle,
            sku: variant.sku,
            quantity: 1,
            unitPriceMinor: 2500,
            totalPriceMinor: 2500,
            currency: "GBP",
          },
        ],
      },
      payment: {
        create: {
          provider: "paypal",
          providerOrderId: `PAYPAL-E2E-${stamp}-${seq}`,
          status: "COMPLETED",
          amountMinor: 2500,
          currency: "GBP",
          completedAt: new Date(),
        },
      },
    },
  });

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    email,
    productTitle,
    variantTitle,
    trackingNumber: opts.tracking ? `TRACK-E2E-${seq}` : undefined,
    trackingUrl: opts.tracking ? `https://track.example/TRACK-E2E-${seq}` : undefined,
  };
}
