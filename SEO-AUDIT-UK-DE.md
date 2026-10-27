# Zitsy — UK & Germany SEO, Internationalization, Performance & Canonical Domain Audit

**Date:** 2026-10-26
**Scope:** `zitsy` storefront (Next.js 16.3.8 / React 19.2.8 / Prisma 7)
**Canonical production origin:** `https://zitsy.darkhub.dev`
**Mode:** Code-level audit and implementation, plus a local (non-production) catalog refresh. Deployment is performed separately under explicit authorization; this audit does not write to the production database, run a production catalog sync, or change DNS, payment, credentials, or external integrations.

---

## 1. Executive summary

The storefront was structurally sound (server-rendered product pages, `next/image`, a sitemap and robots file) but had several issues that would blunt organic performance in the UK and Germany:

- The sitemap listed a `noindex` cart page, used the build time for static pages, omitted category URLs, and could emit duplicate entries.
- `robots.txt` only disallowed `/api/`, allowing crawl of cart, checkout, tracking and search.
- Homepage and most static pages had no self-referencing canonical. Category-filtered shop URLs advertised a canonical even for invalid categories.
- Product meta descriptions used roughly 1,000 characters of supplier text (including markup remnants) instead of a search-snippet-length summary.
- Structured data was limited to `Product` and `BreadcrumbList`; there was no site-level `Organization` / `WebSite` identity.
- Unknown product URLs returned **HTTP 200** with 404 content (a soft 404).
- The product list query ran 2–3 times per request (home, shop, PDP metadata + page).

All of the above were fixed in code and verified against a production build. German localization, EUR pricing and German legal pages were **not** implemented because the required business inputs do not exist yet (see §6). No ranking, indexing or performance outcome is claimed.

---

## 2. Canonical domain and preview-host protection

- The single source of the origin remains `NEXT_PUBLIC_APP_URL`, exposed as `site.url` (`src/lib/config/public-env.ts`) and validated by `appUrl()` (`src/lib/config/env.ts`), which strips trailing slashes and refuses `localhost` in production.
- No code path uses `VERCEL_URL`, so a preview deployment cannot silently become the canonical host.
- `.env.example` and `README.md` now document that production must set the canonical origin and that preview hosts must not be indexed.
- Verified output uses only `https://zitsy.darkhub.dev`; no `localhost`, `127.0.0.1`, `*.vercel.app` or `.example` hosts appeared in the rendered homepage, shop, PDP, sitemap or robots output.
- Local development intentionally keeps `http://localhost:3000` in `.env`.

---

## 3. Technical SEO changes

### 3.1 Sitemap (`src/app/sitemap.ts`)

- Canonical-only absolute URLs.
- Removed `/cart` (it is `noindex`) and kept `/contact`.
- Static pages omit `lastModified` instead of emitting the build clock via `new Date()`.
- Category URLs and product URLs carry real `updatedAt` timestamps (`listSitemapCategories`, `listSitemapProducts` in `src/lib/catalog/query.ts`).
- Duplicate `<loc>` values are removed with a `seen` set.

Current build (after the 2026-10-26 local catalog refresh): **45 URLs** = 1 home + 8 static (`/shop`, `/about`, `/contact`, `/shipping`, `/returns`, `/sizing`, `/privacy`, `/terms`) + 11 category pages + 25 products. No `/cart`, no duplicates, no non-canonical hosts.

### 3.2 Robots (`src/app/robots.ts`)

- Allows public content and disallows `/api/`, `/cart`, `/checkout`, `/track-order` and `/search`.
- Advertises `https://zitsy.darkhub.dev/sitemap.xml`.
- Cart, checkout, track-order and search also emit `noindex, follow` in their metadata.

### 3.3 Metadata and canonicals

