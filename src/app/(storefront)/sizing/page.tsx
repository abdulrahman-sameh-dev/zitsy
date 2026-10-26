import Link from "next/link";

import { InfoPage } from "@/components/storefront/info-page";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "Sizing guide",
  description:
    "How to choose the right size for Zitsy apparel — an honest guide, given sizes vary by product.",
  path: "/sizing",
});

export default function SizingPage() {
  return (
    <InfoPage
      eyebrow="Store information"
      title="Sizing guide"
      lead="How to pick the right size when every product is printed on a different garment."
      updatedAt="8 October 2026"
    >
      <h2>Why sizes vary</h2>
      <p>
        Our apparel is produced across different garment brands. That means a
        hoodie from one production partner can fit slightly differently to a
        hoodie from another, even when both are labelled the same size.
      </p>
      <p>
        We therefore don’t publish one universal measurement chart — a chart
        would imply measurements we can’t guarantee for every product.
      </p>
      <h2>What we do differently</h2>
      <ul>
        <li>
          Every product page shows the real sizes that product is made in — you
          can only ever choose options that genuinely exist.
        </li>
        <li>
          Where a product has a choice of fits (for example “Regular fit”), the
          sizing option labels reflect that.
        </li>
      </ul>
      <h2>Practical advice</h2>
      <ul>
        <li>
          If you can, compare against a garment you already own and know.
        </li>
        <li>
          When you’re between two sizes, most of our clothing runs close to
          standard retail sizing and erring up usually gives a more relaxed,
          wearable fit.
        </li>
        <li>
          When in doubt, <Link href="/contact">ask us</Link> before you order —
          we’d rather help you pick the right size than sort out an exchange.
        </li>
      </ul>
      <h2>Returns reminder</h2>
      <p>
        Apparel is made to order, so a change-of-mind return isn’t available
        for a size you simply don’t like. See our{" "}
        <Link href="/returns">returns policy</Link> for the full picture.
      </p>
    </InfoPage>
  );
}