import { describe, expect, it } from 'vitest';
import { createBookingBodySchema } from './booking-checkout.js';

const validInput = {
  apartmentId: 'f410a7e3-7aa0-4fb7-a4af-794c85a85bfe',
  checkIn: '2030-08-01',
  checkOut: '2030-08-03',
  guestCount: 1,
  fullName: 'Ada Guest',
  email: 'ada@example.test',
  phone: '+2348031234567',
  acceptedTerms: true,
  acceptedTermsVersion: 'booking-terms-v1',
  acceptedPrivacyNotice: true,
  privacyNoticeVersion: 'privacy-notice-v1',
};

describe('booking policy acceptance API validation', () => {
  it('accepts current explicit Terms and Privacy versions', () => {
    expect(createBookingBodySchema.validate(validInput).error).toBeUndefined();
  });

  it.each([
    ['Terms were not accepted', { acceptedTerms: false }],
    ['Privacy Notice was not acknowledged', { acceptedPrivacyNotice: false }],
    ['Terms version is stale', { acceptedTermsVersion: 'booking-terms-v2' }],
    ['Privacy version is stale', { privacyNoticeVersion: 'privacy-notice-v2' }],
    ['Terms acknowledgement is missing', { acceptedTerms: undefined }],
    [
      'Privacy acknowledgement is missing',
      { acceptedPrivacyNotice: undefined },
    ],
  ])('rejects when %s', (_description, override) => {
    expect(
      createBookingBodySchema.validate({ ...validInput, ...override }).error,
    ).toBeDefined();
  });
});
