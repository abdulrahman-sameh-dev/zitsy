import { site } from "@/lib/config/public-env";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private, session-specific, or search-result routes. These are also
        // `noindex`; keep crawlers away to avoid wasted crawl budget.
        disallow: ["/api/", "/cart", "/checkout", "/track-order", "/search"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
