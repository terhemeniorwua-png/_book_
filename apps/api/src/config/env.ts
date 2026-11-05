import 'dotenv/config';
import Joi from 'joi';

const origin = Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .custom((value, helpers) => {
    try {
      const parsed = new URL(value);
      if (parsed.origin !== value.replace(/\/$/, ''))
        return helpers.error('string.uri');
      return parsed.origin;
    } catch {
      return helpers.error('string.uri');
    }
  });

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string()
      .uri({ scheme: ['postgres', 'postgresql'] })
      .optional(),
    otherwise: Joi.string()
      .uri({ scheme: ['postgres', 'postgresql'] })
      .required(),
  }),
  TEST_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .optional(),
  DB_SSL: Joi.any()
    .default(false)
    .custom((value, helpers) => {
      if (typeof value === 'boolean') return value;
      const normalized = String(value).trim().toLowerCase();
      if (['true', '1', 'yes', 'on', 'require'].includes(normalized))
        return true;
      if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
      return helpers.error('any.invalid');
    }),
  DB_SSL_CA: Joi.string().min(1).optional(),
  DB_POOL_MAX: Joi.number().integer().min(1).max(50).default(10),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .optional(),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(5).default(0),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(300),
  RATE_LIMIT_SENSITIVE_MAX: Joi.number().integer().min(1).default(10),
  RATE_LIMIT_APARTMENT_MAX: Joi.number().integer().min(1).default(120),
  BOOKING_TIME_ZONE: Joi.string().min(1).max(80).default('Africa/Lagos'),
  PAYSTACK_SECRET_KEY: Joi.string()
    .empty('')
    .pattern(/^sk_(test|live)_[A-Za-z0-9_-]+$/)
    .optional(),
  PAYSTACK_PUBLIC_KEY: Joi.string()
    .empty('')
    .pattern(/^pk_(test|live)_[A-Za-z0-9_-]+$/)
    .optional(),
  PAYSTACK_CURRENCY: Joi.string().valid('NGN').default('NGN'),
  PAYSTACK_CALLBACK_URL: Joi.string()
    .empty('')
    .uri({ scheme: ['http', 'https'] })
    .optional(),
  PAYSTACK_WEBHOOK_URL: Joi.string()
    .empty('')
    .uri({ scheme: ['http', 'https'] })
    .optional(),
  PAYMENT_RECONCILIATION_AGE_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(1440)
    .default(30),
  CUSTOMER_APP_URL: Joi.string()
    .empty('')
    .uri({ scheme: ['http', 'https'] })
    .optional(),
  EMAIL_PROVIDER_API_URL: Joi.string()
    .empty('')
    .uri({ scheme: ['https'] })
    .default('https://api.resend.com/emails'),
  EMAIL_PROVIDER_API_KEY: Joi.string().empty('').optional(),
  EMAIL_FROM_ADDRESS: Joi.string()
    .empty('')
    .email({ tlds: { allow: false } })
    .max(320)
    .optional(),
  S3_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional(),
  S3_REGION: Joi.string().min(1).max(80).optional(),
  S3_BUCKET: Joi.string().min(3).max(255).optional(),
  S3_ACCESS_KEY_ID: Joi.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().min(1).optional(),
}).unknown(true);

export type AppEnvironment = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  TEST_DATABASE_URL?: string;
  DB_SSL: boolean;
  DB_SSL_CA?: string;
  DB_POOL_MAX: number;
  REDIS_URL?: string;
  CORS_ORIGINS: string;
  LOG_LEVEL: string;
  TRUST_PROXY_HOPS: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_SENSITIVE_MAX: number;
  RATE_LIMIT_APARTMENT_MAX: number;
  BOOKING_TIME_ZONE: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PUBLIC_KEY?: string;
  PAYSTACK_CURRENCY: 'NGN';
  PAYSTACK_CALLBACK_URL?: string;
  PAYSTACK_WEBHOOK_URL?: string;
  PAYMENT_RECONCILIATION_AGE_MINUTES: number;
  CUSTOMER_APP_URL?: string;
  EMAIL_PROVIDER_API_URL: string;
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  CORS_ORIGIN_LIST: string[];
};

