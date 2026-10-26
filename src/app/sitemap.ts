import { connection } from "next/server";

import { site } from "@/lib/config/public-env";
import {
  listSitemapCategories,
  listSitemapProducts,
} from "@/lib/catalog/query";

/**
 * Public, indexable URLs only. Private/session pages (`/cart`, `/checkout`,
 * `/track-order`, `/search`) are `noindex` and deliberately excluded.
 *
 * Static pages omit `lastModified`: their content is not timestamped per
 * request, and emitting `new Date()` would falsely signal that they change on
 * every crawl. Product and category entries use real content timestamps.
 */
export default async function sitemap() {
  await connection();
  const [products, categories] = await Promise.all([
    listSitemapProducts(),
    listSitemapCategories(),
  ]);
  const base = site.url;

  const staticPages = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/shipping`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/returns`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/sizing`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.2 },
  ] as const;

  const seen = new Set<string>();
  const entries = [
    ...staticPages.map((page) => {
      seen.add(page.url);
      return page;
    }),
    ...categories
      .map((category) => ({
        url: `${base}/shop?category=${encodeURIComponent(category.slug)}`,
        lastModified: category.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
      .filter((entry) => {
        if (seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      }),
    ...products
      .map((product) => ({
        url: `${base}/product/${product.slug}`,
        lastModified: product.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }))
      .filter((entry) => {
        if (seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      }),
  ];

  return entries;
}
