# PostgreSQL schema

## Demo apartment seeder

Run `pnpm --filter @apartment/api db:seed:apartments` after migrations to add 20 deterministic sample apartments: 18 across Lagos, Abuja, and Port Harcourt, plus two in Ibadan. It also inserts amenity associations, placeholder image object keys, and four future availability blocks. Apartment status is `published`, the database-supported public/bookable value; `available` is not an allowed status. Addresses, policies, descriptions, and image keys are explicitly illustrative. Placeholder image rows remain unpublished until real photographs are uploaded and approved.

Run `pnpm --filter @apartment/api db:seed:apartments:undo` to remove records using the seeder's reserved UUIDs. The commands are idempotent, transactional, and disabled in production. Migrations must be run first. Use `DATABASE_URL` for development or `NODE_ENV=test` with `TEST_DATABASE_URL` for an isolated test database. The seeder creates no bookings, payments, administrators, hosts, or guests.

The API uses Sequelize 6 with PostgreSQL and Umzug migrations. Models describe the application layer; migrations are the only schema-changing mechanism. `sequelize.sync()` is not used. Production rollback commands are deliberately blocked; only additive `up` migrations run there.

## Migrations

| Migration                                                  | Contents                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `20261102000100-create-catalog-and-accounts`               | Admin accounts, apartments, amenities and join table, images, charges, availability blocks, guests, and contact inquiries. |
| `20261102000200-create-bookings-payments-and-inventory`    | Bookings, payment transactions, booking status events, and inventory claims.                                               |
| `20261102000300-add-inventory-exclusion-and-booking-audit` | PostgreSQL `btree_gist` exclusion constraint, hold expiry triggers, inventory synchronization, and status audit triggers.  |
| `20261102000400-add-apartment-policies`                    | Public house rules and check-in, check-out, and cancellation policy fields.                                                |
| `20261102000500-add-booking-access-and-checkout-data`      | Booking idempotency/access-token hashes, request fingerprints, special requests, and accepted-policy audit fields.         |

Migration downs reverse their own schema changes. The shared `btree_gist` extension is intentionally left installed on rollback because other database objects may use it.
Every added migration must also be statically imported and registered in `src/db/migrate.ts`; this keeps source TypeScript and compiled ESM execution consistent.

## Model relationships

- `Apartment` has many `ApartmentImage`, `ApartmentCharge`, `AvailabilityBlock`, `Booking`, and inventory claims.
- `Apartment` and `Amenity` are many-to-many through `ApartmentAmenity`.
- `Booking` belongs to one apartment and one `Guest`; a guest can have multiple bookings.
- `Booking` has many `PaymentTransaction` rows and status events. Reservation `status` and `payment_status` are separate state machines.
- An availability block belongs to an apartment and can record its creating administrator.
- `AdminAccount` stores only an Argon2id password hash, role, active flag, and login timestamp.
- `ContactInquiry` stores the minimum contact details needed to answer a public inquiry.

Status history is recorded by a PostgreSQL trigger on insert/status changes. Trusted server transactions may set transaction-local `app.admin_id` and `app.event_source` settings before changing a booking to attribute an administrator action; unset values record a system event.

Apartments represent one physical rentable unit. To represent several equivalent units, create one apartment inventory record per unit; do not use this schema to claim a multi-unit quantity.

## Inventory and state rules

Bookings in `pending`, `confirmed`, and `checked_in` state, and active availability blocks, create rows in `apartment_inventory_claims`. A PostgreSQL GiST exclusion constraint forbids overlapping half-open `daterange` claims for the same apartment. Ranges use `[check_in, check_out)`, so a guest may check in on the previous guest's checkout date. The same constraint covers manual blocks and bookings.

Before a new or changed booking/block is claimed, a trigger marks expired pending bookings for that apartment as `expired`. The public availability and quote reads, and booking creation, also perform the same idempotent expiry update in a transaction before reading claims. Another trigger removes inactive booking claims. No scheduled worker is needed to release inventory: the first availability, quote, or booking request after expiry updates the status and releases the claim before responding. If operational dashboards later require status to change during periods with no traffic, add a scheduled worker that runs the same expiry update.

Booking states: `pending`, `confirmed`, `checked_in`, `completed`, `cancelled`, `expired`, `rejected`. Payment states on a booking: `unpaid`, `pending`, `paid`, `failed`, `partially_refunded`, `refunded`. Payment transaction states: `initiated`, `pending`, `succeeded`, `failed`, `cancelled`, `refunded`. The schema does not implement transitions or provider verification.

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
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`: one-time provisioning inputs; supply through a secret manager or a secure, temporary shell environment and remove them immediately afterward. They do not belong in `.env.example`.

Commands from the repository root:

```sh
pnpm --filter @apartment/api db:migrate
pnpm --filter @apartment/api db:migrate:undo
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/apartment_booking_test pnpm --filter @apartment/api db:migrate:test
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/apartment_booking_test pnpm --filter @apartment/api db:migrate:test:undo
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/apartment_booking_test pnpm --filter @apartment/api db:test
pnpm --filter @apartment/api db:provision-admin
```

`db:migrate:undo` reverts one migration and is disabled when `NODE_ENV=production`. Test migration commands force `NODE_ENV=test` and require `TEST_DATABASE_URL`.