- Root layout (`src/app/layout.tsx`): `<html lang="en-GB">`, `metadataBase` from `site.url`, Open Graph `url`/`siteName`/`locale=en_GB`, canonical site-wide defaults, and `og.png`.
- Homepage (`src/app/(storefront)/page.tsx`): its own keyword-led absolute title, 155-character description, canonical `/`, and complete Open Graph fields.
- Shop (`src/app/(storefront)/shop/page.tsx`): category-aware title/description; canonical points to `?category=<slug>` only when the category is valid, otherwise to `/shop`; sort parameters never enter the canonical.
- Product (`src/app/(storefront)/product/[slug]/page.tsx`): canonical, trimmed meta description, Twitter card, and product image as absolute Open Graph image.
- Static info pages (about, contact, shipping, returns, sizing, privacy, terms): self-referencing canonicals added.

### 3.4 Structured data

- Site-wide `@graph` JSON-LD in `src/app/layout.tsx`: `Organization` and `WebSite`, with `<` escaped to `\u003c` inside the script payload. No `SearchAction` is emitted because search uses a POST action and an HttpOnly cookie rather than query-string terms.
- Product pages emit `Product` with `brand`, `offers` (price, `GBP`, `InStock`, `NewCondition`) and `BreadcrumbList` (Home → Shop → Category → Product).
- Product descriptions in JSON-LD are plain text (no HTML), produced through `toPlainText()` in `src/lib/catalog/description.ts`.

### 3.5 Meta descriptions

- `metaDescription(raw, max = 155)` added in `src/lib/catalog/description.ts`: strips markup through `toPlainText()`, takes the first sentence when it fits, otherwise truncates on a word boundary with an ellipsis.
- Applied to product metadata. Covered by 4 new meta-description tests (11 total in `tests/description.test.ts`).

### 3.6 Soft 404 fix

- Unknown product URLs previously returned **200** because the route's `loading.tsx` Suspense boundary streamed the shell before `notFound()` resolved.
- Added `src/app/(storefront)/product/[slug]/layout.tsx`, which resolves the slug and calls `notFound()` **above** the loading boundary. The loading skeleton is preserved for valid products.
- `generateMetadata` also rejects an unknown slug before returning metadata.
- Verified: `/product/<missing>` → **404** with the "Page not found" body; a valid product → **200**.

---

## 4. Internationalization (UK and Germany)

**Current genuine state:** one English (`en-GB`) storefront, GBP prices, shipping available to the UK and Germany. There is no German content, no EUR price source and no German legal text.

**Decision:** no `/de-de` route and no `hreflang` alternates were created. Publishing hreflang or a German URL without translated content, verified EUR prices and German legal pages would be misleading and could create thin/duplicate pages. There is also no IP- or browser-based auto-redirect.

**Prerequisites before German pages can ship:**

1. Translated UI, product copy and category copy (human-reviewed, not machine-translated for legal text).
2. A verified EUR price source. GBP must not be converted with a hard-coded or live FX guess.
3. German legal pages: Impressum, Widerrufsbelehrung/Datenschutz as applicable, and VAT handling.
4. A localized URL structure (e.g. `/de-de/...`) plus reciprocal `hreflang` between the English and German pages, including `x-default`.
5. Confirmation that fulfilment, shipping times and returns wording are accurate for German orders.

Until then, the UK-facing English site remains the only indexable version.

**Caveat:** German consumers can still buy from the English store if checkout allows it; this audit does not change checkout, payment, shipping or legal content. Whether that is acceptable is an owner/legal decision.

---

## 5. Performance

### 5.1 Implemented (code-level)

- `listProductSummaries()` and `getCategorySummaries()` are wrapped in React `cache()` (`src/lib/catalog/query.ts`), so the repeated catalog reads within one request are deduplicated.
  - Homepage: the hero and featured sections previously triggered separate list queries; they now share one request-scoped result.
  - Shop: metadata and page render share the same category/product summary work.
- `getVisibleProductBySlug()` is also request-cached, so the PDP metadata pass and the page render share one product query (the new layout reuses the same cache entry).
- Images already use `next/image` with explicit `sizes`, `priority` on the PDP hero and lazy loading elsewhere; this audit did not change that configuration.

This is a structural reduction in duplicate database work, not a measured speed improvement. No lighthouse/field numbers were produced in this environment.

### 5.2 Not measured, and why

There is no UK or Germany geographic test infrastructure available here, and local `next start` timings are not representative of user-perceived performance. Therefore no Core Web Vitals or regional latency claims are made.

