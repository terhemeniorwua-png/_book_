import { describe, expect, it } from 'vitest';
import {
  parseCancellationConfirmation,
  parseCancellationRequest,
  readCancellationToken,
  refundStatusLabel,
} from './cancellation';

const token = 'A'.repeat(43);

const request = {
  bookingReference: 'AB-1234567890ABCD',
  bookingStatus: 'confirmed',
  paymentStatus: 'paid',
  guestName: 'Ada Guest',
  apartment: { name: 'Lagos Garden Apartment', location: 'Lagos' },
  checkIn: '2030-08-01',
  checkOut: '2030-08-03',
  nights: 2,
  guestCount: 2,
  amountPaid: '50000.00',
  currency: 'NGN',
  scheduledCheckInAt: '2030-08-01T13:00:00.000Z',
  cancellationDeadline: '2030-07-31T13:00:00.000Z',
  deadlineLabel: '31 July 2030 at 14:00',
  timeZone: 'Africa/Lagos',
  eligible: true,
  reason: null,
  message: 'This booking can be cancelled online.',
  checkedAt: '2030-07-01T10:00:00.000Z',
  alreadyCancelled: false,
  cancelledAt: null,
  refundStatus: null,
};

describe('cancellation link and API parsing', () => {
  it('reads only a correctly shaped token from the URL fragment', () => {
    expect(readCancellationToken(`#token=${token}`)).toBe(token);
    expect(readCancellationToken(`token=${token}`)).toBe(token);
    expect(readCancellationToken('#token=short')).toBeNull();
    expect(readCancellationToken('#token=')).toBeNull();
    expect(readCancellationToken('')).toBeNull();
  });

  it('accepts a server cancellation summary and rejects malformed money/time data', () => {
    const parsed = parseCancellationRequest(request);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.eligible).toBe(true);
    expect(
      parseCancellationRequest({ ...request, amountPaid: {} }).success,
    ).toBe(false);
    expect(
      parseCancellationRequest({ ...request, refundStatus: 'unknown' }).success,
    ).toBe(false);
    expect(parseCancellationRequest({ ...request, timeZone: 42 }).success).toBe(
      false,
    );
  });

  it('keeps cancellation success and refund status distinct', () => {
    for (const refundStatus of [
      'pending',
      'processing',
      'successful',
      'failed',
      'not_applicable',
    ]) {
      expect(
        parseCancellationConfirmation({
          bookingReference: request.bookingReference,
          bookingStatus: 'cancelled',
          refundStatus,
          message: 'Unbooking request received!',
        }).success,
      ).toBe(true);
    }
    expect(
      parseCancellationConfirmation({
        bookingReference: request.bookingReference,
        bookingStatus: 'cancelled',
        refundStatus: 'refunded',
        message: 'Unbooking request received!',
      }).success,
    ).toBe(false);
  });

  it('labels refund states without implying success', () => {
    expect(refundStatusLabel('successful')).toBe('Refund completed');
    expect(refundStatusLabel('pending')).toBe('Refund pending');
    expect(refundStatusLabel('processing')).toBe('Refund processing');
    expect(refundStatusLabel('failed')).toBe('Refund needs attention');
    expect(refundStatusLabel('not_applicable')).toBe('No refund due');
  });
});
