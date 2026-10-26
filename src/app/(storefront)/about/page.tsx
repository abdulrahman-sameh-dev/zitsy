import Link from "next/link";

import { InfoPage } from "@/components/storefront/info-page";
import { site } from "@/lib/config/public-env";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "About",
  description:
    "What Zitsy is — a print-on-demand store for graphic apparel and lifestyle goods.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title={`What is ${site.name}?`}
      lead="A small print-on-demand store for graphic apparel and lifestyle goods — the kind of things you actually use day to day."
      updatedAt="8 October 2026"
    >
      <p>
        Zitsy sells T-shirts, hoodies, sweatshirts, tote bags, mugs, stickers and
        more. Every design is made to order: you place an order, the item is
        printed and shipped to you across the United Kingdom or Germany.
      </p>
      <h2>How ordering works</h2>
      <ol>
        <li>
          Pick a product and choose the real colour, size and options shown on
          its page.
        </li>
        <li>
          Check out securely with PayPal. Prices are shown in GBP — the price
          you see for your chosen variant is the price you pay.
        </li>
        <li>
          Your item is made to order, then packed and shipped by our
          production partners.
        </li>
        <li>
          Follow it from your order confirmation: you can track any order by
          order number and email — no account needed — or open the carrier link
          from your tracking email.
        </li>
      </ol>
      <h2>Why made to order</h2>
      <p>
        Nothing sits in a warehouse waiting for a buyer, and nothing is printed
        until it has an owner. That is kinder to surplus stock, frees us to
        offer a wider range of products, and keeps pricing simple.
      </p>
      <h2>Questions?</h2>
      <p>
        The <Link href="/contact">contact page</Link> is the fastest way to reach
        support, or you can{" "}
        <Link href="/track-order">track an existing order</Link> at any time.
      </p>
    </InfoPage>
  );
}