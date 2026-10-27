"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { trackEvent } from "@/lib/analytics/client";
import { ecommerceParams } from "@/lib/analytics/events";
import { beginCheckoutAction, captureCheckoutAction, quoteCheckoutAction } from "@/lib/checkout/actions";
import { createOrderCallback } from "@/lib/checkout/paypal-buttons";
import { formatMoney } from "@/lib/money";

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        style?: Record<string, string>;
        createOrder: () => Promise<string>;
        onApprove: () => Promise<void>;
        onCancel?: () => void;
        onError?: (err: unknown) => void;
      }) => { render: (el: HTMLElement) => void };
    };
  }
}

export interface CheckoutSummaryLine {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  quantity: number;
  unitPriceMinor: number;
  totalPriceMinor: number;
  currency: string;
}

export interface CheckoutFormProps {
  lines: CheckoutSummaryLine[];
  subtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  currency: string;
  paypalClientId: string;
}

const COUNTRIES = [
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
] as const;

type Fields = {
  fullName: string;
  email: string;
  country: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  phone: string;
};

const EMPTY: Fields = {
  fullName: "",
  email: "",
  country: "GB",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postalCode: "",
  phone: "",
};

function Field({
  label,
  name,
  value,
  onChange,
  required,
  type = "text",
  autoComplete,
  disabled,
}: {
  label: string;
  name: keyof Fields;
  value: string;
  onChange: (name: keyof Fields, value: string) => void;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(event) => onChange(name, event.target.value)}
        className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand-500 disabled:opacity-60"
      />
    </label>
  );
}

