import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";

import { ProductCard } from "@/components/storefront/product-card";
import { ProductGridSkeleton } from "@/components/storefront/product-grid-skeleton";
import { deriveCategoryForProduct } from "@/lib/catalog/categories";
import {
  getCategorySummaries,
  getFeaturedProducts,
  getHeroProductSummary,
} from "@/lib/catalog/query";
import { site } from "@/lib/config/public-env";
import { formatMoney } from "@/lib/money";
import type { ProductSummary } from "@/lib/catalog/query";

export const metadata: Metadata = {
  title: {
    absolute: `${site.name} — Graphic apparel & lifestyle goods, made to order`,
  },
  description:
    "Shop Zitsy for graphic T-shirts, hoodies, sweatshirts, tote bags, mugs and stickers — pre-designed styles made to order and delivered across the UK and Germany.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: `${site.url}/`,
    siteName: site.name,
    locale: "en_GB",
    title: `${site.name} — Graphic apparel & lifestyle goods, made to order`,
    description:
      "Pre-designed graphic apparel and lifestyle goods, made to order and delivered across the UK and Germany.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: site.name }],
  },
};

const HERO_SLUG =
  "dragon-silhouette-sweatshirt-vertical-flying-dragon-minimal-black-grap";

async function HomeHero() {
  await connection();
  const [featured] = await getFeaturedProducts(1);
  const hero = (await getHeroProductSummary(HERO_SLUG)) ?? featured;

  return (
    <section className="container-page">
      <div className="relative overflow-hidden rounded-3xl bg-brand-950 text-canvas">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: "radial-gradient(circle, #7bf1a8 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-700/30 blur-3xl"
        />
        <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:gap-16 lg:p-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-700 bg-brand-900/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-200">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Made to order · Ships to GB &amp; DE
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Good things, made when you want them.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-brand-100/90">
              T-shirts, sweatshirts, tote bags and mugs with bold graphics —
              pre-designed styles produced after you order and delivered across
              the UK and Germany.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shop" className="btn-primary">
                Shop everything
              </Link>
              <Link href="/track-order" className="btn-ghost-light border border-brand-800">
                Track your order
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/90">
              <li className="flex items-center gap-2">
                <CheckIcon /> Secure checkout by PayPal
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon /> Order tracking, no account needed
              </li>
            </ul>
          </div>

          {hero && hero.imageSrc ? (
            <div className="relative mx-auto w-full max-w-md">
              <div
                aria-hidden="true"
                className="absolute -left-3 top-6 h-10 w-10 rounded-full border border-brand-700"
              />
              <div
                aria-hidden="true"
                className="absolute -right-3 bottom-8 h-6 w-6 rounded-full bg-brand-400/80"
              />
              <div className="relative overflow-hidden rounded-2xl border border-brand-800 bg-brand-900">
                <div className="relative aspect-square w-full">
                  <Image
                    src={hero.imageSrc}
                    alt={hero.title}
                    loading="eager"
                    fill
                    priority
                    sizes="(min-width: 1024px) 42vw, 100vw"
                    className="object-contain"
                  />
                </div>
                <div className="absolute left-4 top-4 rounded-full border border-brand-700 bg-brand-900/80 px-3 py-1 text-xs font-semibold text-brand-200 backdrop-blur">
                  {deriveCategoryForProduct(hero.tags).name}
                </div>
                <div className="absolute bottom-4 left-4 rounded-full bg-brand-100 px-3 py-1.5 text-sm font-semibold text-brand-900 backdrop-blur">
                  From {formatMoney(hero.minPriceMinor, hero.currency)}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto hidden aspect-square w-full max-w-md items-center justify-center rounded-2xl border border-dashed border-brand-800 text-sm text-brand-100/80 lg:flex">
              Products are on the way.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <section className="container-page">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-5">
          <div className="h-7 w-56 animate-pulse rounded-full bg-canvas-deep" />
          <div className="h-12 w-4/5 animate-pulse rounded bg-canvas-deep" />
          <div className="h-12 w-3/5 animate-pulse rounded bg-canvas-deep" />
          <div className="h-5 w-4/5 animate-pulse rounded bg-canvas-deep" />
          <div className="flex gap-3">
            <div className="h-11 w-40 animate-pulse rounded-md bg-canvas-deep" />
            <div className="h-11 w-40 animate-pulse rounded-md bg-canvas-deep" />
          </div>
        </div>
        <div className="aspect-square w-full animate-pulse rounded-2xl bg-canvas-deep" />
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-brand-400"
    >
      <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

async function FeaturedProducts({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) return null;
  return (
    <section className="container-page">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Featured products
          </h2>
          <p className="mt-1 text-sm text-muted">
            A starting point across the catalogue — made to order.
          </p>
        </div>
        <Link
          href="/shop"
          className="text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {products.map((product, index) => (
          <ProductCard key={product.slug} product={product} priority={index === 0} />
        ))}
      </div>
    </section>
  );
}

function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-line bg-surface"
        >
          <div className="aspect-square w-full animate-pulse bg-brand-50" />
          <div className="p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-canvas" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function CategoryGrid() {
  await connection();
  const categories = await getCategorySummaries();
  if (categories.length === 0) return null;
  return (
    <section className="container-page">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-ink">
        Shop by category
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/shop?category=${encodeURIComponent(category.slug)}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-[0_14px_30px_-18px_rgba(3,46,21,0.35)]"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-brand-50">
              {category.imageSrc ? (
                <div className="absolute inset-[6%]">
                  <Image
                    src={category.imageSrc}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="object-contain transition-transform duration-300 motion-safe:group-hover:scale-[1.04]"
                  />
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="text-sm font-semibold text-ink">{category.name}</span>
              <span className="text-xs text-muted">
                {category.productCount} {category.productCount === 1 ? "item" : "items"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 py-14">
      <Suspense fallback={<HeroSkeleton />}>
        <HomeHero />
      </Suspense>

      <section className="container-page">
        <Suspense fallback={<ProductGridSkeleton />}>
          <FeaturedLoader />
        </Suspense>
      </section>

      <Suspense fallback={<div className="container-page"><CategoryGridSkeleton /></div>}>
        <CategoryGrid />
      </Suspense>

      <section className="border-y border-line bg-surface">
        <div className="container-page grid gap-8 py-12 sm:grid-cols-3">
          <div>
            <h3 className="text-lg font-semibold text-ink">Made to order</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Nothing sits in a warehouse. Your item is produced after you order,
              so nothing is wasted.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">Real options only</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The colours and sizes shown for each product are the real options
              it is made in.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">Clear, simple pricing</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Prices are shown in GBP. The price you see for a variant is the
              price you pay.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-brand-950 text-canvas">
        <div className="container-page flex flex-col gap-8 py-10 lg:flex-row lg:items-center lg:justify-between">
          <ul className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            <li className="flex items-center gap-3">
              <TrustIcon label="Delivery" /> Delivery to the UK and Germany
            </li>
            <li className="flex items-center gap-3">
              <TrustIcon label="Payments" /> Secure checkout by PayPal
            </li>
            <li className="flex items-center gap-3">
              <TrustIcon label="Tracking" /> Track orders without an account
            </li>
          </ul>
          <Link href="/contact" className="btn-primary shrink-0">
            Need help? Contact us
          </Link>
        </div>
      </section>
    </div>
  );
}

function TrustIcon({ label }: { label: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-brand-400"
    >
      {label === "Delivery" ? (
        <>
          <path d="M3 7h11v10H3z" />
          <path d="M14 10h4l3 3v4h-7z" />
          <circle cx="7" cy="17.5" r="1.6" />
          <circle cx="17" cy="17.5" r="1.6" />
        </>
      ) : null}
      {label === "Payments" ? (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <path d="M6.5 14.5h4" />
        </>
      ) : null}
      {label === "Tracking" ? (
        <>
          <path d="M12 3v10" />
          <path d="m12 13-4 4" />
          <path d="M12 13l4 4" />
          <path d="M5 21h14" />
        </>
      ) : null}
    </svg>
  );
}

async function FeaturedLoader() {
  await connection();
  const featured = await getFeaturedProducts(6);
  return <FeaturedProducts products={featured} />;
}