'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apartments';
import {
  parseCancellationConfirmation,
  parseCancellationRequest,
  readCancellationToken,
  refundStatusLabel,
  type CancellationConfirmation,
  type CancellationRequest,
} from '@/lib/cancellation';

type RequestState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'expired'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; item: CancellationRequest }
  | {
      kind: 'cancelled';
      item: CancellationRequest;
      result: CancellationConfirmation;
    };

function stateForError(status: number, message: string): RequestState {
  if (status === 410) return { kind: 'expired', message };
  if (status === 400 || status === 404) return { kind: 'invalid', message };
  return { kind: 'error', message };
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

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

function formatInstant(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}

function ErrorPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="section-wrap">
      <section
        role="alert"
        className="mx-auto mt-10 max-w-2xl rounded-3xl border border-terracotta/20 bg-white p-7 text-center shadow-sm sm:p-10"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
          Unbooking request
        </p>
        <h1 className="mt-3 font-display text-3xl text-ink">{title}</h1>
        <div className="mt-3 text-sm leading-6 text-muted">{children}</div>
        <Link
          href="/apartments"
          className="mt-6 inline-flex rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
        >
          Browse apartments
        </Link>
        <p className="mt-4 text-xs leading-5 text-muted">
          Need help? Contact Staywell support with your booking reference.
        </p>
      </section>
    </main>
  );
}

