# PostgreSQL schema

## Demo apartment seeder

Run `pnpm --filter @apartment/api db:seed:apartments` after migrations to add 30 deterministic sample apartments: 18 across Lagos, Abuja, and Port Harcourt, two in Ibadan, and 10 modern examples across Lagos and Abuja. It also inserts amenity associations and four future availability blocks. The original 20 listings keep unpublished placeholder image rows; the 10 modern examples use three distinct gallery positions with stock interior photography hosted by Unsplash. Those images are illustrative and do not depict the listed properties. The Unsplash images are free to use under the [Unsplash License](https://unsplash.com/license). Apartment status is `published`, the database-supported public/bookable value; `available` is not an allowed status. Addresses, descriptions, amenities, policies, rates, and availability are sample data and must be confirmed with a property owner before real-world use. The seed command is for development and test only and remains disabled in production.

Run `pnpm --filter @apartment/api db:seed:apartments:undo` to remove records using the seeder's reserved UUIDs. The commands are idempotent, transactional, and disabled in production. Migrations must be run first. Use `DATABASE_URL` for development or `NODE_ENV=test` with `TEST_DATABASE_URL` for an isolated test database. The seeder creates no bookings, payments, administrators, hosts, or guests.

The API uses Sequelize 6 with PostgreSQL and Umzug migrations. Models describe the application layer; migrations are the only schema-changing mechanism. `sequelize.sync()` is not used. Production rollback commands are deliberately blocked; only additive `up` migrations run there.

## Migrations

| Migration                                                    | Contents                                                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261102000100-create-catalog-and-accounts`                 | Admin accounts, apartments, amenities and join table, images, charges, availability blocks, guests, and contact inquiries.                                |
| `20261102000200-create-bookings-payments-and-inventory`      | Bookings, payment transactions, booking status events, and inventory claims.                                                                              |
| `20261102000300-add-inventory-exclusion-and-booking-audit`   | PostgreSQL `btree_gist` exclusion constraint, hold expiry triggers, inventory synchronization, and status audit triggers.                                 |
| `20261102000400-add-apartment-policies`                      | Public house rules and check-in, check-out, and cancellation policy fields.                                                                               |
| `20261102000500-add-booking-access-and-checkout-data`        | Booking idempotency/access-token hashes, request fingerprints, special requests, and accepted-policy audit fields.                                        |
| `20261102000600-add-paystack-integrity`                      | Payment attempt idempotency and authorization URL, refund/review states, one-active-attempt index, webhook deduplication, and payment state audit events. |
| `20261102000700-create-admin-sessions-and-audit`             | Opaque administrator sessions and administrator audit events.                                                                                             |
| `20261102000800-add-cancellations-refunds-and-notifications` | Customer cancellation tokens, apartment-local check-in schedule, cancellation/refund records, email notifications, and cancellation booking state.        |
| `20261102000900-email-idempotency-and-checkout-time`         | Configurable apartment check-out time and unique email notification deduplication/provider message identifiers.                                           |

Migration downs reverse their own schema changes. The shared `btree_gist` extension is intentionally left installed on rollback because other database objects may use it.
Every added migration must also be statically imported and registered in `src/db/migrate.ts`; this keeps source TypeScript and compiled ESM execution consistent.

## Model relationships

- `Apartment` has many `ApartmentImage`, `ApartmentCharge`, `AvailabilityBlock`, `Booking`, and inventory claims.
- `Apartment` and `Amenity` are many-to-many through `ApartmentAmenity`.
- `Booking` belongs to one apartment and one `Guest`; a guest can have multiple bookings.
- `Booking` has many `PaymentTransaction` rows and status events. Reservation `status` and `payment_status` are separate state machines.
- `PaymentTransaction` has immutable `PaymentStateEvent` history. Signed provider deliveries are deduplicated in `PaymentWebhookEvent` by a SHA-256 digest of the exact raw body.
- An availability block belongs to an apartment and can record its creating administrator.
- `AdminAccount` stores only an Argon2id password hash, role, active flag, and login timestamp.
- `ContactInquiry` stores the minimum contact details needed to answer a public inquiry.

Status history is recorded by a PostgreSQL trigger on insert/status changes. Trusted server transactions may set transaction-local `app.admin_id` and `app.event_source` settings before changing a booking to attribute an administrator action; unset values record a system event.

Apartments represent one physical rentable unit. To represent several equivalent units, create one apartment inventory record per unit; do not use this schema to claim a multi-unit quantity.

## Inventory and state rules

Bookings in `pending`, `confirmed`, and `checked_in` state, and active availability blocks, create rows in `apartment_inventory_claims`. A PostgreSQL GiST exclusion constraint forbids overlapping half-open `daterange` claims for the same apartment. Ranges use `[check_in, check_out)`, so a guest may check in on the previous guest's checkout date. The same constraint covers manual blocks and bookings.

Before a new or changed booking/block is claimed, a trigger marks expired pending bookings for that apartment as `expired`. The public availability and quote reads, and booking creation, also perform the same idempotent expiry update in a transaction before reading claims. Another trigger removes inactive booking claims. No scheduled worker is needed to release inventory: the first availability, quote, or booking request after expiry updates the status and releases the claim before responding. If operational dashboards later require status to change during periods with no traffic, add a scheduled worker that runs the same expiry update.

Booking states: `pending`, `confirmed`, `checked_in`, `completed`, `cancelled`, `expired`, `rejected`. Payment states on a booking: `unpaid`, `pending`, `paid`, `failed`, `partially_refunded`, `refund_pending`, `refunded`, `manual_review`. Payment transaction states: `initiated`, `pending`, `succeeded`, `failed`, `cancelled`, `abandoned`, `refund_pending`, `refunded`, `needs_review`. Successful transactions are only marked paid/confirmed after independent Paystack verification matches the reference, amount, NGN currency, customer email, and test/live environment and the unexpired booking still owns its inventory claim. An expired or cancelled hold cannot be revived by a late payment; the API requests a refund once and keeps the attempt in `refund_pending` until a signed refund event completes it. Failed refund events move it to manual review.

Booking totals and JSONB `price_breakdown` are snapshots supplied by trusted server code. `PaymentTransaction.provider_metadata` is for non-secret, allowlisted provider fields only. Never put card data, CVVs, provider credentials, or full webhook bodies in these fields.

Published listing reads should use `Apartment.scope('public')` and filter published images. Address line and contact details are not part of the public scope by default.

Booking creation uses pending reservations and the inventory exclusion trigger to hold dates for 15 minutes. Guest contact fields remain related to each booking and are never returned from public apartment or checkout reads. The API stores hashes of random booking access/idempotency tokens; token-bearing headers are redacted from request logs. Checkout reads require the access token in an Authorization bearer header. Operators must define a guest-data retention schedule that meets applicable legal and accounting duties; this phase does not delete reservation records automatically.

Public catalog endpoints return only published apartment rows and images. They omit the private street address and object-storage keys. When `S3_BUCKET` is configured, published images are delivered as short-lived signed GET URLs; without storage configuration image URLs are null and the website displays an unavailable-image state. Policy fields are nullable and should remain explicitly unprovided until confirmed by the property owner.

## Environment and commands

- `DATABASE_URL`: development or production PostgreSQL connection.
- `TEST_DATABASE_URL`: required for explicit database integration tests and test migrations. It must point to a dedicated test database; test code never falls back to `DATABASE_URL`.
- `DB_SSL`: enable certificate-verified TLS for PostgreSQL.
- `DB_POOL_MAX`: Sequelize connection pool maximum.
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, and `RATE_LIMIT_SENSITIVE_MAX`: shared API and sensitive-route request budgets.
- `RATE_LIMIT_APARTMENT_MAX`: public apartment catalog budget, capped by the global API request budget.
- `BOOKING_TIME_ZONE`: timezone used to reject past check-in dates; defaults to `Africa/Lagos`.
- `PAYSTACK_SECRET_KEY`: backend-only Paystack `sk_test_...` key for development/test, or `sk_live_...` in production. Obtain from Paystack Dashboard → Developers → API Keys. Never expose this value.
- `PAYSTACK_PUBLIC_KEY`: matching `pk_test_...` or `pk_live_...` key from the same dashboard/mode. Redirect checkout does not expose/use it in browser code; production requires the pair to ensure environment consistency.
- `PAYSTACK_CURRENCY`: currently `NGN` only. Paystack amounts are sent as integer kobo; the server converts the stored naira decimal using integer arithmetic.
- `PAYSTACK_CALLBACK_URL`: frontend return route. Production requires HTTPS. Paystack appends `reference`; the API adds the non-secret booking reference. Browser return triggers server-side verification and is not itself proof of payment.
- `PAYSTACK_WEBHOOK_URL`: public webhook route `/api/v1/payments/paystack/webhook`; register the same HTTPS URL in the Paystack dashboard. Signature validation uses the exact request bytes and `PAYSTACK_SECRET_KEY` (Paystack does not require a separate webhook secret).
- `PAYMENT_RECONCILIATION_AGE_MINUTES`: age after which payment attempts are included by the operator reconciliation command; defaults to 30 minutes.
- `EMAIL_PROVIDER_API_URL`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`: API-side Staywell email provider endpoint and credentials; endpoint defaults to Resend. Keep all three in the API secret manager. `SUPPORT_EMAIL_ADDRESS` is an optional customer contact included in Staywell emails.
- `CUSTOMER_APP_URL`: public web origin used to build the secure cancellation link.
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`: one-time provisioning inputs; supply through a secret manager or a secure, temporary shell environment and remove them immediately afterward. They do not belong in `.env.example`.

Commands from the repository root:

```sh
pnpm --filter @apartment/api db:migrate
pnpm --filter @apartment/api db:migrate:undo
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/apartment_booking_test pnpm --filter @apartment/api db:migrate:test
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/apartment_booking_test pnpm --filter @apartment/api db:migrate:test:undo
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/apartment_booking_test pnpm --filter @apartment/api db:test
pnpm --filter @apartment/api db:provision-admin
pnpm --filter @apartment/api payments:reconcile
```

`db:migrate:undo` reverts one migration and is disabled when `NODE_ENV=production`. Test migration commands force `NODE_ENV=test` and require `TEST_DATABASE_URL`.

## Paystack workflow

- `POST /api/v1/payments/bookings/:bookingReference/initialize` requires the booking access token in `Authorization: Bearer ...` and a fresh `Idempotency-Key`. It uses the stored booking total, guest email, hold expiry, and matching `NGN` currency; only an HTTPS `checkout.paystack.com` URL is returned.
- `POST /api/v1/payments/verify` takes `{ "bookingReference": "...", "reference": "..." }` and the booking access token. The frontend callback is `/booking/payment/callback`; it reads the untrusted Paystack reference and calls this endpoint. It does not confirm from redirect parameters alone.
- `POST /api/v1/payments/paystack/webhook` is mounted with a 100 KB raw-body parser before normal JSON middleware. It verifies Paystack's HMAC-SHA512 signature, stores an event hash, independently verifies successful charges with Paystack, and uses row locks plus unique indexes to make duplicate and concurrent processing safe.
- A partial unique index permits at most one unresolved payment attempt per booking. A failed provider transaction can be retried with a new idempotency key; uncertain initialization remains blocked until reconciliation verifies its result.
- `pnpm --filter @apartment/api payments:reconcile` is an operator CLI, not a public endpoint. It queries Paystack for stale attempts before changing state and prints only payment references/statuses. It can request a full refund once when a verified payment arrives after the hold expired. Refund webhooks determine final `refunded` status; a failed refund becomes `manual_review`. Do not repeatedly invoke manual refund actions from the Paystack dashboard without checking the provider refund record.
- Test before launch with matching Paystack test keys (never production keys), a reachable HTTPS staging callback/webhook URL, and Paystack's test payment methods. Confirm the checkout redirect, callback verification, webhook delivery/retry, amount/currency mismatch rejection, duplicate delivery, expiration/late-payment refund path, and state rows in a dedicated test database. Keep live keys in the production secret manager only.
