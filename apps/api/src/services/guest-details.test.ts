import { describe, expect, it } from 'vitest';
import {
  createBookingBodySchema,
  PRIVACY_NOTICE_VERSION,
  TERMS_VERSION,
} from './booking-checkout.js';
import { guestDetailsComplete } from './guest-details.js';

const stay = {
  apartmentId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  checkIn: '2027-01-10',
  checkOut: '2027-01-12',
  guestCount: 2,
  fullName: 'Ada Obi',
  email: 'ada@example.com',
};
const consent = {
  phone: '+2348012345678',
  acceptedTerms: true,
  acceptedTermsVersion: TERMS_VERSION,
  acceptedPrivacyNotice: true,
  privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
};

describe('deferred guest details', () => {
  it('still requires phone and consent for a normal booking', () => {
    const { error } = createBookingBodySchema.validate(stay, {
      abortEarly: false,
    });
    const missing = error?.details.map((item) => item.path[0]);
    expect(missing).toEqual(
      expect.arrayContaining(['phone', 'acceptedTerms', 'acceptedPrivacyNotice']),
    );
  });

  it('accepts a normal booking with full details', () => {
    expect(
      createBookingBodySchema.validate({ ...stay, ...consent }).error,
    ).toBeUndefined();
  });

  it('accepts a Google booking that defers phone and consent', () => {
    expect(
      createBookingBodySchema.validate({ ...stay, deferGuestDetails: true })
        .error,
    ).toBeUndefined();
  });

  it('rejects phone or consent on a deferred booking', () => {
    expect(
      createBookingBodySchema.validate({
        ...stay,
        ...consent,
        deferGuestDetails: true,
      }).error,
    ).toBeDefined();
  });
});

describe('guestDetailsComplete', () => {
  const complete = {
    termsAcceptedAt: new Date(),
    privacyNoticeAcknowledgedAt: new Date(),
    guest: { phone: '+2348012345678' },
  };

  it('is true when phone and both consents are recorded', () => {
    expect(guestDetailsComplete(complete)).toBe(true);
  });

  it('is false when the phone is missing', () => {
    expect(guestDetailsComplete({ ...complete, guest: { phone: null } })).toBe(false);
    expect(guestDetailsComplete({ ...complete, guest: null })).toBe(false);
  });

  it('is false when either consent is missing', () => {
    expect(guestDetailsComplete({ ...complete, termsAcceptedAt: null })).toBe(false);
    expect(
      guestDetailsComplete({ ...complete, privacyNoticeAcknowledgedAt: null }),
    ).toBe(false);
  });
});