export function CancellationRequestPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<RequestState>({ kind: 'loading' });
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (value: string) => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    try {
      const response = await fetch(`${getApiBaseUrl()}/cancellations/request`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'X-Cancellation-Token': value,
        },
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      const envelope =
        payload && typeof payload === 'object'
          ? (payload as { item?: unknown; error?: { message?: string } })
          : {};
      const parsed = parseCancellationRequest(envelope.item);
      if (!response.ok || !parsed.success) {
        setState(
          stateForError(
            response.status,
            envelope.error?.message ??
              'This cancellation link could not be verified.',
          ),
        );
        return;
      }
      setState({ kind: 'ready', item: parsed.data });
    } catch {
      if (!controller.signal.aborted)
        setState({
          kind: 'error',
          message:
            'We could not reach Staywell right now. Your booking has not been cancelled. Check your connection and try again.',
        });
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const value = readCancellationToken(window.location.hash);
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
    setToken(value);
    if (!value) {
      setState({
        kind: 'invalid',
        message:
          'This page needs the secure link from your booking confirmation email.',
      });
      return;
    }
    void load(value);
  }, [load]);

  useEffect(() => {
    if (!confirmationOpen) return;
    confirmButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) setConfirmationOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmationOpen, submitting]);

  async function confirmCancellation(item: CancellationRequest) {
    if (!token || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/cancellations/confirm`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'X-Cancellation-Token': token,
        },
        body: '{}',
      });
      const payload: unknown = await response.json().catch(() => null);
      const envelope =
        payload && typeof payload === 'object'
          ? (payload as { item?: unknown; error?: { message?: string } })
          : {};
      const parsed = parseCancellationConfirmation(envelope.item);
      if (!response.ok || !parsed.success) {
        setSubmitError(
          envelope.error?.message ??
            'The cancellation could not be completed. Your booking was not changed. Try again or contact support.',
        );
        return;
      }
      setToken(null);
      setConfirmationOpen(false);
      setState({ kind: 'cancelled', item, result: parsed.data });
    } catch {
      setSubmitError(
        'We could not confirm the cancellation. Your booking has not been changed. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <main id="main-content" className="section-wrap min-h-[60vh]">
        <div
          role="status"
          className="mx-auto mt-10 max-w-2xl rounded-3xl bg-white p-8 text-center text-muted"
        >
          Verifying your secure cancellation link…
        </div>
      </main>
    );
  }

  if (state.kind === 'invalid' || state.kind === 'expired') {
    return (
      <ErrorPanel
        title={
          state.kind === 'expired'
            ? 'This cancellation link has expired.'
            : 'This cancellation link is not valid.'
        }
      >
        {state.message}
      </ErrorPanel>
    );
  }

  if (state.kind === 'error') {
    return (
      <ErrorPanel title="We could not verify this request.">
        {state.message}
        {token ? (
          <button
            type="button"
            onClick={() => void load(token)}
            className="mt-4 inline-flex rounded-xl border border-forest px-5 py-3 text-sm font-semibold text-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
          >
            Try again
          </button>
        ) : null}
      </ErrorPanel>
    );
  }

  if (state.kind === 'cancelled') {
    const { result } = state;
    return (
      <main id="main-content" className="section-wrap min-h-[60vh]">
        <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-ink/10 bg-white p-7 text-center shadow-sm sm:p-10">
          <p
            role="status"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#285548]"
          >
            Unbooking request received
          </p>
          <h1 className="mt-3 font-display text-3xl text-ink">
            {result.message}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your cancellation request has been submitted successfully. You will
            receive a confirmation email and an update when your refund has been
            processed.
          </p>
          <dl className="mt-6 grid gap-3 rounded-2xl bg-sand/60 p-5 text-left text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Booking reference</dt>
              <dd className="mt-1 font-semibold text-ink">
                {result.bookingReference}
              </dd>
            </div>
          </dl>
          <Link
            href="/apartments"
            className="mt-6 inline-flex rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
          >
            Browse apartments
          </Link>
        </section>
      </main>
    );
  }

  const { item } = state;
  const canCancel = item.eligible && !item.alreadyCancelled;

  return (
    <main id="main-content" className="section-wrap min-h-[70vh]">
      <div className="mx-auto mt-8 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#285548]">
          Unbooking request
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          {canCancel
            ? 'Unbook this apartment?'
            : 'This booking cannot be cancelled online.'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Opening this page did not change your booking. Nothing is cancelled
          until you explicitly confirm below.
        </p>

        <article className="mt-7 overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm">
          <div className="border-b border-ink/10 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#285548]">
              {item.apartment.location}
            </p>
            <h2 className="mt-2 font-display text-2xl text-ink">
              {item.apartment.name}
            </h2>
            <p className="mt-2 text-sm text-muted">
              Booking reference:{' '}
              <span className="font-semibold text-ink">
                {item.bookingReference}
              </span>
            </p>
          </div>
          <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2 sm:p-6">
            <div>
              <dt className="text-xs text-muted">Check-in</dt>
              <dd className="mt-1 font-medium text-ink">
                {displayDate(item.checkIn)}
              </dd>
              <dd className="text-xs text-muted">
                Scheduled from{' '}
                {formatInstant(item.scheduledCheckInAt, item.timeZone)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Check-out</dt>
              <dd className="mt-1 font-medium text-ink">
                {displayDate(item.checkOut)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Guests / nights</dt>
              <dd className="mt-1 font-medium text-ink">
                {item.guestCount} {item.guestCount === 1 ? 'guest' : 'guests'} ·{' '}
                {item.nights} {item.nights === 1 ? 'night' : 'nights'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Amount paid</dt>
              <dd className="mt-1 font-medium text-ink">
                {formatMoney(item.amountPaid, item.currency)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Cancellation deadline</dt>
              <dd className="mt-1 font-medium text-ink">
                {item.deadlineLabel}
              </dd>
            </div>
          </dl>
        </article>

        <section className="mt-6 rounded-3xl border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="font-display text-2xl text-ink">What happens next</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            If you confirm, your booking will be cancelled and the apartment
            dates released. A refund will be requested through Paystack under
            Staywell’s refund policy. We will email you when the refund outcome
            is confirmed; a pending or failed refund does not reactivate the
            booking.
          </p>
          {!canCancel ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-stone-100 p-4 text-sm leading-6 text-stone-800"
            >
              {item.message}
            </p>
          ) : null}
          {item.alreadyCancelled && item.refundStatus ? (
            <p className="mt-3 text-sm text-muted">
              Refund status:{' '}
              <span className="font-semibold text-ink">
                {refundStatusLabel(item.refundStatus)}
              </span>
            </p>
          ) : null}
        </section>

        {canCancel ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setConfirmationOpen(true)}
              className="order-2 min-h-12 rounded-xl border border-terracotta px-6 py-3 text-sm font-semibold text-terracotta focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-terracotta sm:order-1"
            >
              Unbook this apartment
            </button>
            <Link
              href="/apartments"
              className="order-1 text-center text-sm text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral sm:order-2"
            >
              Keep my booking
            </Link>
          </div>
        ) : (
          <Link
            href="/apartments"
            className="mt-6 inline-flex rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
          >
            Browse apartments
          </Link>
        )}
      </div>

      {confirmationOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancellation-dialog-title"
            aria-describedby="cancellation-dialog-description"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-7"
          >
            <h2
              id="cancellation-dialog-title"
              className="font-display text-2xl text-ink"
            >
              Unbook this apartment?
            </h2>
            <p
              id="cancellation-dialog-description"
              className="mt-3 text-sm leading-6 text-muted"
            >
              Are you sure you want to cancel this apartment booking? Your
              cancellation request will be submitted for processing. You will
              receive a confirmation and an update regarding your refund.
            </p>
            {submitError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-800"
              >
                {submitError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                ref={confirmButton}
                type="button"
                disabled={submitting}
                onClick={() => void confirmCancellation(item)}
                className="min-h-12 rounded-xl bg-terracotta px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-terracotta disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? 'Submitting request…' : 'Yes, Unbook'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmationOpen(false)}
                className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:opacity-60"
              >
                Keep My Booking
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
