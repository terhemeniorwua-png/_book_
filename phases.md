# Implementation phases

Statuses: **Complete**, **Not started**, or **In progress**. A phase becomes complete only after every acceptance criterion has been implemented and verified.

## Phase 1 — Repository foundation and tooling — Complete

- [x] Document the frontend/API/database architecture and security boundaries.
- [x] Configure pnpm workspaces, TypeScript, lint/format, environment templates, migrations, and test/build commands.
- [x] Provide runnable minimal web and API application entry points without booking functionality.
- [x] Verify dependency installation, lint, type checking, tests, and production builds.

## Phase 2 — Backend foundation and security middleware — Complete

- [x] Configure Express and TypeScript application/server entry points, validated environment, versioned routing, request IDs, structured redacted logging, safe errors, 404 handling, and graceful shutdown.
- [x] Apply Helmet, explicit CORS allowlisting, bounded JSON/form parsing, trusted proxy configuration, and configurable global and feature-specific sensitive rate limiters.
- [x] Support an optional shared Redis rate-limit store; when `REDIS_URL` is configured, fail startup if Redis is unavailable.
- [x] Add reusable Joi validation middleware and retain frontend Zod; use the existing Sequelize/PostgreSQL dependencies without introducing booking or payment behavior.
- [x] Document API environment configuration and add focused middleware tests.
- [x] Acceptance: API typecheck, lint, tests, and build pass; startup fails clearly when required database configuration is missing.

## Phase 3 — PostgreSQL database and Sequelize models — Complete

- [x] Create normalized administrator, apartment, image, amenity, price charge, availability block, guest, booking, payment, status event, and contact inquiry models.
- [x] Add reversible Umzug migrations, constraints, indexes, independent booking/payment states, and documented associations.
- [x] Use a PostgreSQL range exclusion constraint for one physical unit; expire stale pending holds when new inventory claims are written.
- [x] Add Argon2id initial administrator provisioning without a public registration path or hardcoded credentials.
- [x] Isolate database test configuration so integration tests and test migrations require `TEST_DATABASE_URL` and never fall back to the deployment URL.
- [x] Run all migrations up/down/up and schema, expiry, adjacency, and concurrent inventory integration tests against a disposable dedicated PostgreSQL test database; run workspace checks.
- [x] Acceptance: database setup, schema, relationships, constraints, provisioning, and migration commands are documented and verified.

## Phase 4 — Public homepage and shared design — Complete

- [x] Create the responsive public homepage, shared navigation/footer, and original visual design informed by the reference property presentation.
- [x] Add hero, API-backed featured apartments, about, value proposition, amenities, location, FAQ, contact, and footer/policy placeholders without inventing property facts.
- [x] Add accessible mobile navigation, semantic content, responsive layouts, focus states, reduced-motion handling, and optimized illustrative images.
- [x] Show an explicit development-only no-inventory state when the apartment API is unavailable; never display mock listings.
- [x] Acceptance: frontend lint, typecheck, and production build pass; navigation provides the future apartment discovery entry point.

## Phase 5 — Apartment discovery — Complete

- [x] Add published-only, paginated apartment listing and detail endpoints with Joi-validated search, price, bedroom, guest, location, and amenity filters.
- [x] Return a safe public projection with public pricing, applicable charges, amenities, policy fields, and short-lived signed image URLs when private S3-compatible storage is configured.
- [x] Add responsive listing cards, server-backed filters, pagination, apartment galleries/details, missing-image/API/unknown-listing states, and booking links carrying the correct apartment ID.
- [x] Add API/PostgreSQL and frontend contract tests; verify lint, typechecks, and production builds.
- [x] Acceptance: guests can browse published listings, filter inventory, open apartment details, and continue using the selected apartment identifier.

## Phase 6 — Availability and reservation lifecycle — Complete

