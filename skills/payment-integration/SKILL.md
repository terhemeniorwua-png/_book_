# Payment integration skill

- Initialize Paystack transactions from the API using server-computed reservation amounts and a secret key read only by the API.
- Return only the provider authorization URL/reference needed by the browser; never return or bundle secret credentials.
- Verify transaction status server-to-server and verify webhook signatures against the raw request body before acting on an event.
- Make payment processing idempotent and reconcile provider events with reservation state inside database transactions.
- Do not store card data. Persist only necessary provider references and payment audit fields.
- Test invalid signatures, duplicate/out-of-order events, delayed confirmation, amount mismatch, and successful verification.
