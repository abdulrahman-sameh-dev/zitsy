import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CheckoutForm } from "@/components/checkout/checkout-form";
import { loadCartView } from "@/lib/cart/read";
import { paypalClientId } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Enter your delivery details and pay securely with PayPal.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  await connection();
  const cart = await loadCartView();

  if (cart.lines.length === 0) {
    return (
      <div className="container-page flex flex-col items-center gap-5 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Your cart is empty
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          Add something to your cart before checking out.
        </p>
        <Link href="/shop" className="btn-primary">
          Browse products
        </Link>
      </div>
    );
  }

  if (!cart.canCheckout) {
    return (
      <div className="container-page flex flex-col items-center gap-5 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Your cart needs attention
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          Some items are unavailable or have changed. Please review your cart to
          continue.
        </p>
        <Link href="/cart" className="btn-primary">
          Review cart
        </Link>
      </div>
    );
  }

  const shippingMinor = 0;
  const totalMinor = cart.subtotalMinor + shippingMinor;

  return (
    <div data-clarity-mask="true" className="container-page py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Checkout
      </h1>
      <p className="mt-2 text-sm text-muted">
        Enter your delivery details, then pay securely with PayPal. Shipping is
        confirmed as part of checkout.
      </p>
      <div className="mt-8">
        <CheckoutForm
          lines={cart.lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            title: line.productTitle,
            variantTitle: line.variantTitle,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            totalPriceMinor: line.lineTotalMinor,
            currency: line.currency,
          }))}
          subtotalMinor={cart.subtotalMinor}
          shippingMinor={shippingMinor}
          totalMinor={totalMinor}
          currency={cart.currency}
          paypalClientId={paypalClientId()}
        />
      </div>
    </div>
  );
}