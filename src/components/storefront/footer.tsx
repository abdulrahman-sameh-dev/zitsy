import Link from "next/link";

import { ConsentSettingsButton } from "@/components/analytics/consent-settings-button";
import { Logo } from "@/components/brand/logo";
import { hasAnalyticsProviders, site } from "@/lib/config/public-env";

const CATEGORY_LINKS = [
  { name: "All products", href: "/shop" },
  { name: "T-Shirts", href: "/shop?category=t-shirts" },
  { name: "Hoodies", href: "/shop?category=hoodies" },
  { name: "Sweatshirts", href: "/shop?category=sweatshirts" },
  { name: "Tote Bags", href: "/shop?category=totes" },
  { name: "Mugs", href: "/shop?category=mugs" },
  { name: "Stickers", href: "/shop?category=stickers" },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-card-dark-line bg-card-dark">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo tone="light" href="/" className="inline-flex" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-light">
            Graphic apparel & lifestyle goods, made to order and delivered
            across the UK and Germany.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-muted-light">
            <li>Products are printed after you order.</li>
            <li>Delivery regions: United Kingdom and Germany.</li>
            <li>Payments are handled securely at checkout.</li>
          </ul>
        </div>

        <nav aria-label="Shop">
          <p className="text-sm font-semibold text-canvas">Shop</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {CATEGORY_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-muted-light transition-colors hover:text-brand-300"
                >
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Help">
          <p className="text-sm font-semibold text-canvas">Help</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link
                href="/track-order"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Track Order
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Contact Us
              </Link>
            </li>
            <li>
              <Link
                href="/shipping"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Shipping &amp; delivery
              </Link>
            </li>
            <li>
              <Link
                href="/returns"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Returns &amp; refunds
              </Link>
            </li>
            <li>
              <Link
                href="/sizing"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Sizing guide
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Company">
          <p className="text-sm font-semibold text-canvas">Company</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link
                href="/about"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                About {site.name}
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Privacy policy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-muted-light transition-colors hover:text-brand-300"
              >
                Terms of service
              </Link>
            </li>
            {hasAnalyticsProviders() ? (
              <li>
                <ConsentSettingsButton className="text-muted-light transition-colors hover:text-brand-300" />
              </li>
            ) : null}
          </ul>
        </nav>
      </div>

      <div className="border-t border-card-dark-line">
        <div className="container-page flex flex-col gap-1 py-5 text-xs text-muted-light sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}. All rights reserved.
          </p>
          <p>Prices in GBP · Payments by PayPal</p>
        </div>
      </div>
    </footer>
  );
}