### 5.3 Reproducible measurement plan (after deploy)

1. **Field data:** confirm origin in Google Search Console; use the Core Web Vitals report and CrUX (PSI) once enough traffic exists. Segment by country (UK vs DE).
2. **Lab data:** run PageSpeed Insights for `/`, a category page and 3 PDPs, from both mobile and desktop.
3. **Regional lab:** WebPageTest from London and Frankfurt, mobile 4G, 3 runs, compare LCP/CLS/INP/TTFB.
4. **Server:** measure origin TTFB from the hosting region and confirm caching/CDN behaviour for static assets and images.
5. Track the same URLs before/after any future change; store raw reports with dates.

Do not treat a single local Lighthouse run as a UK/DE result.

---

## 6. Blocked items (owner decisions / external inputs)

| Item | Why blocked | Needed to proceed |
| --- | --- | --- |
| German storefront + `hreflang` | No German content or legal pages | Human translations, German legal review, localized URL plan |
| EUR pricing | Only GBP prices exist; converting GBP→EUR would create unverified prices | Verified EUR price source per variant/market |
| Analytics / consent | No analytics or consent tooling exists, matching current privacy copy | Owner choice of tool and consent approach; then privacy copy update |
| Sender and support inbox | `orders@zitsy.example`, `store@zitsy.example` are placeholders | Real Resend-verified sender and monitored support address |
| IP-risk products | PlayStation Symbols backpack, Fight Club cap, Marceline candle/mug | Legal review / removal decision |
| Design-less SKUs | Blank/design-less products exist in the Printify catalog (the last visible blank tote was hidden by the 2026-10-26 local refresh) | Remove or replace at the Printify source; do not rely on DB `visible=false` because sync restores Printify visibility |
| Candle "made in USA" claim | Not verified for UK/DE fulfilment | Confirm origin claim or remove it at source |
| Returns wording | "No change-of-mind returns" may conflict with UK CCR 2013 / EU Consumer Rights Directive | Legal review; this audit did not rewrite legal copy |
| Category taxonomy | Fallback tags produce `accessories`, `home-living`, `sublimation` as category names | Merchandising decision; changing derivation alters URLs/navigation, so it was left untouched |
| Indexing / rankings | Cannot be verified from a local build | Deploy, verify DNS/host, submit sitemap, inspect in GSC/Bing |

---

## 7. Verification performed

All commands run from the repository root with Node 22.23.1.

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm test` | **348/348** tests, 34 files |
| `NEXT_PUBLIC_APP_URL=https://zitsy.darkhub.dev pnpm build` | Pass |
| `pnpm test:e2e` | **11/11** Playwright tests |

Production-build endpoint checks (`next start -p 3100`, canonical env var set):

- Homepage: `lang="en-GB"`, canonical/OG URL `https://zitsy.darkhub.dev/`, `og:locale=en_GB`, `og:site_name=Zitsy`, absolute `og:image`.
- `https://zitsy.darkhub.dev/sitemap.xml` shape: 45 URLs, 0 duplicates, 0 `/cart`, 0 localhost/preview hosts.
- `robots.txt`: private paths disallowed, canonical sitemap URL.
- `/shop?category=t-shirts`: title `T-Shirts · Zitsy`, canonical without sort parameters.
- `/shop?category=<invalid>`: canonical falls back to `/shop`.
- PDP: canonical and `og:url` correct; `Product` price `22.99 GBP`, `InStock`, `NewCondition`, brand `Zitsy`; description contains no HTML; breadcrumb `Home → Shop → Hoodies → Product`.
- `/product/<missing>`: **HTTP 404** with 404 body.
- `/cart`, `/checkout`, `/track-order`, `/search`: reachable but `noindex, follow`.
- No `localhost`, `127.0.0.1`, `*.vercel.app` or `.example` leaks in the checked pages.

**Code-level vs external:** everything above is verified against the local production build. Google/Bing indexing, rankings, rich-result eligibility and UK/DE field performance have **not** been verified and are not claimed.

---

## 7.5 Post-implementation verification (2026-10-26)

