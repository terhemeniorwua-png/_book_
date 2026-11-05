# Production deployment and operations

## Deployment target

No hosting provider is selected or configured in this repository. The web app
and API are separate services, so the eventual target must provide a Next.js
Node runtime, a long-running Node API service, PostgreSQL, and Redis. Select
providers and domains before release; provider-specific dashboard steps cannot
be stated as completed until that decision is made.

Use sibling HTTPS origins such as `www.example.com` and `api.example.com` for
the web and API. Administrator cookies are `Secure`, `SameSite=Strict`, and
host-only; a cross-site frontend/API pair will not support the current
credentialed administrator flow. Configure DNS and valid certificates for both
origins before enabling production traffic.

## Environment variables

Use the variables in `apps/api/.env.example` and `apps/web/.env.example` as the
authoritative templates. These files contain placeholders only; never copy
production credentials into Git.

| Service | Variable                                                                                         | Development                                | Tests                                                                                                                        | Production                                                                          |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| API     | `NODE_ENV`                                                                                       | `development`                              | `test`                                                                                                                       | `production`                                                                        |
| API     | `PORT`                                                                                           | 4000 default                               | ephemeral test server                                                                                                        | hosting-injected port                                                               |
| API     | `DATABASE_URL`                                                                                   | Required PostgreSQL URL                    | Not used when `NODE_ENV=test`                                                                                                | Required managed PostgreSQL URL                                                     |
| API     | `TEST_DATABASE_URL`                                                                              | Optional                                   | Required for API test imports, test migrations, and DB integration; integration requires a reachable dedicated disposable DB | Never configure                                                                     |
| API     | `DB_SSL`                                                                                         | `false` for local DB                       | according to test DB                                                                                                         | Required `true`, certificate verification enabled                                   |
| API     | `DB_POOL_MAX`                                                                                    | Optional, defaults to 10                   | Optional                                                                                                                     | Set for DB connection limits                                                        |
| API     | `REDIS_URL`                                                                                      | Optional; local rate limit store otherwise | Optional                                                                                                                     | Required for shared limits across instances; use TLS `rediss://` where supported    |
| API     | `CORS_ORIGINS`                                                                                   | Exact local web origin                     | Test origin if used                                                                                                          | Comma-separated exact HTTPS web origins                                             |
| API     | `TRUST_PROXY_HOPS`                                                                               | 0 direct local requests                    | 0 unless test proxy                                                                                                          | Exact trusted reverse-proxy hop count                                               |
| API     | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_SENSITIVE_MAX`, `RATE_LIMIT_APARTMENT_MAX` | Defaults are suitable for local use        | Defaults or test overrides                                                                                                   | Tune with traffic and provider limits; Redis must be enabled                        |
| API     | `BOOKING_TIME_ZONE`                                                                              | Defaults to `Africa/Lagos`                 | Same policy as fixtures                                                                                                      | Explicit business timezone                                                          |
| API     | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`                                                     | Optional matching test keys                | Mocked by E2E; sandbox keys only for staging round-trip                                                                      | Required matching live keys in secret manager                                       |
| API     | `PAYSTACK_CALLBACK_URL`, `PAYSTACK_WEBHOOK_URL`                                                  | Optional local/test URLs                   | Mocked by E2E                                                                                                                | Required HTTPS callback and exact registered webhook URLs                           |
| API     | `PAYSTACK_CURRENCY`, `PAYMENT_RECONCILIATION_AGE_MINUTES`                                        | Defaults to NGN/30                         | Defaults                                                                                                                     | NGN only; set reconciliation age for operations                                     |
| API     | `CUSTOMER_APP_URL`                                                                               | Web origin used in email links             | Playwright origin if email delivery is exercised                                                                             | Canonical HTTPS web origin; no trailing path                                        |
| API     | `EMAIL_PROVIDER_API_URL`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`                         | Optional; blank keeps notifications queued | Optional; mocked or omitted                                                                                                  | Set all three to enable guest and active-administrator transactional email delivery |
| API     | `SUPPORT_EMAIL_ADDRESS`                                                                          | Optional support contact in customer email | Optional                                                                                                                     | Optional customer support address included in Staywell templates                    |
| API     | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`                                                          | Optional; blank disables uploads           | Optional                                                                                                                     | Optional; use private bucket and workload identity                                  |
| API     | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                                       | Optional local credentials                 | Optional                                                                                                                     | Prefer provider workload identity; if keys are unavoidable, store in secret manager |
| API     | `LOG_LEVEL`                                                                                      | Defaults to `info`                         | Defaults to `info`                                                                                                           | `info`/`warn`, JSON logs sent to hosting collector                                  |
| Web     | `NEXT_PUBLIC_API_BASE_URL`                                                                       | Browser reachable API URL                  | Mock API URL in Playwright                                                                                                   | Public HTTPS API base ending `/api/v1`                                              |
| Web     | `API_BASE_URL`                                                                                   | Server-side API URL                        | Mock API URL in Playwright                                                                                                   | Server reachable API URL ending `/api/v1`; may be private network address           |
| Web     | `NEXT_PUBLIC_APP_URL`                                                                            | Local web origin                           | Playwright origin                                                                                                            | Canonical HTTPS web origin                                                          |
| Web     | `PORT`                                                                                           | Next default 3000                          | 3015 in Playwright config                                                                                                    | Hosting-injected port                                                               |

