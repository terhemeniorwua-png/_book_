import 'dotenv/config';
import Joi from 'joi';

const origin = Joi.string().uri({ scheme: ['http', 'https'] }).custom((value, helpers) => {
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value.replace(/\/$/, '')) return helpers.error('string.uri');
    return parsed.origin;
  } catch {
    return helpers.error('string.uri');
  }
});

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(300),
  RATE_LIMIT_SENSITIVE_MAX: Joi.number().integer().min(1).default(10),
}).unknown(true);

export type AppEnvironment = {
  NODE_ENV: 'development' | 'test' | 'production'; PORT: number; DATABASE_URL: string;
  CORS_ORIGINS: string; LOG_LEVEL: string; TRUST_PROXY_HOPS: number;
  RATE_LIMIT_WINDOW_MS: number; RATE_LIMIT_MAX: number; RATE_LIMIT_SENSITIVE_MAX: number;
  CORS_ORIGIN_LIST: string[];
};

export function validateEnvironment(input: NodeJS.ProcessEnv | Record<string, string | undefined>): AppEnvironment {
  const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
  if (error) throw new Error(`Invalid environment configuration: ${error.details.map(({ path }) => path.join('.')).join(', ')}`);
  const origins = String(value.CORS_ORIGINS).split(',').map((item) => item.trim());
  if (!origins.length || origins.some((item) => !item)) throw new Error('Invalid environment configuration: CORS_ORIGINS');
  const validatedOrigins = origins.map((item) => {
    const { error: originError, value: checked } = origin.validate(item);
    if (originError) throw new Error('Invalid environment configuration: CORS_ORIGINS');
    return checked as string;
  });
  return { ...value, CORS_ORIGIN_LIST: validatedOrigins } as AppEnvironment;
}

export const env = validateEnvironment(process.env);
