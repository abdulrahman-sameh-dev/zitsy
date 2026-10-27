import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  findOrderByTrackingToken,
  toTrackingView,
  type TrackingView,
} from "@/lib/orders/tracking";
import { formatMoney } from "@/lib/money";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
};

function Steps({ steps }: { steps: TrackingView["steps"] }) {
  return (
    <ol className="mt-6 flex flex-col gap-1">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.key} className="relative flex items-start gap-3 pb-0.5 text-sm">
            {!isLast ? (
              <span
                aria-hidden="true"
                className="absolute left-3 top-6 bottom-1 w-px bg-line"
              />
            ) : null}
            <span
              aria-hidden
              className={
                step.state === "done"
                  ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white"
                  : step.state === "current"
                    ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-700 bg-surface"
                    : "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface"
              }
            >
              {step.state === "done" ? "✓" : ""}
            </span>
            <span
              className={
                step.state === "todo" ? "text-muted" : "font-medium text-ink"
              }
            >
              {step.label}
              {step.at ? (
                <span className="block text-xs font-normal text-muted">
                  {DATE_FORMAT.format(step.at)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function TrackOrderDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;

  const order = await findOrderByTrackingToken(token);
  if (!order) notFound();

  const view = toTrackingView(order);

  return (
    <div data-clarity-mask="true" className="container-page max-w-2xl py-10 sm:py-14">
      <p className="text-sm text-muted">Order</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {view.orderNumber}
        </h1>
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-ink">
          {view.fulfillmentLabel}
        </span>
      </div>

      <Steps steps={view.steps} />

      <dl className="mt-8 grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface p-5 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted">Order status</dt>
          <dd className="font-medium text-ink sm:mt-0.5">{view.statusLabel}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted">Payment status</dt>
          <dd className="font-medium text-ink sm:mt-0.5">{view.paymentLabel}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted">Fulfillment status</dt>
          <dd className="font-medium text-ink sm:mt-0.5">{view.fulfillmentLabel}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted">Last updated</dt>
          <dd className="font-medium text-ink sm:mt-0.5">
            {TIME_FORMAT.format(view.lastUpdated)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted">Order date</dt>
          <dd className="font-medium text-ink sm:mt-0.5">
            {DATE_FORMAT.format(view.placedAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <dt className="text-muted">Shipping to</dt>
          <dd className="font-medium text-ink sm:mt-0.5">
            {view.destination.city}, {view.destination.countryName}
          </dd>
        </div>
      </dl>

      {view.tracking ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5 text-sm">
          <p className="font-semibold text-ink">Tracking</p>
          <div className="mt-2 flex flex-col gap-1 text-muted">
            {view.tracking.carrier ? (
              <p>
                Carrier: <span className="font-medium text-ink">{view.tracking.carrier}</span>
              </p>
            ) : null}
            {view.tracking.number ? (
              <p>
                Tracking number:{" "}
                <span className="font-medium text-ink">{view.tracking.number}</span>
              </p>
            ) : null}
            {view.tracking.url ? (
              <a
                href={view.tracking.url}
                rel="noreferrer"
                target="_blank"
                className="mt-1 font-medium text-brand-700 underline"
              >
                Open carrier tracking
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <ul className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
        {view.items.map((item) => (
          <li key={`${item.title}-${item.variantTitle}`} className="flex gap-4">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.title}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-md border border-line object-cover"
              />
            ) : (
              <span className="h-14 w-14 shrink-0 rounded-md border border-line bg-surface" />
            )}
            <div className="flex flex-1 justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium text-ink">{item.title}</p>
                <p className="text-muted">{item.variantTitle}</p>
                <p className="text-muted">Qty {item.quantity}</p>
              </div>
              <p className="whitespace-nowrap text-sm font-medium text-ink">
                {formatMoney(item.totalPriceMinor, view.currency)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-medium text-ink">
            {formatMoney(view.subtotalMinor, view.currency)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Shipping</dt>
          <dd className="font-medium text-ink">
            {view.shippingMinor === 0
              ? "Free"
              : formatMoney(view.shippingMinor, view.currency)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="font-semibold text-ink">
            {formatMoney(view.totalMinor, view.currency)}
          </dd>
        </div>
      </dl>

      <p className="mt-8 text-sm text-muted">
        Something not right?{" "}
        <Link href="/contact" className="font-medium text-brand-700 underline">
          Contact us
        </Link>{" "}
        and we&apos;ll take a look.
      </p>
    </div>
  );
}
