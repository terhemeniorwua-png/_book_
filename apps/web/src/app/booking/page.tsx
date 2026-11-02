import { BookingForm } from '@/components/booking/booking-form';
import { ErrorMessage } from '@/components/site/error-message';
import { getApartment } from '@/lib/apartments';

type SearchParams = Record<string, string | string[] | undefined>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const apartmentId = first(params.apartmentId);
  const apartmentSlug = first(params.apartmentSlug);
  if (
    !apartmentId ||
    !uuid.test(apartmentId) ||
    !apartmentSlug ||
    !slugPattern.test(apartmentSlug)
  ) {
    return (
      <main id="main-content" className="section-wrap">
        <ErrorMessage title="Choose an apartment to continue">
          Return to apartment discovery and select the place you would like to
          book.
        </ErrorMessage>
      </main>
    );
  }

  const result = await getApartment(apartmentSlug);
  if (result.status !== 'success' || result.apartment.id !== apartmentId) {
    return (
      <main id="main-content" className="section-wrap">
        <ErrorMessage
          title={
            result.status === 'unavailable'
              ? 'Booking is temporarily unavailable'
              : 'Apartment not found'
          }
        >
          {result.status === 'unavailable'
            ? 'We could not confirm this apartment. Please try again shortly.'
            : 'This apartment is no longer available for booking.'}
        </ErrorMessage>
      </main>
    );
  }

  const initialCheckIn = first(params.checkIn) ?? '';
  const initialCheckOut = first(params.checkOut) ?? '';
  const guestValue = Number(first(params.guests) ?? '1');
  const initialGuests =
    Number.isInteger(guestValue) && guestValue > 0 ? guestValue : 1;

  return (
    <BookingForm
      apartment={result.apartment}
      apartmentId={apartmentId}
      initialCheckIn={
        /^\d{4}-\d{2}-\d{2}$/.test(initialCheckIn) ? initialCheckIn : ''
      }
      initialCheckOut={
        /^\d{4}-\d{2}-\d{2}$/.test(initialCheckOut) ? initialCheckOut : ''
      }
      initialGuests={initialGuests}
    />
  );
}
