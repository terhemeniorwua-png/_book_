import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createPaystackClient,
  canConfirmPaidReservation,
  paymentReferenceSchema,
  toPaystackMinorUnits,
  verificationMatches,
  verifyPaystackSignature,
} from './paystack.js';

describe('Paystack client and webhook signatures', () => {
  it('converts naira to integer kobo and rejects unsafe amounts', () => {
    expect(toPaystackMinorUnits('1250.50')).toBe(125050);
    expect(() => toPaystackMinorUnits('0')).toThrow();
    expect(() => toPaystackMinorUnits('1.239')).toThrow();
    expect(() => toPaystackMinorUnits('90071992547410')).toThrow();
  });

  it('confirms only an unexpired pending hold that still owns inventory', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60_000);
    expect(canConfirmPaidReservation('pending', expiresAt, true, now)).toBe(
      true,
    );
    expect(canConfirmPaidReservation('pending', new Date(now), true, now)).toBe(
      false,
    );
    expect(canConfirmPaidReservation('expired', expiresAt, true, now)).toBe(
      false,
    );
    expect(canConfirmPaidReservation('cancelled', expiresAt, true, now)).toBe(
      false,
    );
    expect(canConfirmPaidReservation('pending', expiresAt, false, now)).toBe(
      false,
    );
  });

  it('requires exact provider reference, amount, currency, customer, and key mode', () => {
    const payment = {
      transactionReference: 'staywell_reference',
      expectedAmount: '500.00',
      currency: 'NGN',
    };
    const verified = {
      id: 123,
      domain: 'test' as const,
      reference: 'staywell_reference',
      status: 'success',
      amount: 50000,
      currency: 'NGN',
      customer: { email: 'guest@example.test' },
    };
    expect(verificationMatches(verified, payment, 'guest@example.test')).toBe(
      true,
    );
    expect(
      verificationMatches(
        { ...verified, amount: 49999 },
        payment,
        'guest@example.test',
      ),
    ).toBe(false);
    expect(
      verificationMatches(
        { ...verified, currency: 'USD' },
        payment,
        'guest@example.test',
      ),
    ).toBe(false);
    expect(
      verificationMatches(
        { ...verified, reference: 'other-reference' },
        payment,
        'guest@example.test',
      ),
    ).toBe(false);
    expect(
      verificationMatches(
        { ...verified, domain: 'live' },
        payment,
        'guest@example.test',
      ),
    ).toBe(false);
    expect(verificationMatches(verified, payment, 'other@example.test')).toBe(
      false,
    );
  });

  it('rejects malformed transaction references before provider verification', () => {
    expect(
      paymentReferenceSchema.validate({ reference: 'valid_ref-123' }).error,
    ).toBeUndefined();
    expect(
      paymentReferenceSchema.validate({ reference: 'https://attacker.test' })
        .error,
    ).toBeDefined();
    expect(
      paymentReferenceSchema.validate({ reference: 'ref-123', extra: true })
        .error,
    ).toBeDefined();
  });

  it('verifies the HMAC-SHA512 against the exact raw request bytes', () => {
    const secret = 'sk_test_example_only';
    const body = Buffer.from(
      '{"event":"charge.success","data":{"reference":"ref-1"}}',
    );
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
    expect(
      verifyPaystackSignature(
        Buffer.from(`${body.toString()} `),
        signature,
        secret,
      ),
    ).toBe(false);
    expect(verifyPaystackSignature(body, '00', secret)).toBe(false);
    expect(verifyPaystackSignature(body, undefined, secret)).toBe(false);
  });

  it('initializes through Paystack REST with backend bearer auth and returns provider data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            authorization_url: 'https://checkout.paystack.com/example',
            access_code: 'code',
            reference: 'server-ref',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = createPaystackClient('sk_test_private', fetcher);
    const result = await client.initialize({
      amount: '250000',
      currency: 'NGN',
      reference: 'server-ref',
      email: 'guest@example.test',
    });
    expect(result.authorization_url).toBe(
      'https://checkout.paystack.com/example',
    );
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect((options?.headers as Record<string, string>).authorization).toBe(
      'Bearer sk_test_private',
    );
    expect(JSON.parse(String(options?.body))).toMatchObject({
      amount: '250000',
      currency: 'NGN',
    });
  });

  it('does not expose raw Paystack provider errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: false,
          message: 'secret provider details',
          data: null,
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = createPaystackClient('sk_test_private', fetcher);
    await expect(client.verify('reference-123')).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_REJECTED',
    });
    await expect(client.verify('reference-123')).rejects.not.toThrow(
      'secret provider details',
    );
  });

  it('handles a failed Paystack verification response without returning provider details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: false,
          message: 'Private account detail',
          data: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = createPaystackClient('sk_test_private', fetcher);
    await expect(client.verify('valid_reference')).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_REJECTED',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/transaction/verify/valid_reference',
    );
  });
});
