import { cache } from "react";

import { db } from "@/lib/db/prisma";
import { deriveCategoryForProduct, summarizeCategories, type CategorySummary } from "@/lib/catalog/categories";
import type { ViewProduct } from "@/lib/catalog/view";
import { buildProductView, type ProductViewRecord } from "@/lib/catalog/view";

export interface ProductSummary {
  slug: string;
  title: string;
  minPriceMinor: number;
  currency: string;
  tags: string[];
  imageSrc: string | null;
  imageAlt: string;
}

function toSummary(product: {
  slug: string;
  title: string;
  minPriceMinor: number;
  currency: string;
  tags: string[];
  images: Array<{ src: string }>;
}): ProductSummary {
  return {
    slug: product.slug,
    title: product.title,
    minPriceMinor: product.minPriceMinor,
    currency: product.currency,
    tags: product.tags,
    imageSrc: product.images[0]?.src ?? null,
    imageAlt: product.title,
  };
}

/**
 * All visible products with enough data for cards + category derivation.
 *
 * Wrapped in React `cache()` so the many derived views on a single render
 * (featured, category grid, shop filters) share one query instead of repeating
 * the same full-catalogue read. Request-scoped only — never persisted, so a
 * background sync is reflected on the next request.
 */
export const listProductSummaries = cache(
  async (): Promise<ProductSummary[]> => {
    const products = await db.product.findMany({
      where: { visible: true },
      select: {
        slug: true,
        title: true,
        minPriceMinor: true,
        currency: true,
        tags: true,
        images: { take: 1, orderBy: [{ isDefault: "desc" }, { position: "asc" }] },
      },
      orderBy: { title: "asc" },
    });
    return products.map(toSummary);
  },
);

export async function listProductsByTag(
  tag: string,
): Promise<ProductSummary[]> {
  const products = await db.product.findMany({
    where: { visible: true, tags: { has: tag } },
    select: {
      slug: true,
      title: true,
      minPriceMinor: true,
      currency: true,
      tags: true,
      images: { take: 1, orderBy: [{ isDefault: "desc" }, { position: "asc" }] },
    },
    orderBy: { title: "asc" },
  });
  return products.map(toSummary);
}

/** Products whose derived category slug matches (deterministic from tags). */
export async function listProductsByCategorySlug(
  slug: string,
): Promise<ProductSummary[]> {
  const products = await listProductSummaries();
  return products.filter(
    (product) => deriveCategoryForProduct(product.tags).slug === slug,
  );
}

/**
 * Deterministic featured set: the lowest-priced visible product from each
 * derived category, sorted by price ascending.
 */
export async function getFeaturedProducts(
  limit = 6,
): Promise<ProductSummary[]> {
  const products = await listProductSummaries();
  if (products.length === 0) return [];

  const cheapestByCategory = new Map<string, ProductSummary>();
  for (const product of products) {
    const slug = deriveCategoryForProduct(product.tags).slug;
    const current = cheapestByCategory.get(slug);
    if (!current || product.minPriceMinor < current.minPriceMinor) {
      cheapestByCategory.set(slug, product);
    }
  }

  return [...cheapestByCategory.values()]
    .sort((a, b) => a.minPriceMinor - b.minPriceMinor)
    .slice(0, limit);
}

/**
 * A deliberately chosen product for hero placement. Null when the slug is not
 * a visible product, so callers fall back to the computed featured set.
 */
export async function getHeroProductSummary(
  slug: string,
): Promise<ProductSummary | null> {
  const product = await db.product.findFirst({
    where: { slug, visible: true },
    select: {
      slug: true,
      title: true,
      minPriceMinor: true,
      currency: true,
      tags: true,
      images: { take: 1, orderBy: [{ isDefault: "desc" }, { position: "asc" }] },
    },
  });
  return product ? toSummary(product) : null;
}

export const getCategorySummaries = cache(
  async (): Promise<Array<CategorySummary & { imageSrc: string | null }>> => {
    const products = await listProductSummaries();
    const counts = new Map<string, number>();
    const imageBySlug = new Map<string, string | null>();
    for (const product of products) {
      const slug = deriveCategoryForProduct(product.tags).slug;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
      if (!imageBySlug.has(slug)) imageBySlug.set(slug, product.imageSrc);
    }
    return summarizeCategories(products).map((category) => ({
      ...category,
      imageSrc: imageBySlug.get(category.slug) ?? null,
    }));
  },
);

export const getVisibleProductBySlug = cache(
  async (slug: string): Promise<ProductViewRecord | null> => {
    const product = await db.product.findUnique({
      where: { slug },
      include: {
        variants: { orderBy: { title: "asc" } },
        images: { orderBy: [{ isDefault: "desc" }, { position: "asc" }] },
      },
    });
    if (!product || !product.visible) return null;
    return buildProductView(product as unknown as ViewProduct);
  },
);

export interface SitemapEntry {
  slug: string;
  updatedAt: Date;
}

export interface SitemapCategoryEntry {
  slug: string;
  updatedAt: Date;
}

/**
 * Derived category pages for the sitemap. `lastModified` is the newest product
 * timestamp in that category — a real content timestamp, not `now()`.
 */
export async function listSitemapCategories(): Promise<SitemapCategoryEntry[]> {
  const products = await db.product.findMany({
    where: { visible: true },
    select: { tags: true, updatedAt: true },
  });
  const newest = new Map<string, Date>();
  for (const product of products) {
    const { slug } = deriveCategoryForProduct(product.tags);
    const current = newest.get(slug);
    if (!current || product.updatedAt > current) {
      newest.set(slug, product.updatedAt);
    }
  }
  return [...newest.entries()].map(([slug, updatedAt]) => ({ slug, updatedAt }));
}

export async function listSitemapProducts(): Promise<SitemapEntry[]> {
  const products = await db.product.findMany({
    where: { visible: true },
    select: { slug: true, updatedAt: true },
    orderBy: { title: "asc" },
  });
  return products.map((product) => ({
    slug: product.slug,
    updatedAt: product.updatedAt,
  }));
}