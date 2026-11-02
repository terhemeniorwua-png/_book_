import { rateLimit } from 'express-rate-limit';
import type { AppEnvironment } from '../config/env.js';

export const generalLimiter = (configuration: AppEnvironment) => rateLimit({
  windowMs: configuration.RATE_LIMIT_WINDOW_MS,
  limit: configuration.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const sensitiveLimiter = (configuration: AppEnvironment) => rateLimit({
  windowMs: configuration.RATE_LIMIT_WINDOW_MS,
  limit: configuration.RATE_LIMIT_SENSITIVE_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts; try again later' } },
});
