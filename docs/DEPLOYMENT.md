# Deployment runbook

This runbook covers a production deployment of Zitsy. It does not create
provider credentials, run a catalog sync, or send customer email. Keep secrets
in the hosting provider or a secret manager; never commit them or paste them
into build logs.

## 1. Runtime and build prerequisites

- Node.js `>=22.13.0 <23`. The local pin is `.nvmrc` / `.node-version`
  (`22.23.1`), and `package.json` declares the Vercel-compatible range.
- pnpm `11.5.2`, declared by `packageManager`.
- PostgreSQL with the `Order`, `OrderItem`, `Payment`, and other Prisma tables.
- The project must build from a clean checkout: `postinstall` and `build` both
  run `prisma generate`.

```bash
nvm use
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Run the final `pnpm build` with the production `NEXT_PUBLIC_APP_URL`, because
public environment values are compiled into the client bundle.

## 2. Environment variables

Set these in the production environment before the first build.

### Required

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Production Postgres URL. Use the pooled/runtime URL if the provider supplies one. |
| `AUTH_SECRET` | At least 32 random characters (for example, `openssl rand -base64 32`). Signs order, admin, and other cookies. Rotating it invalidates sessions. |
| `NEXT_PUBLIC_APP_URL` | Exactly `https://zitsy.darkhub.dev`. Must not be localhost or a `*.vercel.app` preview URL. |
| `STORE_CURRENCY` | `GBP`. |

`NEXT_PUBLIC_APP_URL` must be an absolute URL; a trailing slash is normalised.
Code validation rejects invalid URLs and any value containing `localhost` in a
production build. Rejecting preview hosts and requiring HTTPS are operational
rules, not additional code checks.

### Commerce and integrations

| Variable | Notes |
|---|---|
| `PAYPAL_ENVIRONMENT` | `production` for live payments. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Production PayPal app credentials. |
| `PAYPAL_WEBHOOK_ID` | ID of the webhook verified in PayPal. Missing means `/api/webhooks/paypal` fails closed with 503. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Browser PayPal client ID; may be omitted when `PAYPAL_CLIENT_ID` is set. |
| `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID` | Server-only Printify credentials. |
| `PRINTIFY_WEBHOOK_SECRET` | Secret configured for Printify webhooks. Missing means `/api/webhooks/printify` fails closed with 503. |
| `PRINTIFY_COST_CURRENCY`, `STORE_FX_RATES` | Pricing/FX source configuration. |
| `STORE_MARKUP_PERCENT` | Retail markup over converted fulfillment cost. |
| `PAYMENT_FEE_PERCENT`, `PAYMENT_FEE_FIXED_MINOR` | Conservative profitability assumptions, not contractual PayPal fees. |
| `STORE_MIN_CONTRIBUTION_MINOR`, `STORE_MERCHANT_COST_MINOR` | Order-level profitability guard. |
| `CRON_SECRET` | Bearer secret for both cron routes. Missing means the routes fail closed with 503. |

### Email and support

| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Resend API key. |
| `EMAIL_FROM` | Verified Resend sender, e.g. `Zitsy <orders@yourdomain.com>`. |
| `SUPPORT_EMAIL` | Store inbox for contact messages and internal order notices. Separate from `EMAIL_FROM`. |

### Admin

| Variable | Notes |
|---|---|
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Both are required to enable admin sign-in. Use a long, unique password. Sessions are bound to the current credentials and expire after 12 hours. |
| `AUTH_SECRET` | Also required for admin session signing. |

### Client IP trust

`getClientIp()` (`src/lib/http.ts`) prefers `x-real-ip` and falls back to the
first `x-forwarded-for` address. Per-IP limits for admin login, order tracking,
and contact messages are only meaningful if the hosting proxy sets or overwrites
those headers. Vercel's exact header behavior has not been independently
verified in this repository; verify it before launch, and do not trust these
headers if clients can supply them directly.

### Analytics (optional)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 measurement ID. Compiled at build time. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Microsoft Clarity project ID. Compiled at build time. |

Analytics is consent-gated in the browser. If you change a `NEXT_PUBLIC_*`
analytics value, redeploy so the new value is included in the client bundle.
Admin credentials are server-side runtime values and do not require a rebuild
when rotated.

Keep `NEXT_PUBLIC_CLARITY_PROJECT_ID` empty until URL masking is enabled and
verified in the Clarity dashboard. DOM `data-clarity-mask` attributes do not
mask URLs. The application removes search terms from URLs and from GA4
`page_location`/`page_referrer`, but Clarity captures page URLs independently.

Do not set `RESEND_API_URL` in production; it exists only for the local E2E
stub.

## 3. Database migrations

There are currently **8 migrations** under `prisma/migrations`. They are
ordered schema changes, not a single interchangeable unit. The two newest are:

