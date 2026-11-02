# Backend security skill

- Validate every request at the API boundary with Joi and reject unexpected or malformed input.
- Authenticate and authorize every protected operation on the server; scope customer records to the authenticated principal.
- Keep secrets in server environment configuration, use least privilege, redact credentials and personal data from logs, and return generic safe errors.
- Use Helmet, explicit CORS origins, bounded request bodies, parameterized Sequelize operations, and transactions for sensitive state changes.
- Never trust browser-supplied prices, payment statuses, roles, or availability. Verify provider callbacks and make webhook handling idempotent.
- Use explicit Sequelize/Umzug migrations and review indexes/constraints for concurrency and data integrity.
