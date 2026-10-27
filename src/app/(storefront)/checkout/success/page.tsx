import Link from "next/link";
import { connection } from "next/server";

import { PurchaseTracking } from "@/components/analytics/purchase-tracking";
import { shouldTrackPurchase } from "@/lib/analytics/purchase";
import type { FulfillmentStatus } from "@/generated/prisma/enums";
import { getOrderSummary } from "@/lib/checkout/service";
import { readOrderRef } from "@/lib/checkout/session";
import { fulfillmentLabel } from "@/lib/fulfillment/status";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage() {
  await connection();
  const orderId = await readOrderRef();
  const order = orderId ? await getOrderSummary(orderId) : null;

  if (!order) {
    return (
      <div className="container-page flex flex-col items-center gap-5 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          We couldn&apos;t find that order
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          This confirmation link is no longer valid. If you were charged, check
          your email from PayPal for your receipt.
        </p>
        <Link
          href="/shop"
          className="rounded-md bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  const paid = order.status === "PAID";

  return (
    <div
      data-clarity-mask="true"
      className="container-page max-w-2xl py-10 sm:py-14"
    >
      <PurchaseTracking
        paid={shouldTrackPurchase(order)}
        orderNumber={order.orderNumber}
        totalMinor={order.totalMinor}
        shippingMinor={order.shippingMinor}
        currency={order.currency}
        lines={order.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          productTitle: line.title,
          variantTitle: line.variantTitle,
          unitPriceMinor: line.unitPriceMinor,
          quantity: line.quantity,
          currency: order.currency,
        }))}
      />
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {paid ? "Thank you — your order is confirmed" : "Your order is pending"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {paid
          ? "We've received your payment. A confirmation will be sent to your email address."
          : "We're still confirming your payment. You'll be notified once it completes."}
      </p>

      <div className="mt-8 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-muted">Order number</span>
          <span className="font-semibold text-ink">{order.orderNumber}</span>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-muted">Status</span>
          <span className="font-semibold text-ink">
            {paid ? "Paid" : order.status.replace(/_/g, " ").toLowerCase()}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-muted">Email</span>
          <span className="font-medium text-ink">{order.email}</span>
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-3 border-b border-line pb-4">
        {order.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3 text-sm">
            <span className="text-muted">
              {line.title}
              <span className="block text-xs">{line.variantTitle}</span>
              <span className="block text-xs">Qty {line.quantity}</span>
            </span>
            <span className="whitespace-nowrap font-medium text-ink">
              {formatMoney(line.totalPriceMinor, order.currency)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-medium text-ink">
            {formatMoney(order.subtotalMinor, order.currency)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Shipping</dt>
          <dd className="font-medium text-ink">
            {order.shippingMinor === 0
              ? "Free"
              : formatMoney(order.shippingMinor, order.currency)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="font-semibold text-ink">
            {formatMoney(order.totalMinor, order.currency)}
          </dd>
        </div>
      </dl>

      {paid ? (
        <>
          <div className="mt-6 rounded-md border border-line bg-surface px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Fulfillment</span>
              <span className="font-medium text-ink">
                {fulfillmentLabel(order.fulfillment.status as FulfillmentStatus)}
              </span>
            </div>
            {order.fulfillment.tracking.number ? (
              <div className="mt-2 flex justify-between">
                <span className="text-muted">Tracking</span>
                <span className="font-medium text-ink">
                  {order.fulfillment.tracking.url ? (
                    <a
                      className="text-brand-700 underline"
                      href={order.fulfillment.tracking.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {order.fulfillment.tracking.carrier ?? "Track"}{" "}
                      {order.fulfillment.tracking.number}
                    </a>
                  ) : (
                    `${order.fulfillment.tracking.carrier ?? ""} ${
                      order.fulfillment.tracking.number
                    }`.trim()
                  )}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-8 rounded-md bg-canvas-deep px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">What happens next</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
              <li>Your item is printed and produced to order.</li>
              <li>We email you when it&apos;s dispatched, with live carrier tracking.</li>
              <li>
                Track it any time using your order number ({order.orderNumber}) and
                email — no account needed.
              </li>
            </ol>
          </div>
        </>
      ) : null}

      <div className="mt-8 text-sm text-muted">
        <h2 className="font-semibold text-ink">Shipping to</h2>
        <p className="mt-1">
          {order.recipientName}
          <br />
          {order.shipping.address1}
          {order.shipping.address2 ? (
            <>
              <br />
              {order.shipping.address2}
            </>
          ) : null}
          <br />
          {order.shipping.city}
          {order.shipping.region ? `, ${order.shipping.region}` : ""}
          <br />
          {order.shipping.postalCode}
          <br />
          {order.shipping.country}
        </p>
      </div>

      {paid ? (
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/track-order" className="btn-primary">
            Track your order
          </Link>
          <Link href="/shop" className="btn-secondary">
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/shop" className="btn-primary">
            Continue shopping
          </Link>
          <p className="text-xs text-muted">
            Tracking will be available once payment completes.
          </p>
        </div>
      )}
    </div>
  );
}