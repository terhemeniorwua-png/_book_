import { rateLimit } from 'express-rate-limit';
import type { Store } from 'express-rate-limit';
import type { AppEnvironment } from '../config/env.js';

export type RateLimitStoreFactory = (prefix: string) => Store;
let configuredStoreFactory: RateLimitStoreFactory | undefined;

export function setRateLimitStoreFactory(factory?: RateLimitStoreFactory) {
  configuredStoreFactory = factory;
}

export const generalLimiter = (
  configuration: AppEnvironment,
  storeFactory = configuredStoreFactory,
) =>
  rateLimit({
    windowMs: configuration.RATE_LIMIT_WINDOW_MS,
    limit: configuration.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(storeFactory ? { store: storeFactory('rate-limit:general:') } : {}),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  });

const createSensitiveLimiter = (
  configuration: AppEnvironment,
  prefix: string,
  storeFactory = configuredStoreFactory,
) =>
  rateLimit({
    windowMs: configuration.RATE_LIMIT_WINDOW_MS,
    limit: configuration.RATE_LIMIT_SENSITIVE_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(storeFactory ? { store: storeFactory(`rate-limit:${prefix}:`) } : {}),
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts; try again later',
      },
    },
  });

// Attach the relevant limiter at the route when each feature is introduced.
export const sensitiveLimiter = (configuration: AppEnvironment) =>
  createSensitiveLimiter(configuration, 'sensitive');
export const loginLimiter = (configuration: AppEnvironment) =>
  createSensitiveLimiter(configuration, 'login');
export const passwordRecoveryLimiter = (configuration: AppEnvironment) =>
  createSensitiveLimiter(configuration, 'password-recovery');
export const bookingCreationLimiter = (
  configuration: AppEnvironment,
  storeFactory = configuredStoreFactory,
) => createSensitiveLimiter(configuration, 'booking-creation', storeFactory);
export const paymentInitializationLimiter = (
  configuration: AppEnvironment,
  storeFactory = configuredStoreFactory,
) =>
  createSensitiveLimiter(configuration, 'payment-initialization', storeFactory);
export const paymentVerificationLimiter = (
  configuration: AppEnvironment,
  storeFactory = configuredStoreFactory,
) =>
  createSensitiveLimiter(configuration, 'payment-verification', storeFactory);
export const administrativeLimiter = (configuration: AppEnvironment) =>
  createSensitiveLimiter(configuration, 'administrative');
export const publicInquiryLimiter = (configuration: AppEnvironment) =>
  createSensitiveLimiter(configuration, 'public-inquiry');

export const apartmentCatalogLimiter = (
  configuration: AppEnvironment,
  storeFactory = configuredStoreFactory,
) =>
  rateLimit({
    windowMs: configuration.RATE_LIMIT_WINDOW_MS,
    limit: Math.min(
      configuration.RATE_LIMIT_MAX,
      configuration.RATE_LIMIT_APARTMENT_MAX,
    ),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(storeFactory
      ? { store: storeFactory('rate-limit:apartment-catalog:') }
      : {}),
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  });
