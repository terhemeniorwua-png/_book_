type BookingRecord = { [key: string]: unknown };

/** A booking can be paid only once the guest's phone and both consents are on record. */
export function guestDetailsComplete(booking: BookingRecord) {
  const guest = booking.guest as BookingRecord | null | undefined;
  const phone = guest?.phone;
  return Boolean(
    booking.termsAcceptedAt &&
      booking.privacyNoticeAcknowledgedAt &&
      typeof phone === 'string' &&
      phone.length > 0,
  );
}
