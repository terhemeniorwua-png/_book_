# Booking logic skill

- Treat the API and PostgreSQL as authoritative for apartment availability, prices, reservation ownership, and state.
- Calculate stay dates and totals server-side using a documented timezone and currency policy.
- Represent reservation state transitions explicitly; define hold expiry and release behavior.
- Check and commit availability changes transactionally with database constraints or suitable locking so concurrent requests cannot double-book.
- Make retries safe with idempotency keys where clients or payment providers can repeat requests.
- Test boundary dates, overlapping stays, expiry, concurrent attempts, and failure rollback before marking booking phases complete.
