import Link from "next/link";

import { InfoPage } from "@/components/storefront/info-page";
import { site } from "@/lib/config/public-env";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "Privacy policy",
  description: "How Zitsy handles your personal data — collected, why, and who it’s shared with.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy policy"
      lead="How Zitsy handles and protects your personal data."
      updatedAt="8 October 2026"
    >
      <h2>Who this applies to</h2>
      <p>
        This policy explains what personal data {site.name} collects when you
        browse the store and place an order, and how it is used. It covers
        customers in the United Kingdom and the EU, including Germany.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Order details:</strong> your name, email address, billing and
          shipping address, and optional phone number.
        </li>
        <li>
          <strong>Payment information:</strong> payment is handled by PayPal,
          and we do not see or store your card details.
        </li>
        <li>
          <strong>Cart contents:</strong> kept briefly in your browser so a
          shopping cart survives a refresh.
        </li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>To fulfil, dispatch and deliver your orders.</li>
        <li>To send order confirmations and dispatch/tracking updates.</li>
        <li>To provide order tracking and handle support requests.</li>
        <li>To meet legal and accounting obligations.</li>
      </ul>
      <h2>Who we share it with</h2>
      <p>
        Only the services needed to run the store:
      </p>
      <ul>
        <li>
          <strong>PayPal</strong> — payment processing.
        </li>
        <li>
          <strong>Printify and its production partners</strong> — printing,
          production and shipping your order.
        </li>
        <li>
          <strong>Email delivery provider</strong> — transactional emails.
        </li>
        <li>
          <strong>Hosting provider</strong> — application and database hosting.
        </li>
      </ul>
      <p>
        We do not sell personal data, and we do not use advertising trackers.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Order records are kept for as long as needed to fulfil, support and
        account for them, and in line with accounting retention requirements.
      </p>
      <h2>Your rights</h2>
      <p>
        Depending on your location, you can ask us to access, correct, restrict,
        delete or export your personal data, and to object to processing. To
        make any such request, <Link href="/contact">contact us</Link> with your
        order number or the email address you ordered with. You can also
        complain to your local data protection authority.
      </p>
      <h2>Contact</h2>
      <p>
        For any privacy question, use the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </InfoPage>
  );
}