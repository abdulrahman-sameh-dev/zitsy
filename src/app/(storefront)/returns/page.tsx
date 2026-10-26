import Link from "next/link";

import { InfoPage } from "@/components/storefront/info-page";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "Returns & refunds",
  description:
    "Zitsy returns and refunds policy for print-on-demand products.",
  path: "/returns",
});

export default function ReturnsPage() {
  return (
    <InfoPage
      eyebrow="Store information"
      title="Returns & refunds"
      lead="What you can expect if something isn’t right with your order."
      updatedAt="8 October 2026"
    >
      <h2>The short version</h2>
      <p>
        Our products are printed and made to order, so they are custom-made for
        you. Change-of-mind returns of perfectly-made items are therefore not
        something we can offer.
      </p>
      <p>
        But if something genuinely goes wrong — your item arrives damaged,
        faulty, or isn’t what you ordered — we want to put it right. Tell us soon
        after delivery (ideally within 14 days), include your order number and a
        couple of photos, and we will investigate with the production partner
        and arrange a replacement, a reprint, or a refund to your original
        payment method.
      </p>
      <h2>How to report a problem</h2>
      <ol>
        <li>
          Head to the <Link href="/track-order">order tracking page</Link> and
          find your order number.
        </li>
        <li>
          Message us on the <Link href="/contact">contact page</Link> with your
          order number, what’s wrong, and clear photos.
        </li>
        <li>
          We’ll confirm the next steps — an investigation usually takes a few
          working days.
        </li>
      </ol>
      <h2>Before you order</h2>
      <p>
        Because returns aren’t available for change of mind, it’s worth being
        sure about sizes and options up front. Each product page lists the real
        colours, sizes and options the product is made in, and our{" "}
        <Link href="/sizing">sizing guide</Link> explains what to watch for.
      </p>
    </InfoPage>
  );
}