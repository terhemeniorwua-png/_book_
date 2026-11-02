import { PaymentCallback } from '@/components/booking/payment-callback';

export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    reference?: string;
    trxref?: string;
    bookingReference?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <PaymentCallback
      reference={query.reference ?? query.trxref ?? ''}
      bookingReference={query.bookingReference ?? ''}
    />
  );
}
