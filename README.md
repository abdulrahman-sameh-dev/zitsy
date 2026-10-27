# Zitsy

Zitsy is a Next.js storefront for print-on-demand products, with Printify
fulfillment, PayPal checkout, transactional email, login-free order tracking,
and a private admin analytics dashboard.

## Prerequisites

- Node.js `>=22.13.0 <23` (the pinned local version is in `.nvmrc`)
- pnpm `11.5.2` (declared by `packageManager`)
- PostgreSQL

## Local development

```bash
nvm use
pnpm install
cp .env.example .env
# Set AUTH_SECRET in .env to the output of:
openssl rand -base64 32
pnpm prisma migrate dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

E2E tests use the separate `zitsy_store_test` database and a local Resend stub;
they never touch the development database or the real Resend API.

## Production origin

The canonical production origin is `https://zitsy.darkhub.dev`. It is read from
`NEXT_PUBLIC_APP_URL` and is the single source for canonical URLs, Open Graph
URLs, JSON-LD, the sitemap, `robots.txt`, and customer tracking links.

- Production: `NEXT_PUBLIC_APP_URL=https://zitsy.darkhub.dev`
- Local dev: `NEXT_PUBLIC_APP_URL=http://localhost:3000`

The value must be an absolute URL; the app strips a trailing slash.
Environment validation rejects invalid URLs and, in production, any value
containing `localhost` (see `src/lib/config/env.ts`). The `*.vercel.app`
restriction is an operational deployment rule, not a code check. Use HTTPS in
production.

## Documentation

- Architecture and phase history: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Deployment and migration runbook: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Deploy on Vercel

Use the runbook in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Vercel should use
Node 22.x (from `package.json` `engines`), pnpm from `packageManager`, and the
standard `pnpm build` command. Configure the production environment variables
before building; `NEXT_PUBLIC_*` values are compiled into the client bundle.
