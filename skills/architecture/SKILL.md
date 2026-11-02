# Architecture skill

- Keep `apps/web` and `apps/api` independently deployable and communicate through `/api/v1` HTTP endpoints.
- Keep persistence, secrets, payment operations, authorization, and authoritative booking rules in the API.
- Use Sequelize with explicit Umzug migrations for PostgreSQL schema changes; never rely on production `sync()`.
- Keep API handlers thin, validate requests with Joi, and use transactions for multi-record state changes.
- Keep frontend forms and presentation in Next.js; use Zod for browser form validation and validate again at the API boundary.
- Check `agent.md` for the full repository conventions before changing architecture.
