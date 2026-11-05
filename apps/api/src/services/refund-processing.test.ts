import { describe, expect, it } from 'vitest';
import {
  mapProviderRefundStatus,
  sanitizeRefundMetadata,
} from './refund-processing.js';

describe('refund status mapping and metadata', () => {
  it('maps provider outcomes without treating pending as successful', () => {
    expect(mapProviderRefundStatus('processed')).toBe('successful');
    expect(mapProviderRefundStatus('success')).toBe('successful');
    expect(mapProviderRefundStatus('completed')).toBe('successful');
    expect(mapProviderRefundStatus('pending')).toBe('processing');
    expect(mapProviderRefundStatus('queued')).toBe('processing');
    expect(mapProviderRefundStatus('processing')).toBe('processing');
    expect(mapProviderRefundStatus('failed')).toBe('failed');
    expect(mapProviderRefundStatus('reversed')).toBe('failed');
    expect(mapProviderRefundStatus('cancelled')).toBe('failed');
    expect(mapProviderRefundStatus(undefined)).toBe('processing');
  });

  it('keeps only non-sensitive provider metadata', () => {
    expect(
      sanitizeRefundMetadata({
        id: 123,
        status: 'processed',
        amount: 50000,
        currency: 'NGN',
        transaction: 'reference',
        authorization: { card: 'secret' },
        customer: { email: 'private@example.test' },
        access_code: 'secret',
      }),
    ).toEqual({
      id: 123,
      status: 'processed',
      amount: 50000,
      currency: 'NGN',
      transaction: 'reference',
    });
    expect(sanitizeRefundMetadata(null)).toEqual({});
    expect(sanitizeRefundMetadata([])).toEqual({});
    expect(sanitizeRefundMetadata('value')).toEqual({});
  });
});