- `20261026120000_admin_login_rate_limit` — creates `RateLimitBucket`.
- `20261026121000_admin_analytics_indexes` — adds four indexes used by the
  admin dashboard.

Those two are additive. The index migration uses regular `CREATE INDEX`, not
`CREATE INDEX CONCURRENTLY`, so it can lock writes on large tables while the
indexes are built. Earlier migrations include the initial schema, order and
fulfillment columns, a `costMinor` column that defaults to `0`, and unique
indexes for tracking tokens and email deduplication. Review every pending
migration against the target; the number of files does not establish that they
can or should be applied together.

### Required gates

Do not apply any production migration until all of these are complete:

1. Confirm the release commit, target database, and production environment
   values.
2. Take a database backup or provider snapshot, and verify that it can be
   restored.
3. Inspect `_prisma_migrations`, the actual application schema, row counts, and
   table sizes on the target.
4. Review every pending migration in dependency order and obtain an approved
   migration plan.
5. Rehearse the approved migration plan against a restored copy in an isolated
   staging environment.

Provide the direct/unpooled Postgres URL to the migration command if your
provider requires a direct connection. Do not commit it or print it.

Do not run `prisma migrate dev`, `prisma db push`, or a catalog sync as part of
this migration step.

### Migration history

`_prisma_migrations` records only the migrations Prisma has run. An empty table
or a missing table does **not** mean the application database is empty.

- **Genuinely new database:** there are no application tables and no migration
  history. This still requires review of all 8 migrations and an approved plan;
  do not apply them blindly.
- **Existing database with empty or missing `_prisma_migrations`:** the history
  is absent, not the data. Application tables or data may already exist. Stop
  and inventory the schema and data. An operator must establish the correct
  history and reviewed plan; do not run `prisma migrate deploy`,
  `prisma migrate resolve`, `prisma migrate reset`, baselining, or manual
  migration SQL to make status pass.
- **Existing database with non-empty but incomplete history:** `migrate status`
  may list pending migrations, but it does not prove the recorded history or
  actual schema is compatible. Verify each recorded migration name against the
  schema, then review every pending migration.

### Check status

```bash
pnpm prisma migrate status
```

The status output identifies pending migrations. It is not approval to apply
them together, and it does not prove that the target is safe to migrate. Review
every pending migration against the verified history and schema, and follow the
approved plan.

### Apply the reviewed plan

