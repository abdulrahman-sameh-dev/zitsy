import Link from "next/link";

import { InfoPage } from "@/components/storefront/info-page";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "Shipping & delivery",
  description:
    "How Zitsy delivery works — what you can expect when you order, and how to follow your parcel.",
  path: "/shipping",
});

export default function ShippingPage() {
  return (
    <InfoPage
      eyebrow="Store information"
      title="Shipping & delivery"
      lead="A plain-English run-down of what happens between you ordering and your parcel arriving."
      updatedAt="8 October 2026"
    >
      <h2>How it works</h2>
      <p>
        Our products are printed and produced to order. That means there are two
        stages after you check out: production, then shipping. You will receive
        an order confirmation right away, and emails with updates as your order
        moves through each stage.
      </p>
      <h2>Delivery regions</h2>
      <p>
        We currently deliver to <strong>the United Kingdom</strong> and{" "}
        <strong>Germany</strong>, and checkout is set up for those two markets.
      </p>
      <h2>Delivery times</h2>
      <p>
        Production and delivery times depend on the product and the production
        partner that makes it. Because our partners, products and carriers all
        vary, we deliberately do not publish a single “guaranteed by” date.
      </p>
      <p>
        The most accurate view is always the live one: once your order is
        dispatched, your tracking email includes a carrier link with the
        parcel’s current status, and you can{" "}
        <Link href="/track-order">track any order</Link> by order number and
        email.
      </p>
      <h2>If you need it by a date</h2>
      <p>
        Because production is on-demand, we cannot guarantee delivery by a
        specific date. If you have a deadline, <Link href="/contact">contact
        support before ordering</Link> and we will be honest about whether it is
        realistic.
      </p>
      <h2>Charges and duties</h2>
      <p>
        Prices are shown in GBP and, in most cases, duties and taxes for UK and
        German destinations are handled as part of the checkout or fulfilment
        process. If you have questions about import costs for either market,{" "}
        <Link href="/contact">ask us before ordering</Link>.
      </p>
    </InfoPage>
  );
}