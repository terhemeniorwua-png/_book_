import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { env, type AppEnvironment } from './config/env.js';
import { logger } from './logger.js';
import { apiRouter } from './routes/v1/index.js';
import {
  generalLimiter,
  apartmentCatalogLimiter,
  bookingCreationLimiter,
  paymentInitializationLimiter,
  setRateLimitStoreFactory,
  type RateLimitStoreFactory,
} from './middleware/rate-limits.js';

const safeBookingErrorMessages: Record<string, string> = {
  APARTMENT_NOT_FOUND: 'This apartment is not available for booking.',
  INVALID_PHONE:
    'Enter a valid phone number, including a country code when needed.',
  INVALID_STAY_DATES: 'Choose valid future check-in and check-out dates.',
  STAY_RULES_NOT_MET:
    'Guest count or stay length is outside this apartment’s booking rules.',
  DATES_UNAVAILABLE: 'The selected dates are no longer available.',
  PRICING_UNAVAILABLE:
    'Pricing is temporarily unavailable. Please contact the property.',
  IDEMPOTENCY_CONFLICT:
    'This booking attempt is already associated with different details. Start a new booking.',
  INVALID_BOOKING_TOKEN: 'A valid booking attempt token is required.',
  BOOKING_ACCESS_REQUIRED: 'A valid booking access token is required.',
  BOOKING_NOT_FOUND: 'Booking could not be found.',
  BOOKING_HOLD_EXPIRED: 'This reservation hold has expired. Start again to check availability.',
  BOOKING_NOT_PAYABLE: 'This reservation is not eligible for payment.',
  PAYMENT_NOT_FOUND: 'Payment could not be found.',
  PAYMENT_MISMATCH: 'Payment could not be verified for this reservation. Contact support.',
  INVALID_IDEMPOTENCY_KEY: 'A valid payment attempt key is required.',
  IDEMPOTENCY_CONFLICT: 'This payment attempt key has already been used.',
  PAYMENT_ATTEMPT_CONFLICT: 'A payment attempt is already being prepared. Retry shortly.',
  PAYMENT_INITIALIZATION_PENDING: 'This payment attempt is still being prepared. Retry shortly.',
  UNSUPPORTED_CURRENCY: 'This booking currency is not supported for online payment.',
  INVALID_BOOKING_AMOUNT: 'This booking cannot be paid at this time.',
  PAYMENTS_NOT_CONFIGURED: 'Payments are not available right now.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'Payment service is temporarily unavailable. Try again shortly.',
  PAYMENT_PROVIDER_REJECTED: 'Payment service could not process this request.',
  INVALID_PROVIDER_RESPONSE: 'Payment service returned an invalid checkout response.',
  INVALID_WEBHOOK_SIGNATURE: 'Webhook signature is invalid.',
  INVALID_WEBHOOK: 'Webhook payload is invalid.',
  PAYMENT_NOT_VERIFIED: 'Webhook transaction could not be independently verified.',
};

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  void next;
  const candidate = error as {
    status?: number;
    statusCode?: number;
    type?: string;
    code?: string;
  };
  const status =
    candidate.status ??
    candidate.statusCode ??
    (candidate.type === 'entity.too.large'
      ? 413
      : candidate.type === 'entity.parse.failed'
        ? 400
        : 500);
  const safeStatus = status >= 400 && status < 500 ? status : 500;
  const safeBookingMessage = candidate.code
    ? safeBookingErrorMessages[candidate.code]
    : undefined;
  const code =
    safeStatus === 413
      ? 'PAYLOAD_TOO_LARGE'
      : candidate.code === 'CORS_ORIGIN_DENIED'
        ? 'CORS_ORIGIN_DENIED'
        : candidate.code === 'VALIDATION_ERROR'
          ? 'VALIDATION_ERROR'
          : safeBookingMessage
            ? candidate.code!
            : safeStatus === 400
              ? 'INVALID_REQUEST'
              : safeStatus === 500
                ? 'INTERNAL_ERROR'
                : 'REQUEST_REJECTED';
  request.log?.[safeStatus >= 500 ? 'error' : 'warn'](
    {
      requestId: response.locals.requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    },
    'Request failed',
  );
  response.status(safeStatus).json({
    error: {
      code,
      message:
        safeBookingMessage ??
        (safeStatus === 500
          ? 'An unexpected error occurred'
          : code === 'PAYLOAD_TOO_LARGE'
            ? 'Request body is too large'
            : code === 'INVALID_REQUEST'
              ? 'Request body is malformed'
              : code === 'VALIDATION_ERROR'
                ? 'Request validation failed'
                : code === 'CORS_ORIGIN_DENIED'
                  ? 'Origin is not allowed'
                  : 'Request could not be processed'),
      requestId: response.locals.requestId,
    },
  });
};

export function createApp(
  configuration: AppEnvironment = env,
  rateLimitStoreFactory?: RateLimitStoreFactory,
) {
  setRateLimitStoreFactory(rateLimitStoreFactory);
  const application = express();
  application.disable('x-powered-by');
  application.set('trust proxy', configuration.TRUST_PROXY_HOPS);
  application.use((request, response, next) => {
    const supplied = request.header('x-request-id');
    const requestId =
      supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied)
        ? supplied
        : randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.locals.requestId = requestId;
    next();
  });
  application.use(
    pinoHttp({
      logger,
      genReqId: (_request, response) =>
        String(response.getHeader('X-Request-Id')),
    }),
  );
  application.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          'upgrade-insecure-requests':
            configuration.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts:
        configuration.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  application.use(
    cors({
      origin(origin, callback) {
        if (!origin || configuration.CORS_ORIGIN_LIST.includes(origin))
          return callback(null, true);
        return callback(
          Object.assign(new Error('Origin is not allowed'), {
            status: 403,
            code: 'CORS_ORIGIN_DENIED',
          }),
        );
      },
      credentials: false,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Request-Id',
      ],
      maxAge: 600,
    }),
  );
  application.use(
    '/api/v1/payments/paystack/webhook',
    express.raw({ type: 'application/json', limit: '100kb' }),
  );
  application.use(
    express.json({ limit: '1mb', strict: true, type: 'application/json' }),
  );
  application.use(
    express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 100 }),
  );
  application.use(generalLimiter(configuration, rateLimitStoreFactory));
  application.use(
    '/api/v1/apartments',
    apartmentCatalogLimiter(configuration, rateLimitStoreFactory),
  );
  application.use(
    '/api/v1/bookings',
    bookingCreationLimiter(configuration, rateLimitStoreFactory),
  );
  application.use(
    '/api/v1/payments/bookings',
    paymentInitializationLimiter(configuration),
  );
  application.get('/health', (_request, response) =>
    response.json({ status: 'ok' }),
  );
  application.use('/api/v1', apiRouter);
  application.use((_request, response) =>
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }),
  );
  application.use(errorHandler);
  return application;
}

export const app = createApp();
