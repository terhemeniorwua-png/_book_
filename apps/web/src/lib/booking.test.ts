import { describe, expect, it } from 'vitest';
import {
  guestInformationSchema,
  parseApartmentAvailability,
  parseApartmentQuote,
  parsePaymentInitialization,
  parsePaymentVerification,
  staySelectionSchema,
} from './booking';

describe('booking forms', () => {
  it('accepts a valid stay and rejects reversed or invalid date ranges', () => {
    expect(
      staySelectionSchema.safeParse({
        checkIn: '2030-08-01',
        checkOut: '2030-08-03',
        guestCount: 2,
      }).success,
    ).toBe(true);
    expect(
      staySelectionSchema.safeParse({
        checkIn: '2030-08-03',
        checkOut: '2030-08-01',
        guestCount: 2,
      }).success,
    ).toBe(false);
    expect(
      staySelectionSchema.safeParse({
        checkIn: 'not-a-date',
        checkOut: '2030-08-03',
        guestCount: 0,
      }).success,
    ).toBe(false);
  });

  it('requires bounded guest contact details and policy acceptance', () => {
    const valid = {
      fullName: 'Ada Guest',
      email: 'ada@example.test',
      phone: '+2348031234567',
      specialRequests: 'Quiet room',
      acceptedTerms: true,
    };
    expect(guestInformationSchema.safeParse(valid).success).toBe(true);
    expect(
      guestInformationSchema.safeParse({ ...valid, acceptedTerms: false })
        .success,
    ).toBe(false);
    expect(
      guestInformationSchema.safeParse({ ...valid, email: 'bad' }).success,
    ).toBe(false);
    expect(
      guestInformationSchema.safeParse({ ...valid, fullName: 'x'.repeat(161) })
        .success,
    ).toBe(false);
    expect(
      guestInformationSchema.safeParse({ ...valid, unexpected: 'field' })
        .success,
    ).toBe(true);
  });

  it('validates availability and server quote responses before presenting them', () => {
    const apartmentId = '3b8c1492-a4f1-4d7a-8d41-44d853a73d91';
    const availability = parseApartmentAvailability({
      apartment: {
        id: apartmentId,
        name: 'Test stay',
        nightlyPrice: '200.00',
        currency: 'NGN',
        minStayNights: 1,
        maxStayNights: 30,
        maxGuests: 4,
        checkInPolicy: 'After 15:00',
        checkOutPolicy: null,
      },
      from: '2030-08-01',
      to: '2031-08-02',
      unavailableRanges: [{ startDate: '2030-08-04', endDate: '2030-08-06' }],
    });
    expect(availability.success).toBe(true);
    expect(
      parseApartmentAvailability({
        ...availability.data,
        unavailableRanges: [{ bookingReference: 'private' }],
      }).success,
    ).toBe(false);

    const quote = parseApartmentQuote({
      apartment: {
        id: apartmentId,
        name: 'Test stay',
        minStayNights: 1,
        maxStayNights: 30,
        maxGuests: 4,
        checkInPolicy: null,
        checkOutPolicy: null,
      },
      checkIn: '2030-08-01',
      checkOut: '2030-08-03',
      guestCount: 2,
      nights: 2,
      nightlyPrice: '200.00',
      currency: 'NGN',
      priceBreakdown: {
        nightly: { unitAmount: '200.00', quantity: 2, lineTotal: '400.00' },
        charges: [],
        discounts: [],
        discountTotal: '0.00',
        subtotal: '400.00',
        total: '400.00',
      },
      totalAmount: '400.00',
    });
    expect(quote.success).toBe(true);
  });

  it('accepts only Paystack checkout URLs and typed payment verification states', () => {
    expect(
      parsePaymentInitialization({
        authorizationUrl: 'https://checkout.paystack.com/abc123',
        reference: 'staywell_1234567890',
        currency: 'NGN',
      }).success,
    ).toBe(true);
    expect(
      parsePaymentInitialization({
        authorizationUrl: 'https://attacker.example/pay',
        reference: 'staywell_1234567890',
        currency: 'NGN',
      }).success,
    ).toBe(false);
    expect(
      parsePaymentVerification({
        status: 'succeeded',
        bookingStatus: 'confirmed',
      }).success,
    ).toBe(true);
  });
});
