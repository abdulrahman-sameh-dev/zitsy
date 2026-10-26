import Link from "next/link";

import { InfoPage } from "@/components/storefront/info-page";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "Terms of service",
  description: "The terms that apply when you buy from Zitsy.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Terms of service"
      lead="The terms that apply when you order from Zitsy."
      updatedAt="8 October 2026"
    >
      <h2>1. Orders and acceptance</h2>
      <p>
        When you place an order, you receive an order confirmation email. Your
        order is accepted once payment is confirmed by PayPal and we issue your
        confirmation. Prices are in GBP and shown on the product page and at
        checkout.
      </p>
      <h2>2. Products are made to order</h2>
      <p>
        All products are printed or produced after you order. Because they are
        made specifically for you, change-of-mind returns aren’t available —
        see the <Link href="/returns">returns policy</Link> for what we do cover.
      </p>
      <h2>3. Availability</h2>
      <p>
        A product page lists the real variants that exist. If a variant becomes
        unavailable it won’t be offered. We try to keep product pages accurate,
        but prices and availability can change before checkout.
      </p>
      <h2>4. Delivery</h2>
      <p>
        We ship to the United Kingdom and Germany. Production and delivery times
        depend on the product and partner; the live status of your order is
        always visible via your tracking email or the{" "}
        <Link href="/track-order">order tracking page</Link>.
      </p>
      <h2>5. Payment and refunds</h2>
      <p>
        Secure payment is provided by PayPal. Refunds, where due (for example a
        faulty or incorrect item), are made back to the original payment method.
      </p>
      <h2>6. Our liability</h2>
      <p>
        Nothing in these terms limits liability that cannot be limited by law.
        To the extent permitted by law, our liability is limited to the price
        you paid for the affected order plus any delivery charges.
      </p>
      <h2>7. Law</h2>
      <p>
        These terms are governed by the laws of England and Wales.
      </p>
      <h2>8. Contact</h2>
      <p>
        For anything in these terms, use the{" "}
        <Link href="/contact">contact page</Link>. You can{" "}
        <Link href="/track-order">track an order</Link> at any time with just
        your order number and email.
      </p>
    </InfoPage>
  );
}