'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookingProgress } from './booking-progress';
import { getApiBaseUrl } from '@/lib/apartments';
import { parsePaymentVerification } from '@/lib/booking';

type Result = { kind: 'loading' } | { kind: 'success' } | { kind: 'pending' } | { kind: 'error'; message: string };

export function PaymentCallback({ reference, bookingReference }: { reference: string; bookingReference: string }) {
  const [result, setResult] = useState<Result>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    async function verify() {
      if (!/^AB-[A-F0-9]{14}$/.test(bookingReference) || !/^[A-Za-z0-9.=\-_]{8,120}$/.test(reference)) {
        setResult({ kind: 'error', message: 'This payment return could not be matched to a booking.' });
        return;
      }
      const accessToken = sessionStorage.getItem(`staywell:booking-token:${bookingReference}`);
      if (!accessToken) {
        setResult({ kind: 'error', message: 'The secure booking session is unavailable in this browser. Contact support with your booking reference.' });
        return;
      }
      try {
        const response = await fetch(`${getApiBaseUrl()}/payments/verify`, {
          method: 'POST',
          cache: 'no-store',
          headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ reference, bookingReference }),
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        const envelope = payload && typeof payload === 'object' ? payload as { item?: unknown; error?: { message?: string } } : {};
        const parsed = parsePaymentVerification(envelope.item);
        if (!response.ok || !parsed.success) {
          setResult({ kind: 'error', message: envelope.error?.message ?? 'Payment verification is not available yet. Your booking has not been confirmed.' });
        } else if (parsed.data.status === 'succeeded' && parsed.data.bookingStatus === 'confirmed') {
          setResult({ kind: 'success' });
          sessionStorage.removeItem(`staywell:payment-key:${bookingReference}`);
        } else if (parsed.data.status === 'pending') {
          setResult({ kind: 'pending' });
        } else {
          setResult({ kind: 'error', message: 'Payment was not completed. The reservation is not confirmed.' });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ kind: 'error', message: 'Payment verification could not be reached. Refresh to check again; your reservation is not confirmed until verification completes.' });
      }
    }
    void verify();
    return () => controller.abort();
  }, [bookingReference, reference]);

  const heading = result.kind === 'success' ? 'Your stay is confirmed.' : result.kind === 'pending' ? 'Payment is still processing.' : result.kind === 'loading' ? 'Verifying your payment…' : 'We could not confirm payment.';
  return (
    <main id="main-content" className="section-wrap min-h-[70vh]">
      <BookingProgress current={result.kind === 'success' ? 4 : 3} />
      <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-ink/10 bg-white p-7 text-center shadow-sm sm:p-10">
        <p role={result.kind === 'error' ? 'alert' : 'status'} className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
          {result.kind === 'success' ? 'Booking complete' : result.kind === 'pending' ? 'Payment pending' : 'Payment verification'}
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">{heading}</h1>
        {result.kind === 'error' ? <p className="mt-3 text-sm leading-6 text-muted">{result.message}</p> : null}
        {result.kind === 'pending' ? <p className="mt-3 text-sm leading-6 text-muted">Paystack has not reported a final result yet. This page never treats a redirect as proof of payment. Refresh shortly to check again.</p> : null}
        {result.kind === 'success' ? <p className="mt-3 text-sm leading-6 text-muted">Your payment was independently verified and the reservation has been confirmed.</p> : null}
        {bookingReference ? <p className="mt-4 text-sm text-muted">Booking reference: <span className="font-semibold text-ink">{bookingReference}</span></p> : null}
        <Link href="/apartments" className="mt-6 inline-flex rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral">Browse apartments</Link>
      </section>
    </main>
  );
}
