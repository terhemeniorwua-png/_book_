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

## Guest self-service cancellation

Confirmed, verified-paid bookings can be cancelled from the secure link in the booking confirmation email until 24 hours before the apartment-local scheduled check-in time. Opening `/booking/cancel#token=…` only displays the booking; the guest must explicitly confirm before anything changes. The token is purpose-specific, time-limited, stored only as a SHA-256 hash, sent in the URL fragment, and then read from the `X-Cancellation-Token` header by the API.

Cancellation and refund are tracked independently. A confirmed cancellation changes the booking to `cancelled`, releases its inventory claim, and creates a pending full refund against the original Paystack transaction. Provider success or failure only updates the separate refund and payment states; a failed refund never marks the booking as active or the payment as refunded. Administrators can review cancellation dates, payment references, refund status and failures, and a `superadmin` can safely retry a failed refund from the dashboard after checking Paystack.

**Product-owner confirmation before launch:** this implementation reuses the repository's documented full-transaction refund behavior for eligible customer cancellations. Confirm that this existing full-refund rule is approved for automatic self-service cancellations; if cancellation-specific deductions or exceptions are intended, they must be defined before enabling that policy.

### Booking confirmation and payment receipt emails

When the API verifies a successful Paystack payment and confirms the booking, it sends a separate Staywell-branded confirmation. Payment initialization supplies the booking guest's email to Paystack. Staywell's confirmation is sent only after server-side verification has checked the reference, amount, currency, guest, environment, booking hold, and inventory claim. Duplicate callback/webhook delivery cannot enqueue another confirmation: the payment transition is locked and the notification has a unique event/recipient key. Email delivery does not change payment or booking state.

The confirmation includes the guest and booking reference, apartment name and summary, a cover image only when it has a stable public Unsplash URL, check-in and check-out information, guest count, verified amount/status, cancellation deadline, and a secure **Unbook Apartment** link. Private signed storage URLs are not embedded because they expire. A check-out time appears when configured by the property administrator; otherwise the email says to confirm it with Staywell rather than guessing.

Paystack's own payment receipt is account-controlled and is separate from the Staywell email. In the Paystack Dashboard, open **Settings → Preferences** and enable transaction receipts for customers (or customers and the business). Set the customer-facing support email under **Settings → Contact**. Staywell does not compose or send a Paystack receipt. See Paystack's [receipt and contact preferences](https://support.paystack.com/en/articles/2131010).

Staywell delivery uses the existing API provider adapter, which defaults to Resend's email API. Configure API-side `EMAIL_PROVIDER_API_URL` (HTTPS endpoint), `EMAIL_PROVIDER_API_KEY`, and `EMAIL_FROM_ADDRESS`; `SUPPORT_EMAIL_ADDRESS` is optional. Set `CUSTOMER_APP_URL` to the canonical web origin so cancellation links use the correct host. Without provider credentials, notifications are recorded as queued. Transient errors receive one retry with the same provider idempotency key; `email_notifications` stores the deduplication key, attempts, provider status/error code, and provider message ID. Structured API logs distinguish dispatch attempt from provider acceptance. Acceptance is not proof of inbox delivery; check provider delivery/suppression logs for that. Put these values in the API hosting environment/secret manager, not the web deployment or source-controlled environment files.

### Terms & Conditions and Privacy Notice

The public policy page is [`/terms-and-privacy`](apps/web/src/app/terms-and-privacy/page.tsx), with `#terms-and-conditions` and `#privacy-notice` anchors. Footer links, the guest booking acceptance checkbox, and Staywell confirmation emails point to those sections. Policy wording is maintained in that page; the version identifiers are in `apps/web/src/lib/policy-versions.ts` and must be kept in sync with `TERMS_VERSION` and `PRIVACY_NOTICE_VERSION` in the API booking service. A booking is rejected unless the customer affirmatively accepts the current versions. The API stores Terms acceptance in `terms_accepted_at`/`terms_version` and Privacy Notice acknowledgement separately in `privacy_notice_acknowledged_at`/`privacy_notice_version`.

To publish a policy update, edit the relevant page section and last-updated date, increment that policy's version in both frontend and API, then deploy the web and API together. Older bookings retain their original version and acceptance timestamp. Operational API logs may contain technical request metadata including client IP addresses.

### Cookie consent and actual cookie inventory

The full-screen cookie preference experience is provided by `apps/web/src/components/site/cookie-consent-manager.tsx`. It appears on a first visit (except while a visitor is directly reading `/terms-and-privacy`, so the required notice remains accessible), traps focus, cannot be dismissed by backdrop or Escape, and offers equally visible accept/reject actions plus category customization. The footer's **Cookie Settings** control reopens it. Preferences are saved in local storage as `staywell.cookie-consent` for 180 days with version `cookie-preferences-v1`; this record contains only category choices and a timestamp. Increment the consent version in `apps/web/src/lib/cookie-consent.ts` when a material consent change should prompt visitors again. Cookie preferences are separate from booking policy acceptance.

Current cookie/storage inventory:

| Name                               | Provider / path               | Category and purpose                                                                            | Duration                       |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `admin_session`                    | Staywell API, `/api/v1/admin` | Necessary; authenticated administrator session; HttpOnly, SameSite Strict, Secure in production | 8 hours                        |
| `admin_csrf`                       | Staywell API, `/api/v1/admin` | Necessary; administrator request forgery protection; SameSite Strict, Secure in production      | 8 hours                        |
| `staywell.cookie-consent`          | Browser local storage         | Saves the visitor's category choices and consent version; not a cookie                          | 180 days                       |
| Checkout access/idempotency values | Browser session storage       | Supports an active guest checkout; not a cookie                                                 | Until the browser session ends |

No functional cookies, analytics provider/scripts, marketing pixels, or optional tracking requests are currently integrated. Functional, analytics, and marketing preferences default to off. There are no optional scripts to start or stop at present; any future integration must read `useCookiePreferences()` and only mount its provider/script after the relevant preference is true. Update the policy inventory and add provider-specific gating/tests before adding such a service. The preference event `staywell:cookie-consent-changed` is also emitted when choices change.

**Owner approval required before treating these documents as final:** obtain review by Staywell's owner and, where appropriate, qualified Nigerian legal/data-protection counsel; publish a verified customer support and privacy contact route; approve the cancellation refund amount policy; and establish a data-retention schedule. The website currently has no verified public contact details or contact form, and the full-transaction cancellation refund behavior remains explicitly unapproved in the existing project documentation. The policy page discloses these gaps rather than inventing answers.
