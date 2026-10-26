import Link from "next/link";

import { ContactForm } from "@/components/storefront/contact-form";
import { infoPageMetadata } from "@/lib/metadata";

export const metadata = infoPageMetadata({
  title: "Contact us",
  description: "Get in touch with the Zitsy team about an order or a product.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Contact us
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Questions about an order, delivery or a product? Send us a message and
        we&apos;ll reply by email.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <ContactForm />
        </div>

        <aside className="flex flex-col gap-4 text-sm">
          <div className="rounded-lg border border-line bg-canvas p-4">
            <p className="font-medium text-ink">Looking for an order?</p>
            <p className="mt-1 text-muted">
              Check its live status without an account.
            </p>
            <Link
              href="/track-order"
              className="mt-2 inline-block font-medium text-brand-700 underline"
            >
              Track your order
            </Link>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-4">
            <p className="font-medium text-ink">Before you write</p>
            <p className="mt-1 text-muted">
              Your order number helps us find things quickly — it starts with
              ZS-.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