- [x] Add server-side date/guest capacity checks, pricing snapshots, atomic pending holds, and expiry for checkout.
- [x] Implement public availability range and trusted price quote endpoints with publication, guest/stay limits, policy display, blocked dates, reservations, and live holds.
- [x] Build a responsive date calendar that loads unavailable periods, validates date and guest selection, and displays server-priced totals before guest information.
- [x] Use database transactions and PostgreSQL exclusion constraints to prevent overlapping active reservations; preserve adjacent checkout/check-in dates.
- [x] Expire unpaid pending holds idempotently during availability, quote, and creation requests so stale inventory claims are released without a required scheduled worker.
- [x] Test invalid/past dates, stay rules, unpublished apartments, overlapping and concurrent requests, authoritative price rejection, expired holds, boundary dates, and rollback after conflict.
- [x] Acceptance: concurrent requests cannot double-book; reservation state and expiry behavior are covered by PostgreSQL integration tests.

## Phase 7 — Guest information and checkout — Complete

- [x] Add date and guest-information steps with frontend Zod and backend Joi validation, email normalization, and phone-number normalization.
- [x] Create one pending reservation per idempotency key, calculate checkout totals on the server, and protect checkout retrieval with an unguessable access token.
- [x] Show booking progress, apartment/stay summary, prices, fees, discounts, cancellation/payment terms, and hold expiry before payment.
- [x] Test valid/invalid forms, malformed and missing request fields, duplicate submissions, server totals, and unauthorized booking access; run lint, typechecks, tests, and builds.
- [x] Acceptance: guests can enter their details and reach a protected checkout with the correct server total without duplicate reservations.

## Phase 8 — Payments — In progress

- [x] Add validated environment configuration for paired Paystack test/live keys, NGN, HTTPS production callback/webhook URLs, and reconciliation age; document purpose and source without example credentials.
- [x] Initialize server-priced pending reservations using their protected booking access token, unique provider references, idempotency keys, the authoritative stored amount in kobo, and one-active-attempt constraints.
- [x] Add callback verification and a responsive checkout redirect; browser parameters never mark a booking paid.
- [x] Verify transaction reference, provider status, exact amount, currency, guest email, and test/live domain before atomically confirming a live inventory hold.
- [x] Supply the booking guest's email to Paystack at initialization, then send a separate Staywell booking confirmation only after successful server-side verification.
- [x] Use a branded HTML/plain-text confirmation with a secure cancellation link, unique email notification identity, provider idempotency header, attempt tracking, and one retry for transient failures.
- [x] Parse webhook payloads as bounded raw bytes, validate HMAC-SHA512, independently verify charge success, store dedupe hashes, and lock rows to handle duplicate/concurrent callback and webhook delivery.
- [x] Track payment transition audit records, refund events, late payments, and manual-review outcomes; expose a shell-only reconciliation command that queries Paystack before changes.
- [x] Add focused mocked Paystack, signature, configuration, raw webhook, rate-limit, and frontend response-schema tests.
- [ ] Run migrations and reservation/payment concurrency tests against the dedicated `TEST_DATABASE_URL`, and complete a Paystack sandbox webhook/callback round trip before declaring acceptance complete.
- [ ] Acceptance: secrets remain server-side; duplicate, invalid, delayed, refund, and successful payment events are verified against the provider and the isolated PostgreSQL integration suite passes.

## Phase 8A — Guest self-service cancellation and refunds — In progress