export function CheckoutForm({
  lines,
  subtotalMinor,
  shippingMinor,
  totalMinor,
  currency,
  paypalClientId,
}: CheckoutFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // `key` records the checkout inputs the quote was computed for, so a quote
  // can never be presented as current after the address or cart changes.
  const [quote, setQuote] = useState({
    key: "",
    subtotalMinor,
    shippingMinor,
    totalMinor,
  });
  const [quoteError, setQuoteError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const update = (name: keyof Fields, value: string) =>
    setFields((prev) => ({ ...prev, [name]: value }));

  const quotable =
    fields.address1.trim().length >= 3 &&
    fields.city.trim().length > 0 &&
    fields.postalCode.trim().length >= 3;

  const quoteKey = [
    fields.country,
    fields.address1,
    fields.city,
    fields.region,
    fields.postalCode,
    subtotalMinor,
  ].join("|");
  const quoteFresh = quotable && quote.key === quoteKey;
  const awaitingQuote = quotable && !quoteFresh;
  const activeQuoteError =
    quoteError && quoteError.key === quoteKey ? quoteError.message : null;
  // Once PayPal has an order, the address that order was priced for is fixed.
  const addressLocked = paypalOrderId !== null;

  useEffect(() => {
    if (!quotable) return;
    let active = true;
    const handle = setTimeout(async () => {
      const result = await quoteCheckoutAction(fields);
      if (!active) return;
      if (result.ok) {
        setQuoteError(null);
        setQuote({
          key: quoteKey,
          subtotalMinor: result.subtotalMinor,
          shippingMinor: result.shippingMinor,
          totalMinor: result.totalMinor,
        });
      } else {
        // A failed quote is never presented as a price: it blocks payment and
        // shows a customer-safe message instead of a stale amount.
        setQuote({
          key: quoteKey,
          subtotalMinor,
          shippingMinor: 0,
          totalMinor: subtotalMinor,
        });
        setQuoteError({ key: quoteKey, message: result.error });
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, quotable]);

  const shownShipping = quoteFresh ? quote.shippingMinor : 0;
  const shownTotal = quoteFresh ? quote.totalMinor : quote.subtotalMinor;
  const canContinue =
    quotable && quoteFresh && !activeQuoteError && !starting && !addressLocked;

  async function startPayment() {
    setError(null);
    setStatus(null);
    setStarting(true);
    try {
      const result = await beginCheckoutAction(fields);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The server total is authoritative: refresh the summary so what the
      // customer sees is exactly what PayPal is about to charge.
      setQuote({
        key: quoteKey,
        subtotalMinor: result.subtotalMinor,
        shippingMinor: result.shippingMinor,
        totalMinor: result.totalMinor,
      });
      setPaypalOrderId(result.paypalOrderId);
      trackEvent("begin_checkout", {
        ...ecommerceParams(
          lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            productTitle: line.title,
            variantTitle: line.variantTitle,
            unitPriceMinor: line.unitPriceMinor,
            quantity: line.quantity,
            currency: line.currency,
          })),
        ),
        value: result.totalMinor / 100,
        shipping: result.shippingMinor / 100,
      });
    } finally {
      setStarting(false);
    }
  }

  function changeAddress() {
    setPaypalOrderId(null);
    setError(null);
    setStatus(null);
  }

  useEffect(() => {
    if (!paypalOrderId || !paypalClientId) return;
    const activeOrderId: string = paypalOrderId;
    let cancelled = false;

    function render() {
      const container = containerRef.current;
      if (cancelled || !container || !window.paypal) return;
      container.innerHTML = "";
      window.paypal
        .Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay" },
          createOrder: createOrderCallback(activeOrderId),
          onApprove: async () => {
            setStatus("Confirming your payment…");
            const result = await captureCheckoutAction();
            if (!result.ok) {
              setError(result.error);
              setStatus(null);
              return;
            }
            router.push(`/checkout/success?order=${encodeURIComponent(result.orderId)}`);
          },
          onCancel: () => setStatus("Payment cancelled. You have not been charged."),
          onError: () => setError("We could not complete the payment. Please try again."),
        })
        .render(container);
    }

    const existing = document.getElementById("paypal-sdk") as HTMLScriptElement | null;
    if (existing && window.paypal) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const script = existing ?? document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      paypalClientId,
    )}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;
    script.addEventListener("load", render);
    if (!existing) document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [paypalOrderId, paypalClientId, currency, router]);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">Delivery details</h2>
          <Field label="Full name" name="fullName" value={fields.fullName} onChange={update} required autoComplete="name" disabled={addressLocked} />
          <Field label="Email" name="email" type="email" value={fields.email} onChange={update} required autoComplete="email" disabled={addressLocked} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Country<span className="text-red-600"> *</span>
            </span>
            <select
              name="country"
              value={fields.country}
              disabled={addressLocked}
              onChange={(event) => update("country", event.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-brand-500 disabled:opacity-60"
            >
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </label>
          <Field label="Address line 1" name="address1" value={fields.address1} onChange={update} required autoComplete="address-line1" disabled={addressLocked} />
          <Field label="Address line 2" name="address2" value={fields.address2} onChange={update} autoComplete="address-line2" disabled={addressLocked} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" name="city" value={fields.city} onChange={update} required autoComplete="address-level2" disabled={addressLocked} />
            <Field label="County / Region" name="region" value={fields.region} onChange={update} autoComplete="address-level1" disabled={addressLocked} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Postcode" name="postalCode" value={fields.postalCode} onChange={update} required autoComplete="postal-code" disabled={addressLocked} />
            <Field label="Phone" name="phone" type="tel" value={fields.phone} onChange={update} autoComplete="tel" disabled={addressLocked} />
          </div>
        </section>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">Order summary</h2>
        <ul className="flex flex-col gap-3 border-b border-line pb-4">
          {lines.map((line, index) => (
            <li key={index} className="flex justify-between gap-3 text-sm">
              <span className="text-muted">
                {line.title}
                <span className="block text-xs">{line.variantTitle}</span>
                <span className="block text-xs">Qty {line.quantity}</span>
              </span>
              <span className="whitespace-nowrap font-medium text-ink">
                {formatMoney(line.totalPriceMinor, line.currency)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="font-medium text-ink">
              {formatMoney(quote.subtotalMinor, currency)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Shipping</dt>
            <dd className="font-medium text-ink">
              {awaitingQuote
                ? "Calculating…"
                : activeQuoteError
                  ? "Unavailable"
                  : shownShipping > 0
                    ? formatMoney(shownShipping, currency)
                    : "Enter your address"}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base">
            <dt className="font-semibold text-ink">Total</dt>
            <dd className="font-semibold text-ink">
              {awaitingQuote
                ? "Calculating…"
                : activeQuoteError
                  ? "—"
                  : formatMoney(shownTotal, currency)}
            </dd>
          </div>
        </dl>

        {activeQuoteError ? (
          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {activeQuoteError}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {status ? <p className="text-sm text-muted">{status}</p> : null}

        {!paypalOrderId ? (
          <button
            type="button"
            onClick={startPayment}
            disabled={!canContinue}
            className="rounded-md bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
          >
            {starting ? "Starting payment…" : "Continue to payment"}
          </button>
        ) : !paypalClientId ? (
          <p className="text-sm text-amber-700">
            Payment is temporarily unavailable. Please try again shortly.
          </p>
        ) : (
          <div ref={containerRef} />
        )}

        {addressLocked ? (
          <button
            type="button"
            onClick={changeAddress}
            className="text-left text-xs font-medium text-muted underline transition-colors hover:text-ink"
          >
            Use a different delivery address
          </button>
        ) : null}

        <p className="text-xs leading-relaxed text-muted">
          Payments are processed securely by PayPal. Zitsy never sees your card
          details.
        </p>
      </aside>
    </div>
  );
}