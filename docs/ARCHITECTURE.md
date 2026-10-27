# Zitsy — Architecture Plan (Phase 0)

Tagline: **Easy as Zitsy.**
Goal: the smallest reliable production system that can sell real products via Printify fulfillment + PayPal payments.

## 1. Critical flow

```
Printify API ──sync/webhooks──▶ PostgreSQL (local catalog = storefront read model)
                                         │
Customer → Shop → Product → Variant → Cart → Checkout
                                         │
                              server-side validation (variant, price, country)
                                         │
                              Order(PAYMENT_PENDING) + Payment(PENDING)
                                         │
                              PayPal order created (server)
                                         │
                              capture + server-side verification
                                         │
                              Payment COMPLETED → Order PAID   (exactly once)
                                         │
                              Printify order created (exactly once, external_id = order id)
                                         │
                              Printify fulfillment webhooks → IN_PRODUCTION → SHIPPED → DELIVERED
                                         │
                              Resend transactional email (best-effort, never blocks state)
```

PostgreSQL is the source of truth. Email/webhook delivery never corrupts order state.

## 2. Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js `>=22.13.0 <23` (`.nvmrc` pins `22.23.1`), pnpm `11.5.2` |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 + small shadcn-style `components/ui` primitives |
| DB | PostgreSQL (local: `zitsy_store`, test: `zitsy_store_test`) + Prisma 7 (client, adapter, migrations) |
| Validation | Zod 4 |
| Payments | PayPal Orders v2 REST, server-side capture + webhook verification |
| Fulfillment | Printify Public API v1 (Bearer token, server-only) |
| Email | Resend (official `resend` SDK, `Idempotency-Key` per send) + React Email HTML templates rendered with `@react-email/render` |
| Auth | Guest checkout with no customer accounts; private admin uses env credentials and an HMAC-signed, credential-bound cookie |
| Money | Integer minor units (`*Minor` columns), `STORE_CURRENCY=GBP`, explicit USD→GBP FX rates |
| Tests | Vitest (unit + DB integration, mocked transports), Playwright (browser E2E on the test DB + a local Resend HTTP stub) |

## 3. Project structure

```
src/
├── app/
│   ├── (storefront)/          # /, /shop, /product/[slug], /search, /contact,
│   │                           #   /cart, /checkout, /track-order, info pages
│   ├── admin/                 # /admin/login, /admin/analytics (private)
│   ├── api/
│   │   ├── cron/              # catalog sync + fulfillment retry
│   │   └── webhooks/          # paypal, printify
│   └── ...
├── proxy.ts                   # redirects legacy search URLs without raw terms
├── components/                # storefront, checkout, analytics, admin, brand
├── lib/
│   ├── config/env.ts          # Zod-validated server env
│   ├── config/public-env.ts   # browser-safe values (NEXT_PUBLIC_*)
│   ├── db/                    # Prisma client + PostgreSQL adapter
│   ├── admin/                 # sessions, page guard, rate limit, analytics query
│   ├── analytics/             # consent, GA4/Clarity, events, purchase dedupe
│   ├── markets.ts             # GB/DE market config
│   ├── catalog/               # normalization + read models
│   ├── cart/                  # guest cart service
│   ├── checkout/              # checkout orchestration + PayPal contract
│   ├── orders/                # order state, tracking, order numbers
│   ├── paypal/                # PayPal client + webhook handling
│   ├── printify/              # server-only API client + webhook handling
│   ├── fulfillment/           # idempotent Printify order creation/status sync
│   ├── email/                 # Resend send path, templates, order triggers
│   ├── contact/               # contact form schema, delivery, action
│   ├── search/                # search query cookie + server action
│   ├── cron/                  # cron bearer verification
│   └── http.ts                # client IP extraction
├── generated/prisma/          # generated Prisma client (gitignored)
└── ...
scripts/printify-sync.ts       # pnpm printify:sync (full sync + webhook subscription ensure)
```

Responsibility rules:
- `lib/printify`, `lib/paypal`, `lib/email` — external I/O only, never business rules.
- `lib/checkout/service.ts` — the orchestration point for orders, payments, and fulfillment triggers.
- State machines are pure functions (`lib/orders/state.ts`; fulfillment transitions in `lib/fulfillment/status.ts`).
- Server secrets are read only in `lib/config/env.ts`; browser-safe public values live in `lib/config/public-env.ts`.

## 4. Data model (Prisma)

