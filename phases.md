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

## Phase 4 — Product and experience design — Not started

- [ ] Define apartment catalog, amenities, pricing display, occupancy, date selection, and mobile-first reservation flows based on the reference experience.
- [ ] Document accessibility, responsive behavior, image handling, and design tokens.
- [ ] Acceptance: approved page map and interaction requirements cover browse, apartment details, reservation, and confirmation.

## Phase 5 — API contracts and authorization — Not started

- [ ] Implement feature API contracts, authentication, and authorization over the Phase 3 data models.
- [ ] Acceptance: API integration tests cover validation and access control.

## Phase 6 — Apartment discovery — Not started

- [ ] Implement responsive apartment listing, detail pages, controlled image delivery, amenities, and server-backed search/filtering.
- [ ] Acceptance: catalog and detail views use API data, handle loading/empty/error states, and pass accessibility and browser checks.

## Phase 7 — Availability and reservation lifecycle — Not started

- [ ] Implement date/guest selection, authoritative availability checks, pricing calculation, reservation holds, expiration, and booking confirmation.
- [ ] Use database transactions and constraints to prevent overlapping active reservations.
- [ ] Acceptance: concurrent requests cannot double-book; reservation state transitions and expiry are covered by integration tests.

## Phase 8 — Payments — Not started

- [ ] Integrate Paystack initialization, server-side verification, signed webhook handling, idempotency, and payment reconciliation.
- [ ] Acceptance: secrets remain server-side; duplicate, invalid, delayed, and successful payment events are handled and tested.

## Phase 9 — Customer and administration — Not started

- [ ] Implement customer reservation history and secured administrative apartment, availability, pricing, and reservation management.
- [ ] Acceptance: API authorization is tested for each role and customer data is isolated.

## Phase 10 — Hardening and release — Not started

- [ ] Configure production observability, backups, rate limits, security headers, deployment, and operational runbooks.
- [ ] Acceptance: production build, end-to-end critical path, recovery procedure, and deployment configuration are verified.

## Phase 1 outstanding manual configuration

- Provide PostgreSQL connection settings and Paystack sandbox credentials in local ignored environment files before enabling those integrations.
- Configure an S3-compatible bucket, region, and least-privilege access credentials before enabling image uploads.
