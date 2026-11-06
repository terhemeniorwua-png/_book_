import { describe, expect, it } from 'vitest';
import { renderBookingConfirmationEmail } from './email-templates.js';

const input = {
  customerName: '<Taylor Guest>',
  bookingReference: 'AB-1234567890ABCD',
  apartmentName: 'Garden Apartment',
  apartmentLocation: 'Victoria Island, Lagos',
  apartmentSummary: 'A calm city stay with a private garden.',
  apartmentCoverImageUrl: 'https://images.unsplash.com/photo-example',
  checkInDate: '2030-11-20',
  checkInTime: '2:00 PM',
  checkOutDate: '2030-11-22',
  checkOutTime: '11:00',
  guestCount: 2,
  amountPaid: '50000.00',
  currency: 'NGN',
  cancellationDeadline: '19 November 2030 at 2:00 PM',
  cancellationUrl: 'https://staywell.example/booking/cancel#token=secret-token',
  termsUrl: 'https://staywell.example/terms-and-privacy#terms-and-conditions',
  privacyUrl: 'https://staywell.example/terms-and-privacy#privacy-notice',
  supportEmail: 'support@staywell.example',
};

describe('Staywell booking confirmation email template', () => {
  it('renders branded HTML and plain text with verified booking details and secure cancellation link', () => {
    const email = renderBookingConfirmationEmail(input);
    expect(email.subject).toBe('Your Staywell Apartment Booking Is Confirmed!');
    expect(email.html).toContain('#183C32');
    expect(email.html).toContain('#F6F1E8');
    expect(email.html).toContain('#C6A36B');
    expect(email.html).toContain(
      '<img src="https://images.unsplash.com/photo-example"',
    );
    expect(email.html).toContain('Taylor Guest');
    expect(email.html).not.toContain('<Taylor Guest>');
    expect(email.html).toContain('AB-1234567890ABCD');
    expect(email.html).toContain('Garden Apartment');
    expect(email.html).toContain('20 November 2030');
    expect(email.html).toContain('2:00 PM');
    expect(email.html).toContain('22 November 2030');
    expect(email.html).toContain('11:00');
    expect(email.html).toContain('NGN');
    expect(email.html).toContain('Paid · verified by Paystack');
    expect(email.html).toContain('Confirmed');
    expect(email.html).toContain('19 November 2030 at 2:00 PM');
    expect(email.html).toContain('Unbook Apartment');
    expect(email.html).toContain(input.cancellationUrl);
    expect(email.html).toContain('support@staywell.example');
    expect(email.html).toContain(input.termsUrl);
    expect(email.html).toContain(input.privacyUrl);
    expect(email.text).toContain(input.cancellationUrl);
    expect(email.text).toContain(input.termsUrl);
    expect(email.text).toContain(input.privacyUrl);
    expect(email.text).toContain(
      'Payment status: Paid and verified by Paystack',
    );
  });

  it('omits unapproved images and states when check-out time needs confirmation', () => {
    const email = renderBookingConfirmationEmail({
      ...input,
      apartmentCoverImageUrl: null,
      checkOutTime: null,
      supportEmail: null,
    });
    expect(email.html).not.toContain('<img');
    expect(email.text).toContain('time to be confirmed with Staywell');
    expect(email.html).toContain(
      'Check-out time: please confirm with Staywell',
    );
    expect(email.html).not.toContain('support@staywell.example');
  });
});
