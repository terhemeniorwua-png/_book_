import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import Joi from 'joi';
import { app, createApp, errorHandler } from './app.js';
import { validateRequest } from './middleware/validate-request.js';
import { env, validateEnvironment } from './config/env.js';

describe('API foundation', () => {
  it('exposes a health check', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('exposes the versioned API root', async () => {
    const response = await request(app).get('/api/v1');

    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
  });

  it('sets security headers and a correlation ID', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', 'test-request-1');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-request-id']).toBe('test-request-1');
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('allows configured CORS origins and rejects other browser origins', async () => {
    const allowed = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    const rejected = await request(app)
      .get('/health')
      .set('Origin', 'https://attacker.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the booking idempotency header during preflight', async () => {
    const preflight = await request(app)
      .options('/api/v1/bookings')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'authorization, content-type, idempotency-key',
      );
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain(
      'Idempotency-Key',
    );
  });

  it('limits API requests', async () => {
    const limitedApp = createApp({
      ...validateEnvironment({
        DATABASE_URL: 'postgres://user:pass@localhost/db',
        RATE_LIMIT_MAX: '1',
      }),
      NODE_ENV: 'test',
    });
    expect((await request(limitedApp).get('/health')).status).toBe(200);
    const blocked = await request(limitedApp).get('/health');
    expect(blocked.status).toBe(429);
  });

  it('rejects malformed and oversized JSON bodies safely', async () => {
    const malformed = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send('{');
    const oversized = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send({ data: 'x'.repeat(1_100_000) });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.message).not.toContain('SyntaxError');
    expect(oversized.status).toBe(413);
  });

  it('returns a safe response for unknown routes and unexpected errors', async () => {
    const missing = await request(app).get('/unknown');
    expect(missing.status).toBe(404);
    const failing = express();
    failing.get('/fail', (_request, _response, next) =>
      next(new Error('private database details')),
    );
    failing.use(errorHandler);
    const failure = await request(failing).get('/fail');
    expect(failure.status).toBe(500);
    expect(failure.body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(failure.body)).not.toContain(
      'private database details',
    );
  });

  it('rejects invalid bodies through reusable Joi middleware', async () => {
    const validationApp = express();
    validationApp.use(express.json());
    validationApp.post(
      '/input',
      validateRequest({
        body: Joi.object({ name: Joi.string().max(20).required() }).unknown(
          false,
        ),
      }),
      (_request, response) => response.sendStatus(204),
    );
    validationApp.use(
      (
        error: { status?: number; code?: string },
        _request: express.Request,
        response: express.Response,
        next: express.NextFunction,
      ) => {
        void next;
        return response.status(error.status ?? 500).json({ code: error.code });
      },
    );
    expect(
      (
        await request(validationApp)
          .post('/input')
          .send({ name: 'ok', admin: true })
      ).status,
    ).toBe(400);
    expect(
      (await request(validationApp).post('/input').send({ name: 12 })).status,
    ).toBe(400);
  });

  it('fails environment validation when required database configuration is missing', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Invalid environment configuration: DATABASE_URL',
    );
  });

  it('rejects live Paystack keys outside production and requires live keys in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://user:pass@localhost/db',
        PAYSTACK_SECRET_KEY: 'sk_live_private',
        PAYSTACK_PUBLIC_KEY: 'pk_live_public',
      }),
    ).toThrow('Paystack test keys required for development');
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:pass@localhost/db',
        PAYSTACK_SECRET_KEY: 'sk_test_private',
        PAYSTACK_PUBLIC_KEY: 'pk_test_public',
        PAYSTACK_CALLBACK_URL: 'https://site.example/booking/payment/callback',
        PAYSTACK_WEBHOOK_URL:
          'https://api.example/api/v1/payments/paystack/webhook',
      }),
    ).toThrow('Paystack live keys required for production');
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:pass@localhost/db',
      }),
    ).toThrow(
      'PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, PAYSTACK_CALLBACK_URL, PAYSTACK_WEBHOOK_URL',
    );
  });

  it('applies a stricter payment-initialization limiter', async () => {
    const limitedApp = createApp({
      ...validateEnvironment({
        DATABASE_URL: 'postgres://user:pass@localhost/db',
        RATE_LIMIT_SENSITIVE_MAX: '1',
      }),
      NODE_ENV: 'test',
    });
    const path = '/api/v1/payments/bookings/AB-0123456789ABCD/initialize';
    const first = await request(limitedApp)
      .post(path)
      .set('Idempotency-Key', 'payment-init-key-123456')
      .send({});
    const second = await request(limitedApp)
      .post(path)
      .set('Idempotency-Key', 'payment-init-key-123456')
      .send({});
    expect(first.status).not.toBe(429);
    expect(second.status).toBe(429);
  });

  it('validates payment initialization input and parses only webhook raw bytes', async () => {
    const invalid = await request(app)
      .post('/api/v1/payments/bookings/AB-0123456789ABCD/initialize')
      .set('Idempotency-Key', 'payment-init-key-123456')
      .set('Authorization', `Bearer ${'a'.repeat(64)}`)
      .send({ amount: 1 });
    expect(invalid.status).toBe(400);

    const previousSecret = env.PAYSTACK_SECRET_KEY;
    env.PAYSTACK_SECRET_KEY = 'sk_test_webhook_test';
    try {
      const invalidSignature = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', '0'.repeat(128))
        .send(Buffer.from('{"event":"charge.success"}'));
      expect(invalidSignature.status).toBe(401);
      const tooLarge = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(' '.repeat(110_000)));
      expect(tooLarge.status).toBe(413);
    } finally {
      env.PAYSTACK_SECRET_KEY = previousSecret;
    }
  });
});