export function validateEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AppEnvironment {
  const { error, value } = schema.validate(input, {
    abortEarly: false,
    convert: true,
  });
  if (error)
    throw new Error(
      `Invalid environment configuration: ${error.details.map(({ path }) => path.join('.')).join(', ')}`,
    );
  if (Boolean(value.S3_ACCESS_KEY_ID) !== Boolean(value.S3_SECRET_ACCESS_KEY))
    throw new Error(
      'Invalid environment configuration: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
    );
  const hasPaystackKey = Boolean(
    value.PAYSTACK_SECRET_KEY || value.PAYSTACK_PUBLIC_KEY,
  );
  if (hasPaystackKey) {
    const mode = value.NODE_ENV === 'production' ? 'live' : 'test';
    if (
      (value.PAYSTACK_SECRET_KEY &&
        !String(value.PAYSTACK_SECRET_KEY).startsWith(`sk_${mode}_`)) ||
      (value.PAYSTACK_PUBLIC_KEY &&
        !String(value.PAYSTACK_PUBLIC_KEY).startsWith(`pk_${mode}_`))
    )
      throw new Error(
        `Invalid environment configuration: Paystack ${mode} keys required for ${value.NODE_ENV}`,
      );
  }
  if (
    value.NODE_ENV === 'production' &&
    (!(value.PAYSTACK_SECRET_KEY && value.PAYSTACK_PUBLIC_KEY) ||
      !value.PAYSTACK_CALLBACK_URL ||
      !value.PAYSTACK_WEBHOOK_URL)
  )
    throw new Error(
      'Invalid environment configuration: PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, PAYSTACK_CALLBACK_URL, PAYSTACK_WEBHOOK_URL',
    );
  if (value.NODE_ENV === 'production' && !value.DB_SSL)
    throw new Error(
      'Invalid environment configuration: DB_SSL must be enabled in production',
    );
  if (value.NODE_ENV === 'production' && !value.REDIS_URL)
    throw new Error(
      'Invalid environment configuration: REDIS_URL is required in production for shared rate limits',
    );
  if (
    value.NODE_ENV === 'production' &&
    [value.PAYSTACK_CALLBACK_URL, value.PAYSTACK_WEBHOOK_URL].some(
      (url) => url && !url.startsWith('https://'),
    )
  )
    throw new Error(
      'Invalid environment configuration: Paystack callback and webhook URLs must use HTTPS',
    );
  if (
    (value.PAYSTACK_CALLBACK_URL &&
      new URL(value.PAYSTACK_CALLBACK_URL).pathname !==
        '/booking/payment/callback') ||
    (value.PAYSTACK_WEBHOOK_URL &&
      new URL(value.PAYSTACK_WEBHOOK_URL).pathname !==
        '/api/v1/payments/paystack/webhook')
  )
    throw new Error(
      'Invalid environment configuration: PAYSTACK_CALLBACK_URL, PAYSTACK_WEBHOOK_URL',
    );
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value.BOOKING_TIME_ZONE });
  } catch {
    throw new Error('Invalid environment configuration: BOOKING_TIME_ZONE');
  }
  const origins = String(value.CORS_ORIGINS)
    .split(',')
    .map((item) => item.trim());
  if (!origins.length || origins.some((item) => !item))
    throw new Error('Invalid environment configuration: CORS_ORIGINS');
  const validatedOrigins = origins.map((item) => {
    const { error: originError, value: checked } = origin.validate(item);
    if (originError)
      throw new Error('Invalid environment configuration: CORS_ORIGINS');
    return checked as string;
  });
  if (
    value.NODE_ENV === 'production' &&
    validatedOrigins.some((item) => !item.startsWith('https://'))
  )
    throw new Error(
      'Invalid environment configuration: CORS_ORIGINS must use HTTPS in production',
    );
  return { ...value, CORS_ORIGIN_LIST: validatedOrigins } as AppEnvironment;
}

export const env = validateEnvironment(process.env);
