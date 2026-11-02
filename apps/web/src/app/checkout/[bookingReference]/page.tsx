import { notFound } from 'next/navigation';
import { CheckoutSummary } from '@/components/booking/checkout-summary';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ bookingReference: string }>;
}) {
  const { bookingReference } = await params;
  if (!/^AB-[A-F0-9]{14}$/.test(bookingReference)) notFound();
  return <CheckoutSummary bookingReference={bookingReference} />;
}