**Local production build (canonical env):** 45 sitemap URLs, all HTTP 200; every canonical and `og:url` matches its sitemap URL (static pages now have explicit per-page OG/Twitter metadata); 25 products and 11 categories; all 25 products are linked from category pages and `/shop`; unknown product returns a hard 404; private routes are `noindex`. Final gates: `pnpm install --frozen-lockfile`, typecheck, lint, production build, 348/348 unit tests, and 11/11 Playwright tests pass.

**Catalog refresh:** the configured local DB (`localhost`, non-production) was stale relative to Printify (32 records / 26 visible vs 25 remote, two price drifts, one visible blank tote). The existing `pnpm printify:sync` workflow was run: 25 seen, 25 upserted, 1 hidden, 0 errors. Post-refresh comparison: 25 visible, 0 missing, 0 price/variant/image mismatches, GBP 1.99–46.99, no zero-price or blank products visible. Webhooks were not configured, so no Printify webhook reconciliation or publishing/fulfillment side effects occurred. The production database was not touched.

**Live production before this deployment:** `https://zitsy.darkhub.dev` emitted `https://zitsy.vercel.app` canonicals and sitemap URLs, included `/cart` in the sitemap, omitted category URLs, returned HTTP 200 for an unknown product, and used `<html lang="en">`. The Vercel **Production** env var `NEXT_PUBLIC_APP_URL` was still the `vercel.app` origin. Fixing live output requires changing that environment variable to `https://zitsy.darkhub.dev` and redeploying; that deployment-setting change is performed only under explicit authorization.

**Deployment failure root cause:** the failing Vercel build type-checked stale tracked files under `scripts/` (`dump-variants.ts`, `query-full-catalog.ts`, `query-products.ts`) because `tsconfig.json` includes `**/*.ts`. `.gitignore` does not untrack files already in Git. The deletion commit (`3b792b5`) removed the offending files; the later `/scripts` ignore rule did not fix the tracked-file problem by itself. It has now been narrowed so the two shipped scripts stay trackable while local scratch files remain ignored. A new deployment is required to ship these changes; live post-deployment verification is reported by the deployment run.

## 8. Manual tasks after deployment

1. Set `NEXT_PUBLIC_APP_URL=https://zitsy.darkhub.dev` in the production environment and confirm the deployed HTML uses it.
2. Confirm `https://zitsy.darkhub.dev/robots.txt` and `/sitemap.xml` resolve publicly.
3. Add the domain to Google Search Console and Bing Webmaster Tools; submit the sitemap; inspect the homepage, one category and one PDP; confirm the missing-product URL reports 404.
4. Run the Rich Results Test on a PDP (Product + Breadcrumb) and the homepage (Organization/WebSite).
5. Run PageSpeed Insights/WebPageTest per §5.3 and store the reports.
6. Decide the owner items in §6 before any German-targeted launch.

---

## 9. Files changed

- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `src/app/layout.tsx`
- `src/app/(storefront)/page.tsx`
- `src/app/(storefront)/shop/page.tsx`
- `src/app/(storefront)/product/[slug]/page.tsx`
- `src/app/(storefront)/product/[slug]/layout.tsx` (new; hard-404 validation above the loading boundary)
- `src/app/(storefront)/{about,contact,shipping,returns,sizing,privacy,terms}/page.tsx` (canonicals)
- `src/lib/catalog/query.ts` (request caching + sitemap category/product queries)
- `src/lib/catalog/description.ts` (`metaDescription`)
- `tests/description.test.ts`
- `src/lib/metadata.ts` (explicit per-page Open Graph/Twitter metadata for static pages)
- `.env.example`, `README.md` (canonical origin and preview-host warning)
- `.gitignore` (narrowed `/scripts` rule: local scratch ignored, shipped scripts explicitly trackable)

**Environment note:** several gitignored ad-hoc scripts in `scripts/` were breaking `tsc`. They were moved (not deleted) to `/tmp/opencode/zitsy-local-scripts/`; the tracked `scripts/generate-brand-assets.py` and `scripts/printify-sync.ts` were untouched.
