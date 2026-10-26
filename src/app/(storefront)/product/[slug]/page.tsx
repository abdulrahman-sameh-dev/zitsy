import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/storefront/product-card";
import { ProductView } from "@/components/storefront/product-view";
import { deriveCategoryForProduct } from "@/lib/catalog/categories";
import { metaDescription } from "@/lib/catalog/description";
import { displayTags } from "@/lib/catalog/tags";
import { getVisibleProductBySlug, listProductsByCategorySlug } from "@/lib/catalog/query";
import { site } from "@/lib/config/public-env";
import { toDecimalString } from "@/lib/money";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getVisibleProductBySlug(slug);
  // Throwing during metadata resolution (before the response streams) keeps
  // unknown product URLs a true HTTP 404 instead of a soft 404 with status 200.
  if (!product) notFound();
  const image = product.images[0]?.src;
  const canonical = `${site.url}/product/${product.slug}`;
  const description = metaDescription(product.description) || undefined;
  return {
    title: product.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: "en_GB",
      title: product.title,
      description,
      url: canonical,
      ...(image ? { images: [{ url: image, alt: product.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getVisibleProductBySlug(slug);
  if (!product) notFound();

  const category = deriveCategoryForProduct(product.tags);
  const inStock = product.availableVariantCount > 0;
  const firstImage = product.images[0]?.src;

  const sameCategory = await listProductsByCategorySlug(category.slug);
  const related = sameCategory
    .filter((item) => item.slug !== product.slug)
    .slice(0, 4);

  const structured = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    ...(product.description ? { description: product.description } : {}),
    ...(firstImage ? { image: [firstImage] } : {}),
    url: `${site.url}/product/${product.slug}`,
    brand: { "@type": "Brand", name: site.name },
    offers: {
      "@type": "Offer",
      ...(product.minPriceMinor > 0
        ? {
            price: toDecimalString(product.minPriceMinor),
            priceCurrency: product.currency,
          }
        : {}),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      url: `${site.url}/product/${product.slug}`,
    },
  } as const;

  const breadcrumbStructured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${site.url}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Shop",
        item: `${site.url}/shop`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: `${site.url}/shop?category=${encodeURIComponent(category.slug)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: product.title,
        item: `${site.url}/product/${product.slug}`,
      },
    ],
  } as const;

  return (
    <div className="container-page flex flex-col gap-10 py-10 sm:py-14">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-brand-700">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/shop" className="transition-colors hover:text-brand-700">
              Shop
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/shop?category=${encodeURIComponent(category.slug)}`}
              className="transition-colors hover:text-brand-700"
            >
              {category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <ProductView product={product} />

        {/* Description */}
        <div className="order-last flex flex-col gap-8 lg:order-none">
          {product.description ? (
            <section
              aria-labelledby="description-heading"
              className="prose-none rounded-xl border border-line bg-surface p-6"
            >
              <h2
                id="description-heading"
                className="text-sm font-semibold uppercase tracking-wide text-muted"
              >
                About this product
              </h2>
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
                {product.description}
              </div>
            </section>
          ) : null}

          {product.tags.length > 0 ? (
            <section aria-labelledby="tags-heading">
              <h2
                id="tags-heading"
                className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
              >
                Tags
              </h2>
              <ul className="flex flex-wrap gap-2">
                {displayTags(product.tags).map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-ink">
            You may also like
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((item, index) => (
              <ProductCard key={item.slug} product={item} priority={index === 0} />
            ))}
          </div>
        </section>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructured).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}