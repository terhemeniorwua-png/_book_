# Apartment Booking foundation

This repository uses pnpm workspaces with an independently deployable Next.js frontend (`apps/web`) and Express API (`apps/api`). PostgreSQL persistence is assigned to Sequelize models and Umzug migrations in the API. Product and reservation features are scheduled in [phases.md](./phases.md).

## Requirements

- Node.js 20.20.0 (or compatible Node 20.9+)
- pnpm 10.34.5
- PostgreSQL for future database-backed features

## Local setup

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The web app serves on `http://localhost:3000`; the API serves on `http://localhost:4000`, with its health endpoint at `/health` and versioned API root at `/api/v1`. The API requires `DATABASE_URL` at startup even though the Phase 1 health endpoints do not connect to the database. Replace example values with your own local settings; do not commit environment files.

## Checks

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Run the browser smoke test with `pnpm test:e2e`. Install its browser once with `pnpm --filter @apartment/web exec playwright install chromium`.

Database migrations run with `pnpm db:migrate` and roll back the most recent migration with `pnpm db:migrate:undo`. Migrations require a reachable PostgreSQL database configured in `apps/api/.env`.

For coding and security conventions see [agent.md](./agent.md). Environment variable templates are maintained per application in `apps/api/.env.example` and `apps/web/.env.example`.

## Administrator dashboard

Provision the first administrator using the API's interactive, one-time command: `pnpm --filter @apartment/api db:provision-admin`. It requires a unique administrator email and prompts for a password; there is no public registration route. Visit `/admin/login` after starting the apps. Administrator sessions are stored as token hashes in PostgreSQL, expire after eight hours, and use an HttpOnly `SameSite=Strict` cookie (Secure in production) plus a CSRF token for dashboard requests. Configure the exact website origin in API `CORS_ORIGINS`; credentialed API requests are restricted to that allowlist. Refund requests are full refunds, restricted to `superadmin`, submitted through Paystack, and left in `refund_pending` until provider verification completes.

Apply the new schema using the normal forward-only deployment migration command `pnpm --filter @apartment/api db:migrate`. The migration adds administrator sessions and audit events; it does not drop application records. Before deploying, run the API and web checks and the database integration suite against a disposable PostgreSQL database using `TEST_DATABASE_URL`.
