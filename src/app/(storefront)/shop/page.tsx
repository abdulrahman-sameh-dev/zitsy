import type { Metadata } from "next";

import { ProductCard } from "@/components/storefront/product-card";
import {
  getCategorySummaries,
  listProductSummaries,
  listProductsByCategorySlug,
} from "@/lib/catalog/query";
import type { ProductSummary } from "@/lib/catalog/query";
import { site } from "@/lib/config/public-env";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { category, sort } = await searchParams;
  const categorySlug = typeof category === "string" ? category : undefined;
  const hasSort =
    typeof sort === "string" && ["price-asc", "price-desc"].includes(sort);

  let title = "Shop";
  let description =
    "Browse the full Zitsy catalogue — graphic apparel and lifestyle goods, made to order.";
  let activeCategoryName: string | undefined;
  let canonical = `${site.url}/shop`;

  if (categorySlug) {
    const categories = await getCategorySummaries();
    const activeCategory = categories.find((c) => c.slug === categorySlug);
    if (activeCategory) {
      activeCategoryName = activeCategory.name;
      title = activeCategory.name;
      description = `Shop Zitsy ${activeCategory.name.toLowerCase()} — ${activeCategory.productCount} pre-designed ${
        activeCategory.productCount === 1 ? "style" : "styles"
      } made to order and delivered across the UK and Germany.`;
      canonical = `${site.url}/shop?category=${encodeURIComponent(categorySlug)}`;
    }
  }

  // Sort-only query strings duplicate the same content; collapse them onto the
  // canonical category/shop URL. An unknown category slug keeps the /shop
  // canonical because the page falls back to the full catalogue.
  if (hasSort) {
    canonical = activeCategoryName
      ? `${site.url}/shop?category=${encodeURIComponent(categorySlug!)}`
      : `${site.url}/shop`;
  }

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: "en_GB",
      url: canonical,
      title: activeCategoryName ? `${activeCategoryName} · ${site.name}` : `Shop · ${site.name}`,
      description,
    },
  };
}

function plural(count: number): string {
  return count === 1 ? "product" : "products";
}

function sortProducts(
  products: ProductSummary[],
  sort: string | undefined,
): ProductSummary[] {
  const sorted = [...products];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.minPriceMinor - b.minPriceMinor);
    case "price-desc":
      return sorted.sort((a, b) => b.minPriceMinor - a.minPriceMinor);
    default:
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, sort } = await searchParams;
  const categorySlug = typeof category === "string" ? category : undefined;
  const sortKey = typeof sort === "string" && ["price-asc", "price-desc"].includes(sort) ? sort : undefined;

  const [categories, allProducts, categoryProducts] = await Promise.all([
    getCategorySummaries(),
    listProductSummaries(),
    categorySlug
      ? listProductsByCategorySlug(categorySlug)
      : Promise.resolve([] as ProductSummary[]),
  ]);

  const base = categorySlug ? categoryProducts : allProducts;
  const shown = sortProducts(base, sortKey);
  const activeCategory = categories.find((c) => c.slug === categorySlug);

  return (
    <div className="flex flex-col gap-8 py-12">
      {/* Category filter bar */}
      <div className="container-page">
        <nav aria-label="Product categories" className="flex flex-wrap items-center gap-2">
          <a
            href="/shop"
            className={categorySlug ? "chip" : "chip-active"}
            aria-current={categorySlug ? undefined : "page"}
          >
            All products
          </a>
          {categories.map((item) => (
            <a
              key={item.slug}
              href={`/shop?category=${encodeURIComponent(item.slug)}`}
              aria-current={item.slug === categorySlug ? "page" : undefined}
              className={item.slug === categorySlug ? "chip-active" : "chip"}
            >
              {item.name}
            </a>
          ))}
        </nav>
      </div>

      {/* Heading + sort */}
      <div className="container-page flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {activeCategory ? activeCategory.name : "All products"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {activeCategory
              ? `${shown.length} ${plural(shown.length)} in this category, made to order.`
              : `${shown.length} ${plural(shown.length)}, made to order.`}
          </p>
        </div>

        {shown.length > 1 ? (
          <form
            action="/shop"
            method="get"
            className="flex items-center gap-2"
            aria-label="Sort products"
          >
            {categorySlug ? (
              <input type="hidden" name="category" value={categorySlug} />
            ) : null}
            <label htmlFor="sort-select" className="sr-only">
              Sort by
            </label>
            <select
              id="sort-select"
              name="sort"
              defaultValue={sortKey ?? "title"}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-brand-500"
            >
              <option value="title">Sort: A–Z</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
            <button
              type="submit"
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-400 hover:text-brand-800"
            >
              Apply
            </button>
          </form>
        ) : null}
      </div>

      {/* Grid or empty state */}
      {shown.length > 0 ? (
        <div className="container-page">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((product, index) => (
              <ProductCard key={product.slug} product={product} priority={index === 0} />
            ))}
          </div>
        </div>
      ) : (
        <div className="container-page">
          <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-ink">No products here yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              This category is empty right now. New products will appear here
              automatically once they are published to the catalogue.
            </p>
            <a
              href="/shop"
              className="btn-primary mt-6"
            >
              Browse all products
            </a>
          </div>
        </div>
      )}
    </div>
  );
}