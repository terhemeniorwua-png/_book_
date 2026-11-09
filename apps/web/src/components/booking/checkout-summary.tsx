'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apartments';
import {
  createSecretHex,
  parseBookingCheckout,
  parsePaymentInitialization,
  type BookingCheckout,
} from '@/lib/booking';
import { ApartmentPhoto } from '@/components/site/apartment-photo';
import { BookingProgress } from './booking-progress';
import { CheckoutGuestDetails } from './checkout-guest-details';

type CheckoutState =
  | { status: 'loading' }
  | { status: 'ready'; item: BookingCheckout }
  | { status: 'expired' }
  | { status: 'unavailable' };

function formatMoney(value: string | number, currency: string) {
  const number = Number(value);
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(
      number,
    );
  } catch {
    return `${currency} ${number.toFixed(2)}`;
  }
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

export function CheckoutSummary({
  bookingReference,
}: {
  bookingReference: string;
}) {
  const [state, setState] = useState<CheckoutState>({ status: 'loading' });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function beginPayment() {
    if (state.status !== 'ready' || paymentLoading) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const accessToken = sessionStorage.getItem(
        `staywell:booking-token:${bookingReference}`,
      );
      if (!accessToken)
        throw new Error(
          'Your secure booking session has expired. Return to guest information and try again.',
        );
      const keyStorage = `staywell:payment-key:${bookingReference}`;
      let idempotencyKey = sessionStorage.getItem(keyStorage);
      if (!idempotencyKey) {
        idempotencyKey = createSecretHex();
        sessionStorage.setItem(keyStorage, idempotencyKey);
      }
      const response = await fetch(
        `${getApiBaseUrl()}/payments/bookings/${encodeURIComponent(bookingReference)}/initialize`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
            'idempotency-key': idempotencyKey,
          },
          body: '{}',
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const envelope =
        payload && typeof payload === 'object'
          ? (payload as { item?: unknown; error?: { message?: string } })
          : {};
      const parsed = parsePaymentInitialization(envelope.item);
      if (!response.ok || !parsed.success)
        throw new Error(
          envelope.error?.message ??
            'Payment could not be started. Please try again.',
        );
      window.location.assign(parsed.data.authorizationUrl);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : 'Payment could not be started. Please try again.',
      );
      setPaymentLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const accessToken = sessionStorage.getItem(
        `staywell:booking-token:${bookingReference}`,
      );
      if (!accessToken) {
        setState({ status: 'unavailable' });
        return;
      }
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/bookings/${encodeURIComponent(bookingReference)}/checkout`,
          {
            cache: 'no-store',
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
          },
        );
        if (response.status === 410) {
          setState({ status: 'expired' });
          return;
        }
        if (!response.ok) {
          setState({ status: 'unavailable' });
          return;
        }
        const payload: unknown = await response.json();
        const item =
          payload && typeof payload === 'object'
            ? (payload as { item?: unknown }).item
            : undefined;
        const parsed = parseBookingCheckout(item);
        setState(
          parsed.success
            ? { status: 'ready', item: parsed.data }
            : { status: 'unavailable' },
        );
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
    }
    void load();
    return () => controller.abort();
  }, [bookingReference]);

  if (state.status === 'loading') {
    return (
      <main id="main-content" className="section-wrap">
        <div
          role="status"
          className="mx-auto max-w-3xl rounded-3xl bg-white p-8 text-center text-muted"
        >
          Loading your secure checkout summary…
        </div>
      </main>
    );
  }
  if (state.status === 'expired') {
    return (
      <main id="main-content" className="section-wrap">
        <BookingProgress current={3} />
        <div
          role="alert"
          className="mx-auto mt-10 max-w-3xl rounded-3xl border border-terracotta/20 bg-white p-8 text-center"
        >
          <h1 className="font-display text-3xl text-ink">
            Your date hold has expired.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Start again to check current availability and pricing.
          </p>
          <Link
            href="/apartments"
            className="mt-5 inline-flex rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            Browse apartments
          </Link>
        </div>
      </main>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <main id="main-content" className="section-wrap">
        <BookingProgress current={3} />
        <div
          role="alert"
          className="mx-auto mt-10 max-w-3xl rounded-3xl border border-terracotta/20 bg-white p-8 text-center"
        >
          <h1 className="font-display text-3xl text-ink">
            Checkout could not be verified.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This booking is available only in the browser session that created
            it. Return to your guest-information step or start a new booking.
          </p>
          <Link
            href="/apartments"
            className="mt-5 inline-flex rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            Browse apartments
          </Link>
        </div>
      </main>
    );
  }

  const { item } = state;
  const { priceBreakdown: price, apartment } = item;

  return (
    <main id="main-content" className="section-wrap min-h-[70vh]">
      <BookingProgress current={3} />
      <div className="mx-auto mt-10 max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#285548]">
          Step 3 of 4 · Payment
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          Review your stay.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Your reservation and total were prepared by the booking service.
          Confirm the details before continuing to secure payment.
        </p>

        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            {item.guestDetailsComplete ? null : (
              <CheckoutGuestDetails
                bookingReference={bookingReference}
                onSaved={() =>
                  setState((current) =>
                    current.status === 'ready'
                      ? {
                          status: 'ready',
                          item: { ...current.item, guestDetailsComplete: true },
                        }
                      : current,
                  )
                }
              />
            )}
            <article className="overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm sm:flex">
              <div className="relative aspect-[4/3] bg-sand sm:aspect-auto sm:min-h-52 sm:w-64 sm:shrink-0">
                <ApartmentPhoto
                  src={apartment.imageUrl}
                  alt={apartment.imageAlt ?? apartment.name}
                  sizes="(max-width: 640px) 100vw, 256px"
                  className="object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#285548]">
                  {apartment.displayLocation}
                </p>
                <h2 className="mt-2 font-display text-2xl text-ink">
                  {apartment.name}
                </h2>
                <p className="mt-3 text-sm text-muted">
                  Booking reference:{' '}
                  <span className="font-semibold text-ink">
                    {item.bookingReference}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  Reservation status: {item.status} · Payment status:{' '}
                  {item.paymentStatus}
                </p>
              </div>
            </article>

            <section
              aria-labelledby="stay-summary-heading"
              className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6"
            >
              <h2
                id="stay-summary-heading"
                className="font-display text-2xl text-ink"
              >
                Stay details
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Check-in</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {displayDate(item.checkIn)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Check-out</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {displayDate(item.checkOut)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Length of stay</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {item.nights} {item.nights === 1 ? 'night' : 'nights'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Guests</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {item.guestCount}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="policy-summary-heading"
              className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6"
            >
              <h2
                id="policy-summary-heading"
                className="font-display text-2xl text-ink"
              >
                Cancellation and payment terms
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                {apartment.cancellationPolicy ??
                  'Cancellation terms have not been provided. Contact the property before completing payment.'}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                {item.paymentTerms}
              </p>
              {item.expiresAt ? (
                <p className="mt-2 text-xs text-muted">
                  Hold expires:{' '}
                  {new Intl.DateTimeFormat('en', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.expiresAt))}
                </p>
              ) : null}
            </section>
          </section>

          <aside className="h-fit rounded-3xl border border-ink/10 bg-white p-5 shadow-sm lg:sticky lg:top-28 sm:p-6">
            <h2 className="font-display text-2xl text-ink">Price summary</h2>
            <div className="mt-5 space-y-3 border-b border-ink/10 pb-5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted">
                  {formatMoney(price.nightly.unitAmount, item.currency)} ×{' '}
                  {item.nights} nights
                </span>
                <span className="text-ink">
                  {formatMoney(price.nightly.lineTotal, item.currency)}
                </span>
              </div>
              {price.charges.map((charge, index) => (
                <div
                  key={`${charge.name}-${index}`}
                  className="flex justify-between gap-4"
                >
                  <span className="text-muted">
                    {charge.name}
                    {charge.required ? '' : ' (optional)'}
                  </span>
                  <span className="text-ink">
                    {formatMoney(charge.lineTotal, charge.currency)}
                  </span>
                </div>
              ))}
              {price.discounts.length ? (
                price.discounts.map((discount, index) => (
                  <div
                    key={`${discount.name ?? 'discount'}-${index}`}
                    className="flex justify-between gap-4"
                  >
                    <span className="text-muted">
                      {discount.name ?? 'Discount'}
                    </span>
                    <span className="text-forest">
                      −{formatMoney(discount.amount ?? 0, item.currency)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between gap-4">
                  <span className="text-muted">Discounts</span>
                  <span className="text-muted">None applied</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-muted">Subtotal</span>
                <span className="text-ink">
                  {formatMoney(price.subtotal, item.currency)}
                </span>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-5">
              <span className="font-semibold text-ink">Total payable</span>
              <span className="font-display text-2xl text-ink">
                {formatMoney(item.totalAmount, item.currency)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void beginPayment()}
              disabled={paymentLoading || !item.guestDetailsComplete}
              className="min-h-12 w-full rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:cursor-wait disabled:opacity-60"
            >
              {paymentLoading
                ? 'Connecting to Paystack…'
                : 'Continue to Paystack'}
            </button>
            {paymentError ? (
              <p
                role="alert"
                className="mt-3 text-center text-sm text-terracotta"
              >
                {paymentError}
              </p>
            ) : null}
            <p className="mt-3 text-center text-xs leading-5 text-muted">
              Payment is processed securely by Paystack. Your hold remains
              subject to the expiry time above.
            </p>
            <Link
              href={`/booking?apartmentId=${encodeURIComponent(apartment.id)}&apartmentSlug=${encodeURIComponent(apartment.slug)}&checkIn=${item.checkIn}&checkOut=${item.checkOut}&guests=${item.guestCount}`}
              className="mt-4 block rounded px-2 py-2 text-center text-sm text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
            >
              Review guest information
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
