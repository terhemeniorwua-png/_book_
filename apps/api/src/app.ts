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
  setRateLimitStoreFactory,
  type RateLimitStoreFactory,
} from './middleware/rate-limits.js';

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
  const code =
    safeStatus === 413
      ? 'PAYLOAD_TOO_LARGE'
      : candidate.code === 'CORS_ORIGIN_DENIED'
        ? 'CORS_ORIGIN_DENIED'
        : candidate.code === 'VALIDATION_ERROR'
          ? 'VALIDATION_ERROR'
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
        safeStatus === 500
          ? 'An unexpected error occurred'
          : code === 'PAYLOAD_TOO_LARGE'
            ? 'Request body is too large'
            : code === 'INVALID_REQUEST'
              ? 'Request body is malformed'
              : code === 'VALIDATION_ERROR'
                ? 'Request validation failed'
                : code === 'CORS_ORIGIN_DENIED'
                  ? 'Origin is not allowed'
                  : 'Request could not be processed',
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
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  application.use(
    express.json({ limit: '1mb', strict: true, type: 'application/json' }),
  );
  application.use(
    express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 100 }),
  );
  application.use(generalLimiter(configuration, rateLimitStoreFactory));
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
