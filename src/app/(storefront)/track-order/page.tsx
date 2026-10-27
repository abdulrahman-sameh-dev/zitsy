import { TrackLookupForm } from "@/components/storefront/track-lookup-form";

export const metadata = {
  title: "Track your order",
  description: "Check the status of a Zitsy order without an account.",
  robots: { index: false, follow: false },
};

export default function TrackOrderPage() {
  return (
    <div data-clarity-mask="true" className="container-page max-w-xl py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Track your order
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Enter the order number from your confirmation email together with the
        email address you used at checkout. No account needed.
      </p>

      <div className="mt-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <TrackLookupForm />
      </div>

      <div className="mt-6 rounded-lg border border-line bg-canvas p-5 text-sm leading-relaxed text-muted">
        <p className="font-medium text-ink">Where do I find my order number?</p>
        <p className="mt-1">
          It starts with <span className="font-semibold text-ink">ZS-</span> and
          is included in your payment confirmation and every email we send about
          your order.
        </p>
      </div>
    </div>
  );
}