No session signing secret is required: administrator session tokens are
cryptographically random, stored only as hashes, and CSRF tokens are bound to
the database session. `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` are
only needed temporarily for the one-time provisioning command; inject them
from a secret manager or protected shell, then remove them. Transactional
email is optional: when `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`, and
`EMAIL_PROVIDER_API_URL` are configured, booking, cancellation, and refund
messages are delivered through that HTTPS provider endpoint; otherwise
notification rows remain `queued`. There is no monitoring SDK or monitoring
secret; structured JSON logs go to stdout/stderr for collection by the hosting
platform. Add a monitoring integration as a separately reviewed feature before
relying on it operationally.

Paystack receipt email is configured in the Paystack Dashboard, not by Staywell:
open **Settings → Preferences** and enable transaction receipts for customers
(or customers and the business). Set the support email under **Settings →
Contact**. The backend supplies the guest email at transaction initialization
and separately sends the Staywell confirmation after server-side verification.
See Paystack's [receipt preferences](https://support.paystack.com/en/articles/2131010).

Staywell email uses the existing API adapter, defaulting to
`https://api.resend.com/emails`. Set `EMAIL_PROVIDER_API_URL`,
`EMAIL_PROVIDER_API_KEY`, and `EMAIL_FROM_ADDRESS` in the API deployment
environment to enable delivery; `SUPPORT_EMAIL_ADDRESS` is optional. Email
events are deduplicated in PostgreSQL and transient provider errors are retried
once using the same provider idempotency key. Keep these values out of the web
deployment and source-controlled environment files.

## Build, start, migrate

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Build and start the independent services with:

```sh
pnpm --filter @apartment/web build
pnpm --filter @apartment/web start
pnpm --filter @apartment/api build
pnpm --filter @apartment/api start
```

Run the forward migration once as a release job, after taking a database backup
and testing the migration against a restored/staging copy:

```sh
pnpm --filter @apartment/api db:migrate
```

Production migration downs are intentionally disabled. Roll back an application
release by redeploying the prior application artifact while keeping additive
schema changes in place. Correct schema problems with a reviewed forward
migration. Never run the demo seeder or a destructive migration against
production as part of ordinary deployment.

Provision the initial administrator once, using credentials injected only for
the command:

```sh
pnpm --filter @apartment/api db:provision-admin
```

## Health, logs, and shutdown

- Configure the platform liveness probe to `GET /health`.
- Configure readiness to `GET /ready`; it checks PostgreSQL and returns 503 if
  the database is unavailable.
- The API emits structured Pino JSON logs to stdout/stderr, redacts credential,
  token, cookie, payment-signature, and guest-contact fields, and includes
  request IDs. Collect logs in the selected hosting platform and alert on
  sustained 5xx responses, Redis errors, payment reconciliation backlog, and
  failed database readiness.
- SIGTERM/SIGINT stops accepting HTTP requests, drains in-flight requests, and
  closes PostgreSQL and Redis pools. Keep the hosting termination grace period
  above the 10-second forced-shutdown ceiling.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops. A wrong
  value affects client IPs used by rate limiting and can weaken IP logging.

