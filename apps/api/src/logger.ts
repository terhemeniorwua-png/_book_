import pino from 'pino';
import { env } from './config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.idempotency-key',
      'req.headers.x-paystack-signature',
      'req.headers.cookie',
      'req.headers.set-cookie',
      'req.headers.x-cancellation-token',
      'req.body.password',
      'req.body.fullName',
      'req.body.email',
      'req.body.phone',
      'req.body.specialRequests',
      'req.body.token',
      'req.body.cancellationToken',
      'req.body.secret',
      'req.body.card',
      'req.query.token',
      'DATABASE_URL',
      'EMAIL_PROVIDER_API_KEY',
      'PAYSTACK_SECRET_KEY',
      'PAYSTACK_PUBLIC_KEY',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'REDIS_URL',
    ],
    censor: '[REDACTED]',
  },
});
