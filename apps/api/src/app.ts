import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { env, type AppEnvironment } from './config/env.js';
import { logger } from './logger.js';
import { sequelize } from './db/client.js';
import { apiRouter } from './routes/v1/index.js';
import {
  generalLimiter,
  apartmentCatalogLimiter,
  bookingCreationLimiter,
  bookingCancellationLimiter,
  paymentInitializationLimiter,
  paymentVerificationLimiter,
  loginLimiter,
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
  BOOKING_HOLD_EXPIRED:
    'This reservation hold has expired. Start again to check availability.',
  BOOKING_NOT_PAYABLE: 'This reservation is not eligible for payment.',
  PAYMENT_NOT_FOUND: 'Payment could not be found.',
  PAYMENT_MISMATCH:
    'Payment could not be verified for this reservation. Contact support.',
  INVALID_IDEMPOTENCY_KEY: 'A valid payment attempt key is required.',
  PAYMENT_IDEMPOTENCY_CONFLICT:
    'This payment attempt key has already been used.',
  PAYMENT_ATTEMPT_CONFLICT:
    'A payment attempt is already being prepared. Retry shortly.',
  PAYMENT_INITIALIZATION_PENDING:
    'This payment attempt is still being prepared. Retry shortly.',
  UNSUPPORTED_CURRENCY:
    'This booking currency is not supported for online payment.',
  INVALID_BOOKING_AMOUNT: 'This booking cannot be paid at this time.',
  PAYMENTS_NOT_CONFIGURED: 'Payments are not available right now.',
  PAYMENT_PROVIDER_UNAVAILABLE:
    'Payment service is temporarily unavailable. Try again shortly.',
  PAYMENT_PROVIDER_REJECTED: 'Payment service could not process this request.',
  INVALID_PROVIDER_RESPONSE:
    'Payment service returned an invalid checkout response.',
  INVALID_WEBHOOK_SIGNATURE: 'Webhook signature is invalid.',
  INVALID_WEBHOOK: 'Webhook payload is invalid.',
  PAYMENT_NOT_VERIFIED:
    'Webhook transaction could not be independently verified.',
  ADMIN_LOGIN_FAILED: 'Email or password is incorrect.',
  ADMIN_AUTH_REQUIRED: 'Administrator authentication is required.',
  ADMIN_CSRF_INVALID:
    'Request security token is invalid. Refresh the dashboard and try again.',
  ADMIN_CSRF_UNAVAILABLE:
    'Administrator security token is missing. Sign in again.',
  ADMIN_FORBIDDEN:
    'This administrator is not authorized to perform this action.',
  ADMIN_RESOURCE_NOT_FOUND:
    'The requested administrator resource was not found.',
  APARTMENT_SLUG_EXISTS: 'An apartment with this slug already exists.',
  BOOKING_TRANSITION_INVALID:
    'This booking cannot be moved to the requested state.',
  BOOKING_NOT_PAID:
    'Only a confirmed, verified-paid booking can be checked in.',
  BOOKING_PAYMENT_REVIEW_REQUIRED:
    'This booking has payment activity and requires cancellation/refund review.',
  REFUND_REQUIRES_CANCELLED_BOOKING:
    'Cancel the reservation before requesting a refund.',
  VERIFIED_PAYMENT_REQUIRED:
    'A verified, refundable Paystack payment was not found.',
  REFUND_PROVIDER_PENDING:
    'The refund request could not be confirmed. Its status remains pending; check Paystack before retrying.',
  INVALID_IMAGE: 'Upload a valid JPEG, PNG, or WebP image up to 8 MB.',
  IMAGE_STORAGE_UNAVAILABLE:
    'Image storage is not configured or is temporarily unavailable.',
  UNKNOWN_AMENITY: 'One or more selected amenities do not exist.',
  AMENITY_SLUG_EXISTS: 'An amenity with this slug already exists.',
  INVALID_CANCELLATION_TOKEN:
    'This cancellation link is not valid. Use the link from your booking confirmation email.',
  CANCELLATION_LINK_INVALID:
    'This cancellation link is not valid. Use the link from your booking confirmation email.',
  CANCELLATION_LINK_EXPIRED:
    'This cancellation link has expired. Contact Staywell support for help.',
  CANCELLATION_ALREADY_PROCESSED:
    'This cancellation request has already been submitted. Check your email for updates.',
  CANCELLATION_IN_PROGRESS:
    'A cancellation request for this booking is already being processed.',
  BOOKING_NOT_CANCELLABLE:
    'This booking is not eligible for online cancellation. Please contact Staywell support.',
  CHECK_IN_STARTED:
    'The scheduled check-in time has passed, so this booking can no longer be cancelled online.',
  CANCELLATION_DEADLINE_PASSED:
    'This booking is no longer eligible for online cancellation because the 24-hour cancellation deadline has passed. Please contact Staywell for assistance.',
  REFUND_NOT_FOUND: 'The refund could not be found.',
  REFUND_NOT_RETRYABLE: 'Only a failed refund can be retried.',
  REFUND_STATUS_UNVERIFIED:
    'Paystack could not confirm whether the previous refund is still active. Check Paystack before retrying.',
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
      errorMessage: error instanceof Error ? error.message : String(error),
      originalMessage: (error as { original?: { message?: string } })?.original
        ?.message,
      originalCode: (error as { original?: { code?: string } })?.original?.code,
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
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Request-Id',
        'X-CSRF-Token',
        'X-Cancellation-Token',
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
    '/api/v1/cancellations',
    bookingCancellationLimiter(configuration, rateLimitStoreFactory),
  );
  application.use(
    '/api/v1/payments/bookings',
    paymentInitializationLimiter(configuration, rateLimitStoreFactory),
  );
  application.use(
    '/api/v1/payments/verify',
    paymentVerificationLimiter(configuration, rateLimitStoreFactory),
  );
  application.use(
    '/api/v1/admin/auth/login',
    loginLimiter(configuration, rateLimitStoreFactory),
  );
  application.use(
    '/api/v1/auth/google',
    loginLimiter(configuration, rateLimitStoreFactory),
  );
  application.get('/health', (_request, response) =>
    response.json({ status: 'ok' }),
  );
  application.get('/ready', async (_request, response) => {
    try {
      await sequelize.authenticate();
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  });
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