- [x] Add secure booking-specific cancellation tokens stored only as SHA-256 hashes, with a fixed purpose and expiry, delivered in the booking confirmation email URL fragment and sent by the web page in the `X-Cancellation-Token` header.
- [x] Add read-only cancellation request details and an explicit confirmation endpoint; opening the link never mutates a booking, and eligibility is rechecked inside the confirmation transaction.
- [x] Enforce cancellation at least 24 hours before the apartment-local scheduled check-in time using an immutable per-booking policy snapshot, with an IANA timezone and configurable check-in time per apartment.
- [x] Cancel confirmed, verified-paid bookings atomically, preserve booking and payment records, mark the booking `cancelled` with `refund_pending`, revoke other active cancellation links, and let the existing inventory trigger release the dates.
- [x] Add separate `booking_cancellations`, `booking_refunds`, and `email_notifications` records and refund states (`not_applicable`, `pending`, `processing`, `successful`, `failed`) distinct from booking and payment status.
- [x] Request a full Paystack refund for the original transaction, handle pending, processing, successful, failed, rejected, duplicate, and concurrent outcomes, and only mark payments refunded after provider confirmation.
- [x] Add provider webhook handling for refund outcomes, safe administrator refund listing and retry (superadmin only), audit events, and sanitized failure reasons without exposing tokens or secrets.
- [x] Build the responsive `/booking/cancel` flow with loading, invalid, expired, ineligible, already-cancelled, confirmation dialog, decline, success, API failure, and refund-state messaging.
- [x] Add optional email delivery and notification records for booking confirmation, cancellation received, cancellation completed, refund successful, and refund failed, while never logging cancellation tokens.
- [x] Include apartment-managed check-out times when configured; otherwise ask the guest to confirm with Staywell. Document Paystack's receipt preference separately from Staywell email.
- [x] Add email deduplication/provider message tracking and apartment check-out time in a forward migration and administrator property settings.
- [x] Add cancellation policy, token, refund-mapping, API, frontend parsing, and E2E coverage; extend administrator bookings/refunds views and cover the new schema in the gated integration suite.
- [ ] Run the full cancellation/refund integration suite against a dedicated `TEST_DATABASE_URL` and complete Paystack sandbox refund/webhook round trips before declaring acceptance complete.
- [ ] Product owner confirms the existing full-transaction refund behavior applies to eligible self-service cancellations, or specifies an approved cancellation-specific amount policy.
- [ ] Acceptance: verified-paid bookings can be cancelled only through explicit confirmation before the deadline, inventory is released, refunds remain independently tracked through provider outcomes, and administrators can review and safely retry failures.

## Phase 9 — Administrator dashboard — In progress

- [x] Add Argon2id administrator login with no registration endpoint, opaque hashed database sessions, an eight-hour expiry, secure HttpOnly/SameSite cookies, CSRF verification, logout revocation, and strict login limits.
- [x] Add admin session and audit migrations, session cleanup on login, audit history, and a one-time provision command already available from Phase 3.
- [x] Add protected and Joi-validated APIs for overview, apartment and amenity management, image uploads, availability blocks/calendar, searchable paginated bookings, payment visibility, audit events, booking transitions, and superadmin-only full refunds through Paystack.
- [x] Preserve inventory exclusion enforcement for blocked dates and booking state transitions; keep payment state separate from booking cancellation and never set payments to paid from the dashboard.
- [x] Add the responsive administrator login and dashboard UI for overview, apartments, photos, booking search/cancellation, availability blocks, payments/refunds, and audit history.
- [x] Add API auth/CORS/input tests and database migration/session/audit integration tests.
- [x] Verify the administrator route authorization boundary, absent public registration route, and login rate limiter with API tests; add controls for amenity assignment/creation and apartment image publication, cover selection, and removal.
- [ ] Run the migration and database integration suite against a dedicated PostgreSQL test instance; only unit/API/frontend checks are available without `TEST_DATABASE_URL` pointing to a reachable disposable database.
- [ ] Acceptance: verify full apartment, booking, availability, payment, authorization, and audit workflows against the dedicated test database and deployment cookie/CORS domains.

## Phase 10 — Hardening and release — Not started

- [ ] Configure production observability, backups, rate limits, security headers, deployment, and operational runbooks.
- [ ] Acceptance: production build, end-to-end critical path, recovery procedure, and deployment configuration are verified.

## Phase 1 outstanding manual configuration

- Provide PostgreSQL connection settings and Paystack sandbox credentials in local ignored environment files before enabling those integrations.
- Configure an S3-compatible bucket, region, and least-privilege access credentials before enabling image uploads.
