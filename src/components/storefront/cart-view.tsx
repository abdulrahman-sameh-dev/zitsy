"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  CONSENT_CHANGED_EVENT,
  hasAnalyticsConsent,
  trackEvent,
} from "@/lib/analytics/client";
import { ecommerceParams } from "@/lib/analytics/events";
import type { AnalyticsLineInput } from "@/lib/analytics/events";
import { LogoMark } from "@/components/brand/logo";
import {
  clearCartAction,
  removeCartItem,
  updateCartItem,
} from "@/lib/cart/actions";
import type { CartLineView, CartView as CartViewModel } from "@/lib/cart/view";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

function analyticsLine(
  line: CartLineView,
  quantity = line.quantity,
): AnalyticsLineInput {
  return {
    productId: line.productId,
    variantId: line.variantId,
    productTitle: line.productTitle,
    variantTitle: line.variantTitle,
    unitPriceMinor: line.unitPriceMinor,
    quantity,
    currency: line.currency,
  };
}

function reasonLabel(line: CartLineView): string {
  switch (line.unavailableReason) {
    case "product_hidden":
      return "No longer available";
    case "variant_disabled":
      return "No longer sold";
    case "variant_unavailable":
      return "Out of stock";
    default:
      return "Unavailable";
  }
}

function QuantityStepper({
  line,
  pending,
  onChange,
}: {
  line: CartLineView;
  pending: boolean;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={pending || line.quantity <= 1}
        onClick={() => onChange(line.quantity - 1)}
        className="h-9 w-9 rounded-md border border-line text-lg leading-none text-ink transition-colors hover:border-brand-400 disabled:opacity-40"
      >
        −
      </button>
      <span
        aria-live="polite"
        className="w-8 text-center text-sm font-semibold tabular-nums text-ink"
      >
        {line.quantity}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={pending || line.quantity >= 99}
        onClick={() => onChange(line.quantity + 1)}
        className="h-9 w-9 rounded-md border border-line text-lg leading-none text-ink transition-colors hover:border-brand-400 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function CartLineRow({
  line,
  onError,
}: {
  line: CartLineView;
  onError: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex gap-4 border-b border-line py-5 last:border-b-0">
      <Link
        href={`/product/${line.productSlug}`}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface"
      >
        {line.imageSrc ? (
          <Image
            src={line.imageSrc}
            alt=""
            fill
            sizes="80px"
            className="object-contain"
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/product/${line.productSlug}`}
          className="truncate font-medium text-ink transition-colors hover:text-brand-700"
        >
          {line.productTitle}
        </Link>
        <p className="text-sm text-muted">{line.variantTitle}</p>

        {!line.available ? (
          <p className="text-sm font-medium text-amber-700">
            {reasonLabel(line)} — remove to continue.
          </p>
        ) : null}

        {line.priceChanged ? (
          <p className="text-xs text-amber-700">
            Price changed from{" "}
            {formatMoney(line.recordedPriceMinor, line.currency)} to{" "}
            {formatMoney(line.unitPriceMinor, line.currency)}
          </p>
        ) : null}

        <p className="text-sm font-semibold text-ink">
          {formatMoney(line.lineTotalMinor, line.currency)}
        </p>

        <div className="mt-2 flex items-center gap-4">
          {line.available ? (
            <QuantityStepper
              line={line}
              pending={pending}
              onChange={(quantity) =>
                startTransition(async () => {
                  const result = await updateCartItem({
                    itemId: line.itemId,
                    quantity,
                  });
                  if (!result.ok) {
                    onError(result.error);
                    return;
                  }
                  const delta = quantity - line.quantity;
                  if (delta !== 0) {
                    trackEvent(
                      delta > 0 ? "add_to_cart" : "remove_from_cart",
                      ecommerceParams([analyticsLine(line, Math.abs(delta))]),
                    );
                  }
                })
              }
            />
          ) : (
            <span className="text-sm font-medium text-zinc-600">
              {reasonLabel(line)}
            </span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeCartItem({ itemId: line.itemId });
                if (!result.ok) {
                  onError(result.error);
                  return;
                }
                trackEvent(
                  "remove_from_cart",
                  ecommerceParams([analyticsLine(line)]),
                );
              })
            }
            className="text-sm text-muted underline-offset-4 transition-colors hover:text-brand-700 hover:underline disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function CartView({ cart }: { cart: CartViewModel }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trackedCartView = useRef(false);
  const analyticsLines = useMemo(
    () =>
      cart.lines
        .filter((line) => line.available)
        .map((line) => analyticsLine(line)),
    [cart.lines],
  );

  useEffect(() => {
    if (analyticsLines.length === 0) return;
    const send = () => {
      if (trackedCartView.current || !hasAnalyticsConsent()) return;
      trackedCartView.current = true;
      trackEvent("view_cart", ecommerceParams(analyticsLines));
    };
    send();
    window.addEventListener(CONSENT_CHANGED_EVENT, send);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, send);
  }, [analyticsLines]);

  if (cart.lines.length === 0) {
    return (
      <div className="container-page flex flex-col items-center gap-5 py-24 text-center">
        <LogoMark className="h-14 w-14 text-brand-200" />
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Your cart is empty
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          Browse the catalogue and add something you like. Your cart is saved on
          this device.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="btn-primary">
            Browse products
          </Link>
          <Link href="/track-order" className="btn-secondary">
            Track an existing order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page mx-auto max-w-2xl py-10 sm:py-14">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Your cart
        </h1>
        <p className="text-sm text-muted">
          {cart.totalQuantity} item{cart.totalQuantity === 1 ? "" : "s"}
        </p>
      </div>

      {message ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {message}
        </p>
      ) : null}

      <ul className="mt-6 border-t border-line">
        {cart.lines.map((line) => (
          <CartLineRow key={line.itemId} line={line} onError={setMessage} />
        ))}
      </ul>

      {cart.hasUnavailable ? (
        <p className="mt-4 text-sm font-medium text-amber-700">
          Remove unavailable items to continue to checkout.
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
        <span className="text-sm font-medium text-ink">Subtotal</span>
        <span className="text-lg font-semibold text-ink">
          {formatMoney(cart.subtotalMinor, cart.currency)}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Shipping and any applicable charges are confirmed at checkout.
      </p>

      <div className="mt-6 flex items-center justify-between gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await clearCartAction();
              if (!result.ok) setMessage(result.error);
            })
          }
          className="text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-40"
        >
          Clear cart
        </button>

        <Link
          href="/checkout"
          aria-disabled={!cart.canCheckout}
          onClick={(event) => {
            if (!cart.canCheckout) event.preventDefault();
          }}
          className={cn(
            "rounded-md px-6 py-3 text-sm font-semibold text-white transition-colors",
            cart.canCheckout
              ? "bg-brand-700 hover:bg-brand-800"
              : "cursor-not-allowed bg-zinc-300 text-zinc-500",
          )}
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}