## Required production services and access

- **PostgreSQL:** managed PostgreSQL with TLS and certificate verification,
  automated backups, point-in-time recovery if available, and a least-privilege
  application user. Do not run `sequelize.sync()`.
- **Redis:** required for production shared rate limits and login abuse limits.
  Configure persistence/availability to match the selected provider's service
  guarantees and use TLS when available. Without Redis, separate API instances
  would each have independent in-memory limits.
- **S3-compatible storage:** optional. Keep the bucket private, enable encryption
  and versioning, and scope API write/read/delete permissions to the apartment
  image prefix and required bucket only. Public listing reads use short-lived
  signed URLs. Prefer workload identity over long-lived access keys.
- **Paystack:** staging uses matching test keys only. Production uses the
  matching live public/secret pair from a secret manager. Register the exact
  HTTPS `PAYSTACK_WEBHOOK_URL` in Paystack and set
  `PAYSTACK_CALLBACK_URL` to the web callback path. Never use live-money
  credentials in CI or Playwright tests.
- **Email and monitoring:** neither provider is currently integrated. Do not
  advertise booking email delivery or external error reporting as available.

## Backups and recovery

Before each release migration, verify a recent successful database backup and
record the restore point. Use the managed database's encrypted automated backup
and point-in-time recovery settings. At least quarterly, restore a backup into
a disposable isolated database, run migrations with
`TEST_DATABASE_URL`, and verify apartment, booking, payment, inventory-claim,
and audit data. Record owners and target RPO/RTO with the selected provider;
they are not configured by this repository.

For recovery, pause booking/payment traffic, restore into a new database or
provider-supported recovery point, verify schema and booking/payment state,
then deploy the application against the restored database. Reconcile recent
payment attempts against Paystack before resuming bookings. Keep the original
database snapshot and logs until recovery is verified. Do not attempt to
reverse additive production migrations with `db:migrate:undo`.

## Release and rollback checklist

1. Choose hosting providers and custom sibling domains; provision PostgreSQL,
   Redis, and optional S3 with least-privilege identities.
2. Add frontend and API variables from the table to each provider's secret/config
   store. Set production `NODE_ENV`, `DB_SSL=true`, `REDIS_URL`, HTTPS CORS,
   trusted proxy hops, Paystack live settings, and public/private API URLs.
3. Confirm DNS and HTTPS certificates, and that web/API origins are same-site.
4. Deploy the API artifact, run `db:migrate` as a one-off release task, then
   start API instances. Deploy the Next.js Node application with its build and
   start commands.
5. Provision the initial administrator securely. Upload/approve actual listing
   photographs before publishing listings.
6. Verify `/health`, `/ready`, CORS from the exact web origin, guest catalog and
   availability reads, administrator login/CSRF/logout, and payment
   initialization/verification on a staging deployment with Paystack test keys.
   Verify a signed webhook and duplicate delivery using test mode before a live
   Paystack switch.
7. Confirm database backups, log collection, Redis health, S3 access, and
   reconciliation operator access. Run `pnpm --filter @apartment/api
payments:reconcile` from a protected operator environment as required.
8. For rollback, redeploy the prior application release, keep additive schema
   changes, reconcile in-flight payments, and use the database recovery process
   only if data integrity requires restoration.

## End-to-end and integration testing

`pnpm test:e2e` starts a local fixture API and the web app. The fixture models
availability, booking creation/idempotency, protected checkout, payment
initialization, and verification. The Playwright Paystack page is intercepted
and mocked; no Paystack account, credentials, database, or real payment is used.
Install the browser with `pnpm --filter @apartment/web exec playwright install chromium`.

Database tests and test migrations must use a dedicated disposable PostgreSQL
database via `TEST_DATABASE_URL`. Never point it at development or production
data. Complete the real Paystack sandbox webhook/callback round-trip on staging
before production; that provider check is not replaced by the mocked E2E flow.

## Dependency maintenance

Run `pnpm audit` on dependency updates and review security advisories before
updating `pnpm-lock.yaml`. Update within supported major versions where
possible, then run lint, typecheck, unit tests, Playwright, and production
builds. Review direct and transitive dependency changes; do not add audit
ignores without a documented risk decision and expiry date.
