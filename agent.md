# Repository guide

## Architecture

- `apps/web` is the Next.js App Router frontend (TypeScript, Tailwind CSS v4).
- `apps/api` is a separate Express and TypeScript service. Its versioned REST routes live under `/api/v1`.
- PostgreSQL is the system of record. Sequelize models and Umzug migrations belong to the API; do not use `sequelize.sync()` in deployed environments.
- The browser talks to the API over HTTP. Keep payment credentials, database access, storage credentials, and authorization decisions on the server.
- Validate browser form data with Zod and API request data with Joi. Revalidate all input at the API boundary.
- Paystack integration will be server initiated and verified by server-to-server calls and signed webhooks. Never expose its secret key to browser code.
- Apartment images will use private or access-controlled S3-compatible object storage; serve them through authorization-aware signed URLs where appropriate.

## Development

- Use pnpm workspaces and retain `pnpm-lock.yaml` as the dependency source of truth.
- Use the Node version in `.nvmrc` (20.20.0) or a compatible Node 20.9+ runtime.
- Keep frontend and backend dependencies in their respective workspace package files. Shared tooling belongs at the root.
- Use TypeScript strict mode, ESLint, Prettier, automated tests, and migrations for schema changes.
- Add focused tests with behavior changes. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before marking a phase complete.
- Never commit generated build output, local credentials, `.env` files, or uploaded user data.

## Security and data rules

- Copy each `.env.example` to the matching app's ignored `.env.local` for local use. Never replace an existing environment file.
- Validate configuration at service startup and fail clearly on missing required production settings.
- Use least-privilege database and object-storage credentials, parameterized ORM queries, secure cookies, request limits, and explicit CORS origins.
- Store only password hashes and payment references; do not log secrets, card data, or unnecessary personal data.
- Authorize every reservation, customer, and administrative operation on the API. Do not trust IDs or prices supplied by the browser.
- Reservation availability and payment state changes must be made transactionally and checked against authoritative server data.

## Repository conventions

- Keep business logic in API services and persistence in API models/repositories; route handlers should stay thin.
- Keep presentation and client-side form interaction in the web app. Never put secrets or privileged business rules in client components.
- Update `phases.md` when scope or acceptance status changes. A phase is complete only after every listed criterion is verified.
- Use small, reversible changes and preserve existing project behavior when extending the repository.