Only after the required gates and history checks, apply the pending set approved
in the migration plan. A single `migrate deploy` is appropriate only when that
plan confirms every pending migration is compatible with the target and the lock
risk is acceptable; otherwise split or defer the work under a revised plan.

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
```

For the two newest migrations, verify that `RateLimitBucket` and these indexes
exist:

- `Order_currency_paidAt_idx`
- `Order_status_idx`
- `OrderItem_productId_idx`
- `Payment_status_idx`
- `RateLimitBucket_resetAt_idx`

### Concurrent-index path (only if approved)

This path is not a way to create or repair missing migration history. Use it
only after the history and schema are verified, the database has been restored
and rehearsed in staging, and the approved migration plan explicitly selects
it.

If the `Order`, `OrderItem`, or `Payment` tables are large enough that a normal
index build is not acceptable, the operator may apply the two newest migrations
in two stages instead of running `migrate deploy` over both files.

1. Apply the rate-limit migration SQL explicitly, for example with `psql`
   against the direct URL:

   ```bash
   psql "$DIRECT_DATABASE_URL" -f prisma/migrations/20261026120000_admin_login_rate_limit/migration.sql
   pnpm prisma migrate resolve --applied 20261026120000_admin_login_rate_limit
   ```

2. Run each index statement from
   `prisma/migrations/20261026121000_admin_analytics_indexes/migration.sql`
   individually with `CREATE INDEX CONCURRENTLY`, replacing each `CREATE INDEX`
   with `CREATE INDEX CONCURRENTLY`. Run them outside a transaction.

3. Verify the indexes are valid, with no `indisvalid = false` rows:

   ```sql
   SELECT indexrelid::regclass, indisvalid
   FROM pg_index
   WHERE indexrelid::regclass::text IN (
     'Order_currency_paidAt_idx',
     'Order_status_idx',
     'OrderItem_productId_idx',
     'Payment_status_idx'
   );
   ```

4. Mark the migration as applied only after all four indexes are valid:

   ```bash
   pnpm prisma migrate resolve --applied 20261026121000_admin_analytics_indexes
   pnpm prisma migrate status
   ```

If a concurrent index build fails, it can leave an invalid index. Investigate
and drop only that index before retrying; do not mark the migration applied
until every index is valid.

## 4. Deploy and smoke-test

Recommended order:

1. Confirm the release commit and production environment variables.
2. Take the database backup or snapshot and verify it can be restored.
3. Inspect migration history, schema, row counts, and table sizes; review all
   pending migrations and obtain an approved plan.
4. Restore that backup into isolated staging and rehearse the approved migration
   plan there.
5. After operator approval, apply the reviewed plan to production and verify
   migration status.
6. Build and deploy the application.
7. Run the smoke checks below.

Smoke checks:

- `/`, `/shop`, `/search`, `/cart`, `/checkout`, and `/track-order` return
  the expected pages.
- Submitting either search form keeps the address bar at `/search` and shows
  the matching search state.
- `/search?q=tote` redirects to `/search` and shows the matching search state;
  the address bar must not retain `?q=`.
- `/admin/analytics` redirects an unauthenticated visitor to `/admin/login`.
- The configured admin can sign in, see the analytics dashboard, and sign out.
- `/robots.txt` disallows `/admin`, `/checkout`, and `/track-order`.
- `/checkout` with an empty cart shows the empty state.
- The public search page and header search input carry
  `data-clarity-mask="true"`. This masks DOM content only, not URLs.
- With analytics configured, the consent banner appears and no analytics
  requests are made before consent.
- Webhook endpoints are configured and reject unsigned/unknown requests; do not
  send fake production payment events as a smoke test.

Do not run a full catalog sync, create test orders, or send test customer email
unless you have explicitly planned those checks with the store owner.

## 5. Rollback

- Redeploy the previous application build if the release itself is faulty.
- The two new migrations are additive. Keeping `RateLimitBucket` and the new
  indexes in place is harmless for the previous application build.
- Do not drop tables or indexes as a first response to an application error;
  diagnose first. Dropping data is a separate, explicit recovery operation.
- If a migration failed partway through, use `pnpm prisma migrate status` and
  inspect the database before using `prisma migrate resolve`. Never mark a
  failed migration applied without verifying its effects and obtaining operator
  approval under a reviewed recovery plan.

## 6. Analytics and privacy notes

- New searches do not place terms in page URLs. Search forms submit through a
  server action and the current term is stored in an HttpOnly, SameSite=Lax
  session cookie scoped to `/search`. Legacy `/search?q=` links are redirected
  to `/search` by `src/proxy.ts`, with the term carried in that cookie. The
  search event contains only a result count. The original legacy URL can still
  be retained by browser history, referrers, or edge logs before the redirect;
  that residual exposure cannot be removed by the application.
- GA4 event context is sanitised in `src/lib/analytics/url.ts`: caller-supplied
  `page_location` and `page_referrer` are removed and replaced with
  `origin + pathname`. Search terms remain in the POST body, cookie and server
  request, so hosting/proxy logging must not capture request bodies or raw
  query strings. The application logger does not log search terms.
- Search inputs and the search page are masked from Clarity session replay, but
  URL masking is a separate external Clarity setting. Keep Clarity disabled
  until that setting is enabled and verified in the Clarity dashboard.
- Analytics page views and Clarity are suppressed on `/admin`, `/checkout`, and
  `/track-order` paths. The route-level Clarity handling re-checks the current
  path when the script finishes loading, so entering a private route during
  script load does not leave Clarity tracking.
- Before enabling GA4, disable Enhanced Measurement's **Page changes based on
  browser history events** setting for the web data stream. `send_page_view:
  false` only suppresses the tag's initial automatic page view; when the
  history-change option is enabled, GA4 sends its own `page_view` on SPA
  navigation, duplicating the application's events and emitting page views for
  `/checkout` and `/track-order`. After deployment, verify in GA4 DebugView or
  Realtime that public routes emit exactly one `page_view`, private routes emit
  none, and search/purchase payloads contain no raw search term.
- The purchase event is emitted only for paid, non-cancelled orders. Browser
  deduplication is per order number in local/session storage; a different
  browser or cleared storage can report the same purchase again. There is no
  refund event, and a paid order that remains `PAID` after a future refund
  workflow would still satisfy the current analytics rule. Keep the database as
  the sales source of truth.
- The full dependency audit, including dev tooling, is clean after updating
  transitive `lodash` and `fast-uri` and pinning `vite@^8.3.5` as a direct
  devDependency to replace Vitest's vulnerable `8.3.2` optional peer. This is a
  normal dependency pin, not a pnpm override. Re-run `pnpm audit` after
  dependency changes. Prisma 8 is still a release candidate and is not adopted
  by this runbook.

## 7. Post-deploy

- Re-run `pnpm audit` (including dev tooling) on the release commit.
- Confirm the deployed Node version is 22.x and the build used the pinned pnpm
  version.
- Confirm Vercel cron configuration still calls both `/api/cron/*` routes with
  `CRON_SECRET`.
- Record the migration status and smoke-test result in the release notes.