- **User** and **Session** remain in the schema from the original plan but are not used by the storefront; there is no customer account, login, or registration surface.
- **Product** printifyId unique, slug unique, title, description, tags[], options Json (definitions from Printify), visible, blueprintId, printProviderId, minPriceMinor, currency, syncedAt.
- **ProductImage** productId+src unique, position, isDefault, variantIds Int[].
- **ProductVariant** (productId, printifyVariantId) unique, priceMinor, costMinor, isEnabled, isAvailable, colorName?, sizeName?, optionValueIds Int[], options Json, sku, title.
- **Category** slug unique + **ProductCategory** join — derived from real Printify tags through one normalization layer.
- **Cart** token unique (only the SHA-256 hash is stored) — **CartItem** (cartId, variantId) unique, quantity, unitPriceMinor snapshot.
- **Order** orderNumber unique, email, status, currency, subtotal/shipping/total Minor, shipping address, paypalOrderId unique?, printifyOrderId?, **trackingToken unique?** (24 random bytes, base64url — the public `/track-order/<token>` link), **fulfillmentStatus**, fulfillment timestamps/error/attempts, **deliveredAt?**, timestamps.
- **OrderItem** snapshot: printifyProductId, printifyVariantId, title, variantTitle, qty, unit/total price, currency.
- **Payment** provider, providerOrderId, status, amountMinor, unique(orderId, provider).
- **WebhookEvent** (provider, eventId) unique — idempotency ledger for webhook dedupe.
- **CatalogSyncRun** type/status/counters — sync + reconciliation visibility.
- **EmailLog** kind/status/error/**dedupeKey unique?** — the idempotency ledger: one accepted send per key (`order-confirmed|order-submitted|order-shipped|order-delivered|admin-new-order:<orderId>`, `support-message|support-received:<uuid>`), mirrored to Resend's `Idempotency-Key` header. Proves email attempts without affecting order state.
- **RateLimitBucket** key (hashed client identifier), count, resetAt — durable PostgreSQL fixed-window limiter for admin login; indexed by resetAt.

Constraints: unique business keys on Printify IDs (no duplicates on retry), FK cascade on cart items/images/variants, numeric checks (>=0) on money columns.

## 5. State machines

Order (payment lifecycle): `PENDING → PAYMENT_PENDING → PAID`, plus `PAYMENT_FAILED`, `CANCELLED`. Once `PAID`, it stays `PAID` (see Phase 6).
Fulfillment (separate `FulfillmentStatus` on `Order`): `PENDING → SUBMITTED → ON_HOLD | SENDING_TO_PRODUCTION → IN_PRODUCTION → PARTIALLY_FULFILLED → FULFILLED`, plus `CANCELLED`, `ACTION_REQUIRED`, `UNFULFILLABLE`. Fulfillment changes are forward-only (an older Printify event can never regress `FULFILLED → IN_PRODUCTION`), and no fulfillment failure ever changes payment state.

Payment: `PENDING → COMPLETED | FAILED | CANCELLED`.
Order is marked PAID only from server-side PayPal capture/verification (never from browser redirect).

## 6. Checkout & idempotency

1. Server loads cart by cookie and re-validates every variant (exists, belongs to product, visible, enabled, available, quantity ≤ 99) and recomputes totals from DB prices. Shipping is quoted server-side through Printify for the address; tax is still not modelled (documented — never fabricated).
2. Creates Order (PAYMENT_PENDING) with an immutable snapshot of every line (Printify ids, title, variant title, sku, quantity, unit price, line total, currency) + Payment (PENDING) — in one transaction. A unique retry loop allocates the order number.
3. Creates the PayPal order (`intent=CAPTURE`, `purchase_units[0].custom_id` and `reference_id` = our order id, `amount.value` = `toDecimalString(totalMinor)`), stores `paypalOrderId`.
4. Browser approves via the PayPal JS SDK; `onApprove` calls the server action `captureCheckoutAction`.
5. Server captures with `PayPal-Request-Id: zitsy-capture-<orderId>` (idempotent). On `422 ORDER_ALREADY_CAPTURED` it fetches the existing order via `getOrder` instead of charging again.
6. It verifies the authoritative response: purchase-unit custom/reference id matches our order, capture `status === COMPLETED`, currency matches, and `amount.value` equals `toDecimalString(order.totalMinor)`.
7. Transaction: Payment → COMPLETED (guard: only if currently PENDING), Order → PAID (guard: only from PAYMENT_PENDING), then delete the cart's items by `Order.cartId`. A second caller fails the guard and exits cleanly.
8. A mismatch (amount/currency/reference) records Payment FAILED + Order PAYMENT_FAILED and never marks paid. A transient failure leaves the order payable for retry.

PayPal webhooks (`POST /v1/notifications/verify-webhook-signature`, deduped via `WebhookEvent @@unique([provider,eventId])`) drive the same idempotent path: `CHECKOUT.ORDER.APPROVED` triggers the server capture, `PAYMENT.CAPTURE.COMPLETED` verifies + marks paid, `PAYMENT.CAPTURE.DENIED` fails the payment. Refresh/retry/duplicate delivery all converge on one PAID state. **Browser is never the source of truth** — the order only becomes PAID after server-side capture/verification.

Shipping is quoted through Printify before payment; tax is still out of scope. Fulfillment/Printify order creation is Phase 6, emails are Phase 8, and admin analytics/privacy hardening are Phase 9 (see below).

## 7. Catalog synchronization

- **Full sync** (`pnpm printify:sync`): paginated `GET /v1/shops/{id}/products.json`, upsert by `printifyId` in a transaction, replace images, upsert variants by `(productId, printifyVariantId)` so variant IDs stay stable, rebuild category links, and mark unseen products/variants hidden or disabled rather than deleting them. Also ensures webhook subscriptions exist.
- **Webhooks**: `product:created|updated|deleted` — payload only carries `shop_id`, so handler refetches the product by id and upserts (safe on retry). `order:*` events update fulfillment state.
- **Reconciliation**: the same full-sync path; idempotent by design, so it can run any time.
- Options/colors/sizes: rendered exclusively from `product.options` × enabled+available variants. Nothing is hardcoded; a variant combination only appears if a purchasable variant exists with that option-value set.

## 8. Markets & currency

`src/lib/markets.ts`: `{ GB, DE }`, `STORE_CURRENCY=GBP`. Checkout rejects any other country. Printify returns costs in `PRINTIFY_COST_CURRENCY` (default USD); `STORE_FX_RATES` provides explicit rates such as `USD:GBP=0.754`, and the storefront derives retail prices from the converted fulfillment cost. A missing FX pair fails closed rather than assuming 1:1.

## 9. Security

- Secrets only via `lib/config/env.ts`; no `NEXT_PUBLIC_` for anything secret (`NEXT_PUBLIC_PAYPAL_CLIENT_ID` only — client IDs are public by design).
- Webhook endpoints verify signatures (PayPal verify-webhook-signature API; Printify `X-Pfy-Signature: sha256=HMAC-SHA256(rawBody, PRINTIFY_WEBHOOK_SECRET)` with `crypto.timingSafeEqual`).
- Zod on every API/action input; server is authoritative for prices, variants, country, totals.
- Authorization: customers check out as guests; there is no customer account/login surface. Checkout capture/success is scoped to the HMAC-signed `zitsy_order` cookie — the success page reads the order from that cookie only, never from a query parameter (browser can never declare an order paid; only server capture/webhook after amount+currency+reference verification).
- **Admin** is private: `/admin/analytics` calls the centralized `requireAdminPage()` guard on every request and redirects unauthenticated visitors to `/admin/login`. The session cookie is HttpOnly, SameSite=Lax, Secure in production, expires after 12 hours, and is signed with a key derived from `AUTH_SECRET` plus the current `ADMIN_USERNAME`/`ADMIN_PASSWORD`; rotating either credential invalidates active sessions. Login attempts are limited in PostgreSQL by the hashed client address, so the limit is shared across instances. There is no MFA, individual-user account, or audit log; admin remains a single shared credential.
- **Analytics privacy**: analytics loads only after explicit consent. New searches keep terms out of page URLs: forms post through a server action, the current query lives in an HttpOnly SameSite=Lax session cookie scoped to `/search`, and legacy `?q=` URLs are redirected by `src/proxy.ts`. Legacy inbound URLs can still remain in browser history or edge logs before the redirect; POST bodies and that cookie contain the term, so hosting request-body logging must stay disabled. The application logger does not log search terms. GA4 event context is forced to `origin + pathname` for both `page_location` and `page_referrer`; the search event contains only a result count. Search inputs and the search page are masked from Clarity, but Clarity URL masking is an external dashboard setting and must be verified before Clarity is enabled. Admin, checkout, and track-order paths suppress page views and Clarity, including a load-time re-check that stops Clarity if a private route is entered while its script is still loading. GA4's Enhanced Measurement **Page changes based on browser history events** setting must be disabled in the GA4 data stream: `send_page_view: false` only suppresses the initial automatic page view, while history-based page views would bypass the application's private-route suppression.
- Response headers (`next.config.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Powered-By` removed. `/checkout/success`, `/track-order/*`, and `/admin/*` additionally send `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`; `/search` sends `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, follow` because its results depend on the visitor's HttpOnly search cookie. No CSP by design — it would have to allow the PayPal JS SDK and Printify-hosted imagery.
- JSON-LD on the product page is emitted through `dangerouslySetInnerHTML` with `<` escaped to `<`, so a catalog string containing `</script>` or `<!--` cannot break out of the `<script type="application/ld+json">` element.
- Prisma parameterized queries; no secrets in logs; `.env` gitignored.
- **Order tracking** is login-free and capability-based: the URL token is 192 bits of randomness (`randomBytes(24)` → base64url), never derived from the order number/id; reading a tracking page reveals order status, items and tracking only. The number+email lookup and the token page are rate limited per IP (10/min), and lookup failures always return the same generic message (`We couldn't find an order matching those details…`) so orders cannot be enumerated.
- **Contact form** is validated with Zod, protected by a `website` honeypot and a per-IP limit (5 messages / 10 min), and only ever delivers to `SUPPORT_EMAIL`.
- **Email never carries authority or secrets.** Sends are best-effort: failure is recorded in `EmailLog` and logged (recipient masked) but never rolls back a payment, fails a PAID order or cancels a Printify order, and provider errors are never shown to customers. `RESEND_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `PRINTIFY_*` and PayPal secrets are never rendered into an email or a response.

## 10. Environment variables (canonical, no aliases)

Runtime: Node.js `>=22.13.0 <23` (`.nvmrc`/`.node-version` pin `22.23.1`) and pnpm `11.5.2` (`packageManager`). Node 22.13 is the floor required by pnpm 11; Vitest 5 also requires Node 22.12+.
Required: `DATABASE_URL`, `AUTH_SECRET` (at least 32 characters), `NEXT_PUBLIC_APP_URL`, `STORE_CURRENCY`.
Integration (degrade safely when absent): `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_TAGLINE`, `PRINTIFY_*` (5), `PAYPAL_*` (4) + `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`, `CRON_SECRET` (Vercel Cron bearer — unset ⇒ both `/api/cron/*` respond 503, fail closed).
Admin: `ADMIN_USERNAME` + `ADMIN_PASSWORD` enable `/admin`; `AUTH_SECRET` binds admin sessions. Leave both credentials unset to keep admin unusable.
Analytics: `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `NEXT_PUBLIC_CLARITY_PROJECT_ID` are optional and compiled at build time. Changing either requires a new build; analytics stays off until visitor consent. Keep Clarity unset until its URL masking is enabled and verified, because DOM masking does not cover URLs.
Email: `RESEND_API_KEY` + `EMAIL_FROM` (e.g. `Zitsy <orders@yourdomain.com>`, a domain verified in Resend) enable customer/admin notifications; `SUPPORT_EMAIL` is the store inbox that receives admin notifications and contact-form messages (separate from the customer-facing `EMAIL_FROM`); `RESEND_API_URL` is a **test-only** override of the Resend API base URL that points the SDK at a local stub — leave it unset in production.
Deployment: only `.env.example` is committed; `.env` is a developer-local file and is gitignored. A production deployment must set real values — Postgres `DATABASE_URL`, a production `PAYPAL_ENVIRONMENT=production`, `PAYPAL_WEBHOOK_ID` / `PRINTIFY_WEBHOOK_SECRET` paired in the provider dashboards, `CRON_SECRET`, admin credentials, a verified-domain `EMAIL_FROM`/`SUPPORT_EMAIL`, and a non-localhost `NEXT_PUBLIC_APP_URL` (a production build refuses to proceed with a localhost URL by design, and `emailConfig()` refuses to send when `NEXT_PUBLIC_APP_URL` is localhost). The `*.vercel.app` restriction is operational, not code-enforced. Run the 8 migrations before serving traffic; see [`DEPLOYMENT.md`](DEPLOYMENT.md) for the ordered migration and rollback runbook.
Checkout/PayPal buttons disable cleanly when PayPal is not configured; catalog pages serve the local DB regardless.

## 11. Phase gates

Phase 1 foundation boots (app + DB + env validation) → Phase 2 real catalog sync verified → Phase 3 storefront with correct variant resolution → Phase 4 cart/orders → Phase 5 PayPal verified → Phase 6 fulfillment → Phase 7 commerce (pricing/FX/shipping) → Phase 8 email/tracking/support → Phase 9 admin analytics + privacy hardening → Phase 10 polish → Phase 11 verification. Customer accounts are not in the current scope. If a gate fails (DB down, sync wrong, variant resolution wrong, payment verification weak), stop before the next phase.

## 12. Progress log

### Phase 1 — Foundation (DONE)
- Prisma 7 setup verified: `prisma.config.ts` (datasource + migrations), generator `prisma-client` → `src/generated/prisma`, `PrismaPg` driver adapter in `src/lib/db/prisma.ts`, migration `20261006204811_init` applied to `zitsy_store` (16 tables).
- Gotchas resolved: `url` removed from `datasource` block (moved to config); `Payment.orderId` made `@unique` for the 1:1 with `Order`; back-relations added for `ProductVariant`; `server-only` package replaced with an explicit `typeof window` guard in `env.ts` because it throws under plain Node/tsx scripts.
- Base UI: `globals.css` (green brand scale + semantic canvas/ink/muted/line tokens, focus-visible, `container-page`), Geist fonts, root layout metadata, `not-found`/`error`/`global-error`/`loading` boundaries.
- `src/lib/log.ts` (sanitising structured logger), `src/lib/money.ts` (minor-unit money formatting), `src/lib/utils.ts` (`cn`).
- Gate: `next dev` returns 200, 404 page works, `tsc --noEmit` clean.

### Phase 2 — Printify client, catalog sync, webhooks (DONE)
- `src/lib/printify/types.ts` — typed subset aligned to the saved OpenAPI (product option values are `int` value ids; `variants[].price` is integer minor units; list response is a Laravel-style paginated envelope with `next_page_url`).
- `src/lib/printify/client.ts` — fetch wrapper (Bearer, UA, timeout, `PrintifyApiError`), `listProducts`/`getAllProducts` (page walk), `getProduct`, `getShippingCosts`, `createOrder`, `getOrder`, `sendToProduction`, webhook CRUD, `getPrintifyClient()` factory.
- `src/lib/printify/webhooks.ts` — HMAC-SHA256 signature verification (`X-Pfy-Signature: sha256=…`, `timingSafeEqual`), `PRINTIFY_WEBHOOK_TOPICS`, `ensurePrintifyWebhooks` reconciliation.
- `src/lib/catalog/slug.ts` — `toSlug`/`uniqueSlug`, variant display title + color/size extraction from product options.
- `src/lib/catalog/sync.ts` — `upsertProductFromApi` (atomic per-product replace of images; variants upserted by `(productId, printifyVariantId)` so their cuid is stable across syncs, and variants removed from Printify are disabled rather than deleted so cart/order references stay valid — idempotent), `syncCatalog` (paginated fetch, upsert all, hide products absent from Printify instead of deleting, `CatalogSyncRun` record with status/counts/error).
- `src/lib/printify/handlers.ts` — `processPrintifyWebhook`: dedupe via `WebhookEvent @@unique([provider,eventId])`, product:created/updated/deleted applied (deleted hides), order events marked `deferred` (forward-only until Phase 6).
- `src/app/api/webhooks/printify/route.ts` — POST only; 503 when unconfigured, 401 bad signature, 400 bad JSON, 500 on processing failure (Printify retries), 200 on success.
- `scripts/printify-sync.ts` (`pnpm printify:sync`) — webhook reconciliation + full sync CLI.
- Tests: `tests/webhooks.test.ts` (signature), `tests/printify-client.test.ts` (auth header, pagination, error mapping, order POST), `tests/catalog-sync.test.ts` (real sync against `zitsy_store_test` DB: full upsert, hide-removed, idempotency, webhook processing/deferral, dedupe). Vitest config: `globalSetup` runs `prisma migrate deploy` on the test DB, `setupFiles` redirects `DATABASE_URL` before `env.ts` loads.
- Gate: 16/16 tests pass, `tsc --noEmit` + `eslint` clean, dev server: home 200, webhook 503 (unconfigured in dev) / 405 on GET.

### Phase 3 — Storefront (DONE)
- Catalog read path: `src/lib/catalog/categories.ts` (deterministic category derivation from real tags with explicit keyword rules; Tote Bags won over generic Bags; fallback to first real tag), `src/lib/catalog/view.ts` (`buildProductView` → serializable view; `imagesForVariant`), `src/lib/catalog/query.ts` (visible-only summaries, product view by slug, category filter, featured = cheapest per category, sitemap entries).
- Storefront UI in route group `src/app/(storefront)/`: `layout.tsx` (header/footer + `#main-content`), `page.tsx` (hero + Suspense-streamed featured/category sections), `shop/page.tsx` (`?category=` filter, empty state), `shop/loading.tsx` (skeleton), `product/[slug]/page.tsx` (breadcrumb, description, tags, JSON-LD), `cart/page.tsx` (honest empty placeholder). Components: `header`, `footer`, `product-card`, `product-grid-skeleton`, and the client `product-view` (real per-product option dimensions, availability-aware chips, exact variant resolution, variant price, variant-filtered gallery + lightbox, quantity, add-to-cart placeholder disabled until a full selection exists).
- Next 16 findings: `export const dynamic = "force-dynamic"` is ignored in this version — use `await connection()` from `next/server` for request-time catalog reads; `PageProps`/`LayoutProps` globals require generated `.next/types`, so prop types are declared inline so `pnpm typecheck` works standalone; a route-group `loading.tsx` (or root `loading.tsx`) creates a Suspense boundary that flushes before `notFound()`, making the product 404 return HTTP 200 — loading was scoped to `/shop` and home streams via explicit `<Suspense>` instead.
- SEO: per-product `generateMetadata` + canonical + OpenGraph, `app/robots.ts`, dynamic `app/sitemap.ts` (static pages + all visible products).
- Real-catalog verification (prod build against `zitsy_store`): home/shop/product/cart 200; `/product/<unknown>` and unknown paths 404; legends match exact Printify option names (`Scents, Size`, `Colors, Sizes`, `Bag Size`, `Clothing sizes + Gildan Colors`) — no Color/Size assumption; GBP prices (mug £8.38, candle £22.58); JSON-LD Offer `price/currency/availability` from the minimum variant price.
- Tests (48 total, all passing): `tests/variants.test.ts` (option dims, availability, exact resolution, pricing), `tests/categories.test.ts`, `tests/images.test.ts`, `tests/catalog-view.test.ts` (integration on `zitsy_store_test`). `tsc --noEmit` + `eslint` clean; production `next build` clean.
- Not in scope (deliberately deferred): cart persistence/checkout/orders/email/auth/admin. Add-to-cart is a disabled-until-valid UI placeholder.
- Note: a local production build requires a non-localhost `NEXT_PUBLIC_APP_URL` (by design); Phase 3 build verified with `NEXT_PUBLIC_APP_URL=https://zitsy.example`.

### Phase 4 — Cart (DONE)
- **Sync identity fix (prerequisite).** `upsertProductFromApi` previously did `ProductVariant.deleteMany` + `createMany` per product, which changed every variant cuid on every sync; with `CartItem.variantId onDelete: Cascade` that silently wiped carts on every sync (and would break `OrderItem.variantId onDelete: Restrict` once orders exist). Variants are now **upserted by `(productId, printifyVariantId)`** (cuid stays stable) and variants absent from the incoming payload are **disabled, not deleted**. Verified by `tests/cart-resilience.test.ts` (variant cuid + cart line survive two resyncs, including a variant that disappears) and by a live `pnpm printify:sync` (20/20 upserted, 0 errors, variant cuid unchanged, cart item intact).
- Cart modules: `src/lib/cart/errors.ts` (`CartError` with safe user messages), `schemas.ts` (Zod: `addItemSchema {productId, variantId, quantity 1..99}`, `updateItemSchema`, `removeItemSchema`; `MAX_ITEM_QUANTITY=99`, `MAX_CART_LINES=50`), `session.ts` (guest cookie `zitsy_cart`; only `sha256(token)` is stored in `Cart.token`, raw random 32-byte base64url stays httpOnly/sameSite=lax/secure-in-prod/~30d), `service.ts` (`getOrCreateCartByTokenHash`, `getCartByTokenHash`, `addItem`, `updateItem`, `removeItem`, `clearCart` — all scoped by `cartId`), `view.ts` (pure `buildCartView`: current server price, `recordedPriceMinor` snapshot, `priceChanged`, per-line `available`/`unavailableReason`, subtotal over available lines only, `totalQuantity`, `hasUnavailable`, `canCheckout`), `read.ts` (`loadCartView`/`loadCartCount`, never creates a cart), `actions.ts` (`"use server"` add/update/remove/clear with Zod parse + `revalidatePath("/", "layout")`).
- Server authority: the client sends only `{ productId, variantId, quantity }`; the server re-loads the variant and rejects unknown, mismatched-product, hidden-product, disabled or unavailable variants, and stores the DB price/currency (never a client price). Ownership is by cookie only (no client cart id); every mutation is scoped by `cartId`, so cross-cart updates/removes fail with `item_not_found`.
- UI: `header.tsx` is now async and shows a real cart badge from `loadCartCount()`; `product-view.tsx` submits the real `addToCart` server action (disabled until a complete valid selection exists) with pending/success/error states; `cart/page.tsx` renders the client `cart-view.tsx` (lines, images, quantity steppers, remove, clear, per-line "price changed" and unavailable reasons, subtotal over available lines, checkout CTA). New `/checkout` placeholder (no payment yet).
- Resync resilience: variants that vanish from Printify are disabled → existing cart lines survive and render as "unavailable — remove to continue", and `canCheckout` stays false.
- Tests (71 total, all passing; +23 for cart): `tests/cart-view.test.ts` (pure projection: current price vs snapshot, price-change flags, unavailable reasons, subtotal only over available lines, checkout gating), `tests/cart-service.test.ts` (integration on `zitsy_store_test`: unknown/other-product/hidden/disabled/unavailable variant rejection, server-stored price, duplicate-add merge, quantity cap, distinct lines, update/remove/clear, cross-cart ownership isolation, no-cart-on-read, stale availability, price increase), `tests/cart-resilience.test.ts` (real sync keeps variant cuid + cart line, and dropped variant survives as unavailable).
- Real-catalog verification (prod build against `zitsy_store`): `/`, `/shop`, `/cart`, `/checkout`, product page, `robots.txt`, `sitemap.xml` all 200; unknown product 404; with a real cart cookie the header shows `Cart, 2 items` and `/cart` shows the line, `2 items`, a `Price changed from £0.00 to £4.99` notice, and subtotal `£9.98` (2 × £4.99 current price); with no cookie `/cart` shows the empty state; a different cookie sees an empty cart. Live `pnpm printify:sync` then re-rendered the same cart with the variant cuid unchanged. `tsc --noEmit` + `eslint` clean; production `next build` clean.
- Note: the async `Header` reads the cart cookie, so storefront routes render dynamically (expected for a live cart badge).

### Phase 5 — Checkout & PayPal (DONE)
- **Schema.** `Order.cartId String?` added (scalar, no FK) so the webhook path can idempotently clear the cart even when the browser is gone; migration `20261006225626_add_order_cart_id`. Order ownership on the success page is a stateless HMAC-signed httpOnly cookie `zitsy_order` (`createOrderRef`/`verifyOrderRef`, signed with `AUTH_SECRET`, ~3h) — no extra schema field.
- `src/lib/paypal/config.ts` — `PAYPAL_PROVIDER`, sandbox/live base URLs, `paypalBaseUrl`, `isPaypalConfigured`, `isPaypalWebhookConfigured`. `types.ts` — `PaypalGateway` interface + order/capture/webhook types. `client.ts` — `PayPalClient` (cached OAuth2 client-credentials grant, `createOrder`, `captureOrder(id, requestId)`, `getOrder`, `verifyWebhookSignature`, `PayPalApiError` with `status`/`paypalName`/`body`, timeout) + `getPayPalClient()`.
- `src/lib/orders/state.ts` (explicit forward-only `ORDER_TRANSITIONS`/`PAYMENT_TRANSITIONS`, `canTransition*`, `isPayableOrderStatus`, `isPaidOrderStatus`) and `orders/order-number.ts` (`ZS-XXXXXXXX`).
- `src/lib/checkout/errors.ts` (`CheckoutError` with safe user messages), `schemas.ts` (Zod `customerSchema`: trimmed, lowercased email, uppercased `GB|DE` country, optional empty→undefined), `session.ts` (signed order cookie), `service.ts` (`prepareCheckout` — server revalidation/snapshot; `beginCheckout` — reuse a matching PAYMENT_PENDING order or cancel+recreate, create Order+Payment, create PayPal order, store ids; `captureOrderPayment` — capture with request id, `ORDER_ALREADY_CAPTURED` fallback, reference/amount/currency verification; `confirmCapturedPayment`; `markOrderPaid` idempotent transactional guards + cart clear; `markPaymentFailed`; `findOrderIdByPaypalOrderId`; `getOrderSummary`), `actions.ts` (`beginCheckoutAction` fails fast if PayPal unconfigured, validates, sets the signed cookie; `captureCheckoutAction`).
- `src/lib/paypal/webhook-handler.ts` — dedupe via `WebhookEvent`, dispatch `CHECKOUT.ORDER.APPROVED` / `PAYMENT.CAPTURE.COMPLETED` / `PAYMENT.CAPTURE.DENIED`, terminal mismatches recorded as `rejected` (no retry) vs transient errors rethrown (route 5xx → PayPal retries). `src/app/api/webhooks/paypal/route.ts` — 503 unconfigured, 400 bad JSON/headers, 401 bad signature, 500 verification/processing failure.
- UI: `checkout/page.tsx` replaced the placeholder (empty/unavailable states, real cart summary, GBP total); `components/checkout/checkout-form.tsx` (delivery form, order summary, step 2 loads the PayPal JS SDK by script and renders Buttons whose `createOrder` returns the server-created order id and `onApprove` calls the capture action, then routes to success); `checkout/success/page.tsx` reads the signed cookie, shows paid/processing status and the snapshot.
- Tests (106 total, all passing; +35 for checkout): `checkout-service.test.ts` (integration + deterministic fake gateway: snapshot, begin/reuse/cancel, capture marks paid + clears cart, stable request id, amount/currency mismatch → PAYMENT_FAILED not paid, idempotent recapture, already-captured recovery), `paypal-webhook.test.ts` (approve/reject/dedupe/unknown), `orders-state.test.ts`, `checkout-schemas.test.ts`, `checkout-session.test.ts` (signed-cookie round-trip, tamper, expiry). Fake gateway in `tests/fake-paypal.ts`.
- Verification: `tsc --noEmit`, `eslint`, `pnpm test` (106/106), production `next build` clean. Runtime (prod build vs `zitsy_store`): `/`, `/shop`, `/cart`, `/checkout`, `/checkout/success` 200; unknown product 404; `/checkout` with no cart → empty state; with a seeded real cart → form + summary + `£59.56`; `/checkout/success` with no cookie → not-found state; `POST /api/webhooks/paypal` unconfigured → 503. Temp cart removed after verification.
- **PENDING:** real PayPal Sandbox capture is **not** run — `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`/`PAYPAL_WEBHOOK_ID`/`NEXT_PUBLIC_PAYPAL_CLIENT_ID` are empty in `.env`. The capture path is covered by the deterministic fake gateway only. Set credentials to exercise Sandbox.
- **Hotfix (browser createOrder contract):** the PayPal JS SDK Buttons `createOrder` callback returned the legacy `{ orderID }` object, which current SDK versions reject with _"Expected an order id to be passed"_. It must resolve to the PayPal order id **string**. Extracted `createOrderCallback()` (`src/lib/checkout/paypal-buttons.ts`) so the contract is unit-tested, and the browser now receives the server-created PayPal id (never the internal Zitsy order id, never `{ orderID }`). Verified against real Sandbox: server `createOrder` returns a string id; the headless browser SDK (v5.0.580) called `GetCheckoutDetails` with that same id and logged no SDK error.
- Not in scope (deferred): Printify order creation/fulfillment, confirmation emails, shipping/tax engine, coupons.

### Phase 6 — Fulfillment: Printify order creation, production, status sync (DONE)
- **Schema.** New enum `FulfillmentStatus` (`PENDING, SUBMITTED, ON_HOLD, SENDING_TO_PRODUCTION, IN_PRODUCTION, PARTIALLY_FULFILLED, FULFILLED, CANCELLED, ACTION_REQUIRED, UNFULFILLABLE`). `Order` gains `fulfillmentStatus` (default `PENDING`), `printifySubmittedAt`, `printifySentToProductionAt`, `printifyFulfilledAt`, `printifyLastSyncedAt`, `fulfillmentError`, `fulfillmentAttempts` (existing `printifyOrderId @unique`, `printifyStatus`, `trackingCarrier/Number/Url` reused). Migration `20261007014652_add_fulfillment`. **Payment and fulfillment are separate state machines**: `Order.status` stays `PAID` after payment and is never overwritten by fulfillment; `isPaidOrderStatus` is still `PAID`-only.
- `src/lib/fulfillment/status.ts` — tolerant Printify status mapping (hyphen/underscore-tolerant; unknown → `ACTION_REQUIRED`), `mergeFulfillmentStatus` (forward-only, terminal-aware), `fulfillmentLabel`. `address.ts` — `splitRecipientName` + `buildPrintifyAddress` (rejects any country except GB/DE and any missing required field, deterministically). `errors.ts` — `FulfillmentError` (safe user messages) + `classifyPrintifyError` (401/403 operational, 429 retryable, 400/422 terminal, network/timeout/5xx retryable **and ambiguous**). `service.ts` — the engine below.
- **Creation (idempotent).** `createPrintifyOrderForZitsyOrder(orderId, gateway?)`: guard order exists → not already submitted (return existing) → `PAID` → `Payment.status === COMPLETED` → non-empty items → every line's variant still matches its product and `printifyVariantId`, quantity `1..99` → GB/DE address. Builds `PrintifyCreateOrderRequest` with `external_id = order.orderNumber`, `label = orderNumber`, server-derived `line_items`/`address_to`, and `send_shipping_notification = false`. Claims the result with `updateMany({ where: { id, printifyOrderId: null } })` so a concurrent creator can never overwrite the first; a lost claim is logged loudly for manual reconciliation but never silently duplicated.
- **Ambiguity & reconciliation.** A network/timeout/5xx failure on create persists `fulfillmentError = ambiguous_create:<detail>` and leaves the order `PAID` with no `printifyOrderId`. The next attempt reconciles first: list recent Printify orders and match `external_id`/`metadata.shop_order_label`; if found it adopts that order, otherwise it refuses to recreate. Guard failures on a paid order (unsupported country, bad address, invalid variant, missing payment) escalate `fulfillmentStatus` to `ACTION_REQUIRED`. Transient (429) failures leave the state retryable. `fulfillPaidOrder(orderId, gateway?)` is the crash-safe entry point used by checkout/webhooks: it serializes concurrent triggers per order in-process and never throws.
- **Production.** Sending to production is **never** part of the create call. `sendPrintifyOrderToProduction` calls `POST …/send_to_production.json` explicitly and is idempotent (`printifySentToProductionAt` guard). `fulfillPaidOrder` auto-calls it only when `PRINTIFY_AUTO_SEND_TO_PRODUCTION=true` (default `false`); the failure of that call is recorded but never un-submits the order.
- **Webhooks.** `processPrintifyWebhook` now handles `order:created|updated|sent-to-production|shipment:created|shipment:delivered` from both the modern `{ resource: { id, data } }` and legacy `{ data: { resource_id, … } }` shapes. Updates apply only fulfillment fields via `applyPrintifyOrderUpdate` (forward-only, sets tracking/`printifyFulfilledAt` on delivery); unknown order ids return `ignored`, duplicate `eventId`s are processed once, and errors rethrow so Printify retries.
- **Surfacing.** `OrderSummary` now carries `fulfillment` (status, raw `printifyStatus`, tracking, timestamps); `/checkout/success` shows the fulfillment label and a tracking link for paid orders.
- Tests (+41; 147 total): `tests/fulfillment.test.ts` (creation payload/address/idempotency/guards/ambiguous+reconcile/concurrency/auto-send/idempotent production/webhook status+tracking+legacy+dedupe+terminal-safety/payment-untouched/real-client-disabled), `tests/fulfillment-units.test.ts` (status mapping + address), `tests/fake-printify.ts` (deterministic gateway). `tests/setup.ts` mocks `getPrintifyClient()` so **no test can reach the real Printify API**. `tests/printify-client.test.ts` updated to the real create payload (removed the non-existent `send_to_production` field). `tests/catalog-sync.test.ts` updated: order events are handled now (unmappable → `ignored`).
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (147/147), production `next build` clean. **Live Printify API** (GB, GBP, auto-send `false`): real order created from a live product/variant (`product_id`/`variant_id`/qty echoed back, `status: pending`), second call returned `already_submitted` with the same id (no duplicate), local order stayed `PAID` with `fulfillmentStatus: SUBMITTED`, and it was **never sent to production**. Finding: the single-order `GET` does **not** echo `external_id`, but the list endpoint returns `metadata.shop_order_label = <external_id>`, which is exactly what the ambiguity-reconciliation path (`listOrders`, ≤3 pages) matches on. The created Printify order remains `on-hold`/unproduced (`cancel.json` → `8501 Order status does not allow cancellation`); harmless but noted for cleanup.
- Not in scope (deferred): emails (Phase 7), auth/accounts (Phase 8), shipping/tax engine, order cancellation/refunds.

### Phase 7 — Commerce: pricing, FX, shipping, markets, catalog reconciliation (DONE)
- **Currency model.** Printify `variant.cost`, `variant.price` and shipping rates are in the shop's billing currency (USD here). Previously `variant.price` was stored verbatim as GBP — a silent USD-as-GBP bug. Now `PRINTIFY_COST_CURRENCY` (default `USD`) declares the source currency and the storefront derives its own GBP prices from the **fulfillment cost**, never from Printify's `price`. `STORE_FX_RATES` (e.g. `USD:GBP=0.754`) is a required, explicitly-configured rate table; `src/lib/fx.ts` (`parseFxRates`, `convertMinor`, `fxRate`, `FxRateError`) never assumes 1:1 and throws on a missing pair.
- **Pricing.** `src/lib/pricing.ts` — `toStoreMinor` (source minor → store currency minor), `charmPriceMinor` (round **up** to the next `.99`), `markupFloorMinor` (cost × (1 + markup)), `pricingFromCost` = cost → store currency → `STORE_MARKUP_PERCENT` (default `40`) floor → charm price. `STORE_MARKUP_PERCENT` is a **markup**, not a gross margin. Returns `null` when a variant has no usable cost. `ProductVariant.costMinor` added (migration `20261007065537_add_variant_cost_minor`) so the cost can be checked without recomputation. Printify's `variant.price`/`profit` are ignored.
- **Markets & address validation.** `src/lib/markets.ts` is the single source of shipping markets (GB, DE) with currency + national postcode patterns (`marketList`, `isSupportedCountry`, `countryName`, `validateShippingAddress`). Validation rejects unsupported countries, postcodes that don't match the market, and US-format addresses (US markers / full state names) mistakenly sent as GB/DE.
- **Shipping.** `src/lib/shipping.ts` — `calculateShipping(cart lines, destination, gateway?)` calls Printify `POST /shops/{shop_id}/orders/shipping.json`, requires the `standard` rate, converts it to store currency, caches identical quotes in-process (TTL 5 min), and fails safely (`shipping_unavailable`) instead of fabricating a number. The gateway is injected so tests never touch the network.
- **Checkout total authority.** `prepareCheckout(cartId, { destination, shippingGateway? })` performs the server-side revalidation/snapshot and adds shipping; `quoteCheckout` validates the address and returns an authoritative quote; `beginCheckout` derives the destination from the customer, recomputes shipping, and tells PayPal exactly that amount. `quoteCheckoutAction` powers a read-only estimate in `checkout-form.tsx` (debounced, shows "Calculating…" then the real amount) so the customer sees genuine shipping **before** payment. Shipping/tax rank: subtotal (server) + Printify standard shipping (server) = total (server); no client-supplied amount is trusted.
- **Profit safety.** `beginCheckout` calls `assertProfitable`, which uses the pure `src/lib/checkout/profitability.ts` `evaluateProfitability` over the whole order: `productRevenue + shippingRevenue − productionCost − expectedShippingCost − paymentFee − merchantFixedCost > 0` (all integer minor units). Product pricing and order-level profitability are deliberately separate concepts; shipping stays a separate customer charge but participates in the order check. `PAYMENT_FEE_PERCENT`/`PAYMENT_FEE_FIXED_MINOR` are conservative allowances (not contractual PayPal fees); `STORE_MIN_CONTRIBUTION_MINOR` (default `1`) and `STORE_MERCHANT_COST_MINOR` (default `0`) are documented knobs. A failed order is logged with safe structured figures and never reaches PayPal (`unprofitable_order`, generic customer message — no provider costs leaked). Prices are charm-rounded **up**, so the retail floor is never undershot. Merchant-side VAT is **not** modelled (no tax engine); see limitations.
- **Catalog webhooks.** `processPrintifyWebhook` product events now gate on `isFullProduct()`: only a payload that actually carries the full product shape (string `id` + non-empty `variants`) is upserted directly; a summary payload triggers `client.getProduct(id)` first. This prevents a summary event from wiping variants during `upsertProductFromApi`.
- **Scheduled reconciliation.** `GET /api/cron/catalog-sync` (`src/app/api/cron/catalog-sync/route.ts`) requires `Authorization: Bearer $CRON_SECRET` (503 when unset, 401 on mismatch), runs `syncCatalog`, and is wired to a daily Vercel cron in `vercel.json`. `syncCatalog` has an overlap guard: a full run within the last 30 minutes that has not finished causes the new run to be skipped (logged), so scheduled and manual syncs can't collide.
- Tests (+35; 182 total): `tests/fx.test.ts`, `tests/pricing.test.ts`, `tests/markets.test.ts`, `tests/shipping.test.ts` (currency/quote/unsupported/missing-rate/unreachable/cache), `tests/cron-catalog-sync.test.ts` (503/401/200/500), plus `checkout-service.test.ts` (quote + profit-safety) and new product-webhook authority cases in `catalog-sync.test.ts`. Catalog/cart fixtures updated to carry `cost` (the pricing source).
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (182/182), production `next build` clean.
- Not in scope (deferred): emails/notifications, auth/accounts, tax, coupons, order cancellation/refunds, Printify publishing/republishing.

### Known limitations (Phase 7 commerce)
- **No tax engine.** No customer-facing VAT/tax is calculated. `STORE_MERCHANT_COST_MINOR` is the only merchant-side cost knob.
- **Printify VAT is outside the pre-order check.** Printify applies VAT on its post-order invoice; it cannot be derived reliably from the pre-order variant cost + shipping quote, so `evaluateProfitability` deliberately excludes it. Real example (mug ×4 to DE): the modelled expected contribution is **+£6.60**, while the observed Printify VAT of ≈$12.57 (≈£9.48) would make the all-in figure negative. Profitability therefore means "profitable under the modelled costs", not a guarantee of all-in margin. Raise `STORE_MERCHANT_COST_MINOR` where a known per-order overhead exists.
- **Payment fee is an allowance.** `PAYMENT_FEE_PERCENT` / `PAYMENT_FEE_FIXED_MINOR` are conservative assumptions, not PayPal's contractual fees.
- **Shipping quote cache** is keyed by country / postcode / city / region plus cart lines (address-line text does not change carrier rates for a locality). `beginCheckout` always re-quotes server-side, so a cached value can never become the charged amount.
- **Single currency.** GBP storefront only; no multi-currency checkout.

### Phase 8 — Transactional email, login-free order tracking, customer support (DONE)
- **Schema.** Migration `20261007184826_phase8_email_tracking`: `Order.trackingToken String? @unique`, `Order.deliveredAt DateTime?`, `EmailLog.dedupeKey String? @unique`.
- **Env.** `SUPPORT_EMAIL` (store inbox, why it is separate from `EMAIL_FROM`), `RESEND_API_URL` (test-only base-URL override for the SDK). `integrations.email` = `RESEND_API_KEY && EMAIL_FROM`; `integrations.support` = `RESEND_API_KEY && SUPPORT_EMAIL`. `emailConfig()` additionally refuses to send in production when `NEXT_PUBLIC_APP_URL` is localhost, so email links can never be unopenable.
- **Send path.** `src/lib/email/`: `config.ts` (`emailConfig`, `absoluteUrl`, `contactUrl`), `client.ts` (`getEmailTransport` → official `resend` SDK, overridable for tests), `service.ts` (`sendTransactionalEmail` → `sent | duplicate | skipped | failed`, **never throws**: claims the `EmailLog` `dedupeKey` row, passes Resend `Idempotency-Key`, reclaims a stale `pending`, masks the recipient in logs), `errors.ts` (safe error text), `render.ts` + `templates/` (`EmailShell` layout, `EmailButton`/`SummaryRows`/`ItemList`/`DetailList` primitives, `@react-email/components` dropped for `@react-email/render` only), `order-notifications.ts` (`notifyOrderPaid/Submitted/Shipped/Delivered`, `runNotification` never throws).
- **Six emails.** order confirmed, order submitted to Printify, shipped (with carrier + tracking), delivered, admin new order (`SUPPORT_EMAIL`, internal markup), support received + support message (contact form). Keys: `order-confirmed|order-submitted|order-shipped|order-delivered|admin-new-order:<orderId>`, `support-message|support-received:<uuid>` — retried triggers never double-send.
- **Triggers (notification only, never business truth).** `markOrderPaid` → `notifyOrderPaid` (4 call sites in `checkout/service.ts`); `createPrintifyOrderForZitsyOrder` → `notifyOrderSubmitted`; `applyPrintifyOrderUpdate` → `notifyOrderShipped` / `notifyOrderDelivered` when the webhook actually advances state. A failed send is logged in `EmailLog` and cannot roll back payment, fail a PAID order or cancel a Printify order (`PRINTIFY_AUTO_SEND_TO_PRODUCTION` stays `false`).
- **Order tracking (no account).** `src/lib/orders/tracking.ts` (`createTrackingToken` = `randomBytes(24)` → base64url, `ensureTrackingToken`, `trackUrlForToken`, `buildOrderTrackingView`) + `tracking-actions.ts` (`lookupOrderAction`: Zod order number + email, one generic failure message for every miss, 10 lookups/min/IP). Pages `/(storefront)/track-order` (lookup form), `/track-order/[token]` (status, order number, items, address, totals, carrier/tracking + external link when present, no-login view) and `not-found` for a bad token. `/checkout/success` now links "Track your order".
- **Support.** `src/lib/contact/{schemas,service,actions}.ts` — Zod (`website` honeypot, message 10..2000 chars), 5 messages / 10 min / IP, delivers to `SUPPORT_EMAIL` with `Reply-To: customer` plus a receipt to the customer; `/contact` page + `contact-form.tsx` (client, `noValidate`, server errors in `role="alert"`); footer gains a **Help** column with **Track Order** and **Contact Us**.
- **Tests.** Unit **318/318 across 30 files** (`tests/fake-email.ts` transport injected through `tests/setup.ts`; new: `email-service` (dedupe/reclaim/skip/failed/redaction/no-secret-leak), `email-templates` (subjects, links, no localhost links, address block), `order-notifications` (4 triggers, idempotent, never throws), `tracking` (token entropy/uniqueness, lookup generic failure, view), `contact` (validation, honeypot, rate limit, both emails)). E2E **11/11** (`e2e/`): seeded test DB + local Resend HTTP stub (`e2e/resend-stub.ts` writes captured mail to `e2e/.resend-capture.json`) — tracking page/lookup failure/success/carrier details, contact validation + real submit captured by the stub, footer links, and the confirmation email's tracking link opened in the browser without logging in.
- **E2E gotchas recorded.** `playwright.config.ts` overrides `DATABASE_URL` (test DB) and `RESEND_API_URL` (stub) before workers spawn, so neither the app nor the tests can touch the dev DB or the real Resend API; Playwright transpiles imported `.tsx` with its **own** JSX runtime (`playwright/jsx-runtime`, objects `{__pw_type: 'jsx'}` that React cannot render), so every email template carries `/** @jsxImportSource react */` to keep server-side rendering inside test workers. `vitest.config.ts` excludes `e2e/**` so specs are not run by `pnpm test`.
- Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (318/318), `pnpm build` (`/contact`, `/track-order`, `/track-order/[token]` routes present), `pnpm test:e2e` (11/11).
- Not in scope (deferred): auth/accounts, email queue/worker (sends are inline best-effort), ticket dashboard/CRM, marketing email of any kind, live Resend delivery (verified against the local stub — no real customer email was sent).

### Known limitations (Phase 8 email/tracking/support)
- **Rate limits are in-process memory** (`src/lib/rate-limit.ts`): correct for the current single-instance deployment, not for multi-instance/serverless without a shared store.
- **No queue/retry worker.** A failed send is recorded in `EmailLog` as `failed`; there is no automatic re-send sweep (the same trigger re-fires safely only when the underlying event is re-processed).
- **Tracking link possession = read-only access** by design (no login). Tokens are random, revocable only by regenerating them, and never appear in list pages.
- **Live Resend sending was not exercised in this phase** — delivery is verified against a local HTTP stub that speaks the Resend API shape.

### Phase 9 — Admin analytics, privacy hardening, deployment readiness (DONE)
- **Runtime pin.** Added `.nvmrc`/`.node-version` (`22.23.1`) and `package.json` `engines` (`>=22.13.0 <23`); aligned `@types/node` to 22. pnpm `11.5.2` remains the package manager. This fixes the previous ambiguity where the default shell Node 20 could not run pnpm 11.
- **Admin authorization.** Added `src/lib/admin/guard.ts` (`requireAdminPage`) and used it in `/admin/analytics`; the page no longer reads the session inline. Removed the unused boolean `requireAdmin` helper. Added guard unit tests plus the existing unauthenticated E2E redirect.
- **Search privacy.** Search forms now post through a server action and store the current term in an HttpOnly SameSite=Lax session cookie scoped to `/search`, so `/search` has no `?q=`. `src/proxy.ts` redirects legacy `?q=` URLs and carries the term in that cookie; the original inbound URL can still be retained by browser history or edge logs before the redirect, which is a residual limitation outside the app. Search analytics sends only `{ results }`. GA4 `page_location`/`page_referrer` are sanitised to `origin + pathname`, and the search page and header form remain `data-clarity-mask="true"`. Clarity URL masking remains an external setting and Clarity stays disabled until it is verified.
- **Clarity route race.** Added `syncClarityRoute()` and a load callback: Clarity is not injected on private routes, a script that finishes loading after entry into a private route is stopped, and leaving a private route starts it again. Regression tests cover public/private mapping, private-before-load, load-after-private, and private-to-public transitions.
- **Purchase analytics.** Added `shouldTrackPurchase()` so the purchase event requires `paidAt != null` and a status other than `CANCELLED`. Browser dedupe remains per order number in local/session storage; there is still no refund event or cross-browser dedupe. The database remains the sales source of truth.
- **Dependency audit.** Updated transitive `lodash` to `4.18.1` and `fast-uri` to `3.1.9` within their existing parent ranges. Pinned `vite@^8.3.5` as a direct devDependency so Vitest no longer resolves the vulnerable `8.3.2` optional peer; this is a normal dependency pin, not a pnpm override. The full `pnpm audit` (including dev tooling) is clean; no overrides were added. Prisma remains `7.10.1`; Prisma 8 is still a release candidate and is not adopted.
- **Docs and configuration.** Added `docs/DEPLOYMENT.md`, replaced the generic README deployment guidance, updated `.env.example` with `SUPPORT_EMAIL` and the Node requirement, and refreshed the architecture's stale auth/FX/shipping/catalog/migration details.
- **Verification.** `pnpm typecheck`, `pnpm lint`, `pnpm test` **402/402 across 43 files**, `pnpm test:e2e` **18/18**, and production `next build` all pass under Node `22.23.1`. Migrations total **8**.

### Final production-readiness audit
- **Outcome: READY WITH REQUIRED PRE-LAUNCH ACTIONS.** No unfixed code blockers remain; the readiness blockers are environment/credential configuration described under *Required pre-launch actions* below. A follow-up review found and fixed the search URL analytics leak described below.
- **Fixed in this audit:**
  - **Search terms leaked through search URLs (HIGH).** `/search?q=...` exposed the raw term in the URL, browser history, referrers, and GA4 page context; DOM masking did not cover URLs. Search now posts through a server action into an HttpOnly session cookie, legacy links are redirected by `src/proxy.ts`, and GA4 page context is sanitised to `origin + pathname`. Clarity remains disabled until its external URL masking is verified.
  - **Order reuse ignored address edits (HIGH).** `beginCheckout` reused an in-flight `PAYMENT_PENDING` order when email + total + cart snapshot matched. Flat-rate shipping makes two different GB addresses cost the same, so an address-only edit was silently shipped to the customer's previous address. The reuse predicate now compares the full contact + shipping address too (`recipientName, address1, address2, city, region, postalCode, country, phone`); any change cancels the old order and creates a new one.
  - **Paid order could sit unfulfilled with no retry (HIGH).** Fulfillment failures were recorded but nothing ever ran the idempotent `fulfillPaidOrder` again, and the customer-facing message promised an automatic retry that did not exist. Now (a) the already-paid early-return branches in `captureOrderPayment`/`confirmCapturedPayment` also retry fulfillment on every later capture/webhook event, and (b) a new scheduled sweep `/api/cron/fulfillment-retry` (daily 03:15 UTC, `CRON_SECRET`-protected, timing-safe) re-runs `fulfillPaidOrder` for `PAID`/unsubmitted orders stuck on a transient `printify_unavailable` error, bounded by `fulfillmentAttempts < 10` (batch 20). Ambiguous creates and data errors are deliberately excluded (recreate would risk duplicates; retrying cannot fix data).
  - **Clean-checkout build failed (BLOCKER/deployment).** `src/generated/` is gitignored and nothing regenerated it, so a fresh install/deploy could not build. `package.json` now has `postinstall: prisma generate` and `build: prisma generate && next build`.
  - **No baseline security headers (MEDIUM).** `next.config.ts` now sets the header set in §9 (no CSP by design) and `Cache-Control: private, no-store` on `/checkout/success` and `/track-order/*`; `X-Powered-By` removed.
  - **JSON-LD `</script>` breakout (MEDIUM).** The product page's `application/ld+json` used `dangerouslySetInnerHTML` with unescaped `JSON.stringify`; `<` is now escaped to `\u003c` so a catalog string cannot break out of the script element.
  - **Cron bearer comparison not timing-safe (LOW).** Both cron routes now share `src/lib/cron/auth.ts` (`verifyCronAuth`, length-checked `timingSafeEqual`).
- **Follow-up release-review fixes.** Removed the query-based `SearchAction` from site JSON-LD; admin paid metrics now exclude `CANCELLED` orders; search and purchase tracking dedupe state is keyed to the current query/order so new events are not suppressed; removed the unused `AUTH_URL`; documented `AUTH_SECRET` generation, canonical URL validation, proxy IP trust assumptions, and the residual legacy-search exposure; added cancellation analytics and structured-data E2E regressions.
- **Required pre-launch actions (environment/credentials in the deployment environment, not code):**
  1. `DATABASE_URL` → the production Postgres (the local `.env` currently points at `localhost`).
  2. `NEXT_PUBLIC_APP_URL` → the real production domain (dev uses `localhost`; a production build refuses localhost by design).
  3. `PAYPAL_ENVIRONMENT=production` (currently `sandbox`) with the matching production `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` set to a **real-verified webhook** (currently empty ⇒ `/api/webhooks/paypal` 503s, fail closed).
  4. `PRINTIFY_WEBHOOK_SECRET` → the same secret configured at Printify for `product:created/updated/deleted/order:status` webhooks (currently empty ⇒ `/api/webhooks/printify` 503s, fail closed).
  5. `CRON_SECRET` → a random value (missing ⇒ catalog + fulfillment-retry crons 503).
  6. `EMAIL_FROM` / `SUPPORT_EMAIL` → a **Resend-verified** sender/domain (currently `zitsy.example` placeholders); any customer email to an unverified domain is a configuration 403 from Resend, not an app bug.
  7. Run `prisma migrate deploy` against production before turning traffic on (8 migrations).
  8. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` to a long, unique pair if the admin dashboard is required; leave both unset to keep it unusable.
  9. Vercel: configure all env vars for the Production environment. **Cron cadence is Hobby-compatible (§3).** Both crons run at most once per day (`0 3 * * *` catalog sync, `15 3 * * *` fulfillment retry); the fulfillment sweep makes no hourly assumption — it is stateless, idempotent and bounded, so daily execution is safe. **Documented trade-off of Hobby's once-per-day cron limit:** a paid order held on a transient Printify error is now re-attempted at most once per day (fastest retry is still the PayPal-side already-paid branches, which run on each later capture/webhook event); the customer message ("We will retry automatically") makes no timing promise, so it stays accurate. A paid plan (or external cron) would allow a tighter cadence without any code change.
- **Verification (§32):** `pnpm typecheck` ✓, `pnpm lint` ✓ (0/0), `pnpm test` **402/402 across 43 files**, `pnpm build` ✓ (evaluated with `NEXT_PUBLIC_APP_URL=https://zitsy.example` per the localhost guard; a localhost `.env` intentionally fails a production build), `pnpm test:e2e` **18/18**, all under Node `22.23.1` with pnpm `11.5.2`. All unconfigured integration endpoints verified to fail closed (503) against the production build.

### Next phase
Phase 10 — polish, Phase 11 — final verification. Customer accounts are not planned in the current scope.
