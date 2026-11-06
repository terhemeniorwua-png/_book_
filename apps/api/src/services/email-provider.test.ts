import { describe, expect, it, vi } from 'vitest';
import { deliverEmail } from './email-provider.js';

const message = {
  to: 'guest@example.test',
  subject: 'Staywell confirmation',
  html: '<p>Confirmed</p>',
  text: 'Confirmed',
  idempotencyKey: 'a'.repeat(64),
};
const configuration = {
  apiUrl: 'https://email.example.test/send',
  apiKey: 'mock-provider-key',
  fromAddress: 'Staywell <bookings@example.test>',
};

describe('email provider delivery', () => {
  it('retries a transient provider failure using the same idempotency key', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messageId: 'email_123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const result = await deliverEmail(message, fetcher, configuration);
    expect(result).toEqual({
      accepted: true,
      retryable: false,
      errorCode: null,
      providerMessageId: 'email_123',
      providerStatus: 200,
      attempts: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
  'api-key': 'mock-provider-key',
});
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
  'api-key': 'mock-provider-key',
});
    expect(JSON.stringify(fetcher.mock.calls[1]?.[1]?.body)).not.toContain(
      configuration.apiKey,
    );
  });

  it('does not retry permanent rejection and returns a safe status', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 400 }));
    const result = await deliverEmail(message, fetcher, configuration);
    expect(result).toMatchObject({
      accepted: false,
      retryable: false,
      errorCode: 'EMAIL_PROVIDER_400',
      providerStatus: 400,
      attempts: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('leaves retryable state after repeated transient failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 503 }));
    const result = await deliverEmail(message, fetcher, configuration);
    expect(result).toMatchObject({
      accepted: false,
      retryable: true,
      errorCode: 'EMAIL_PROVIDER_503',
      providerStatus: 503,
      attempts: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
