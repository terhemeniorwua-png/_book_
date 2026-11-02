'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getApiBaseUrl } from '@/lib/apartments';
import {
  parseApartmentAvailability,
  parseApartmentQuote,
  staySelectionSchema,
  type ApartmentAvailability,
  type ApartmentQuote,
} from '@/lib/booking';

export type StaySelection = {
  checkIn: string;
  checkOut: string;
  guestCount: number;
};

function todayInLagos() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
}

function localDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nightsBetween(checkIn: string, checkOut: string) {
  return (
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) /
    86_400_000
  );
}

function formatDate(dateOnly: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${dateOnly}T00:00:00.000Z`));
}

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function StayDateSelector({
  apartmentId,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  maxGuests,
  onContinue,
  onSelectionChange,
}: {
  apartmentId: string;
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  maxGuests: number;
  onContinue: (selection: StaySelection) => void;
  onSelectionChange: (selection: StaySelection) => void;
}) {
  const today = useMemo(todayInLagos, []);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(
    String(Math.min(initialGuests, maxGuests)),
  );
  const [availability, setAvailability] =
    useState<ApartmentAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState('');
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [quote, setQuote] = useState<ApartmentQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [dateErrors, setDateErrors] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(() =>
    startOfMonth(new Date(`${today}T00:00:00`)),
  );

  useEffect(() => {
    const controller = new AbortController();
    const from = today;
    const to = addDays(today, 366);
    setLoadingAvailability(true);
    setAvailabilityError('');
    fetch(
      `${getApiBaseUrl()}/apartments/${encodeURIComponent(apartmentId)}/availability?from=${from}&to=${to}`,
      { signal: controller.signal, headers: { accept: 'application/json' } },
    )
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = (body as { error?: { message?: string } })?.error
            ?.message;
          throw new Error(message ?? 'Availability could not be loaded.');
        }
        const parsed = parseApartmentAvailability(body);
        if (!parsed.success)
          throw new Error('Availability response was invalid.');
        setAvailability(parsed.data);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAvailabilityError(
          error instanceof Error
            ? error.message
            : 'Availability could not be loaded.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAvailability(false);
      });
    return () => controller.abort();
  }, [apartmentId, today]);

  useEffect(() => {
    const selection = { checkIn, checkOut, guestCount: Number(guestCount) };
    onSelectionChange(selection);
  }, [checkIn, checkOut, guestCount, onSelectionChange]);

  useEffect(() => {
    const parsed = staySelectionSchema.safeParse({
      checkIn,
      checkOut,
      guestCount: Number(guestCount),
    });
    if (!availability || !parsed.success) {
      setQuote(null);
      setQuoteError('');
      setLoadingQuote(false);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({
      checkIn,
      checkOut,
      guestCount,
    });
    setLoadingQuote(true);
    setQuote(null);
    setQuoteError('');
    fetch(
      `${getApiBaseUrl()}/apartments/${encodeURIComponent(apartmentId)}/quote?${query}`,
      { signal: controller.signal, headers: { accept: 'application/json' } },
    )
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = (body as { error?: { message?: string } })?.error
            ?.message;
          throw new Error(message ?? 'This stay could not be priced.');
        }
        const result = parseApartmentQuote(body);
        if (!result.success) throw new Error('Pricing response was invalid.');
        setQuote(result.data);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setQuoteError(
          error instanceof Error
            ? error.message
            : 'This stay could not be priced.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingQuote(false);
      });
    return () => controller.abort();
  }, [apartmentId, availability, checkIn, checkOut, guestCount]);

  const calendarCells = useMemo(() => {
    const first = startOfMonth(month);
    const offset = first.getDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        first.getFullYear(),
        first.getMonth(),
        index - offset + 1,
      );
      return {
        date,
        dateOnly: localDateOnly(date),
        inMonth: date.getMonth() === month.getMonth(),
      };
    });
  }, [month]);
  const maxCalendarMonth = useMemo(
    () => startOfMonth(new Date(`${addDays(today, 365)}T00:00:00`)),
    [today],
  );
  const monthLabel = new Intl.DateTimeFormat('en-NG', {
    month: 'long',
    year: 'numeric',
  }).format(month);

  function isUnavailableDate(date: string) {
    return Boolean(
      availability?.unavailableRanges.some(
        (range) => date >= range.startDate && date < range.endDate,
      ),
    );
  }

  function isDepartureBlocked(date: string) {
    if (!checkIn || date <= checkIn) return false;
    const nights = nightsBetween(checkIn, date);
    if (!availability) return true;
    if (
      nights < availability.apartment.minStayNights ||
      nights > availability.apartment.maxStayNights
    )
      return true;
    return availability.unavailableRanges.some(
      (range) => checkIn < range.endDate && date > range.startDate,
    );
  }

  function isDateDisabled(date: string) {
    if (date < today || !availability || date >= availability.to) return true;
    const selectingDeparture = Boolean(checkIn && !checkOut && date > checkIn);
    return selectingDeparture
      ? isDepartureBlocked(date)
      : isUnavailableDate(date);
  }

  function chooseDate(date: string) {
    setDateErrors({});
    setQuote(null);
    setQuoteError('');
    if (checkIn && !checkOut && date > checkIn) {
      setCheckOut(date);
    } else {
      setCheckIn(date);
      setCheckOut('');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = staySelectionSchema.safeParse({
      checkIn,
      checkOut,
      guestCount: Number(guestCount),
    });
    if (!parsed.success) {
      setDateErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }
    if (!quote || quote.checkIn !== checkIn || quote.checkOut !== checkOut) {
      setDateErrors({
        checkOut: 'Wait for the server to confirm these dates and price.',
      });
      return;
    }
    setDateErrors({});
    onContinue(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 grid gap-6">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink" aria-live="polite">
            {monthLabel}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={month <= startOfMonth(new Date(`${today}T00:00:00`))}
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              className="size-10 rounded-full border border-ink/15 text-lg text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={month >= maxCalendarMonth}
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              className="size-10 rounded-full border border-ink/15 text-lg text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
        {loadingAvailability ? (
          <p
            className="rounded-xl bg-canvas px-4 py-5 text-sm text-muted"
            role="status"
          >
            Checking dates with the booking service…
          </p>
        ) : availabilityError ? (
          <p
            className="rounded-xl border border-terracotta/25 bg-terracotta/5 px-4 py-3 text-sm text-terracotta"
            role="alert"
          >
            {availabilityError}
          </p>
        ) : (
          <>
            <div
              className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted"
              aria-hidden="true"
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <span key={day} className="py-2">
                  {day}
                </span>
              ))}
            </div>
            <div
              className="grid grid-cols-7 gap-1"
              aria-label={`Calendar for ${monthLabel}`}
            >
              {calendarCells.map(({ date, dateOnly, inMonth }) => {
                const selected = dateOnly === checkIn || dateOnly === checkOut;
                const inStay = Boolean(
                  checkIn &&
                    checkOut &&
                    dateOnly > checkIn &&
                    dateOnly < checkOut,
                );
                const disabled = !inMonth || isDateDisabled(dateOnly);
                const title =
                  disabled && inMonth
                    ? isUnavailableDate(dateOnly)
                      ? 'Unavailable due to a reservation or blocked dates'
                      : 'Outside the selected stay rules'
                    : `Choose ${formatDate(dateOnly)}`;
                return (
                  <button
                    key={dateOnly}
                    type="button"
                    disabled={disabled}
                    title={title}
                    aria-label={`${formatDate(dateOnly)}${isUnavailableDate(dateOnly) ? ', unavailable' : ''}${dateOnly === checkIn ? ', check-in' : ''}${dateOnly === checkOut ? ', check-out' : ''}`}
                    aria-pressed={selected}
                    onClick={() => chooseDate(dateOnly)}
                    className={`aspect-square min-h-10 rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${selected ? 'bg-forest font-semibold text-white' : inStay ? 'rounded-none bg-sand text-ink' : 'text-ink hover:bg-sand'} ${!inMonth ? 'invisible' : ''} ${disabled && inMonth ? 'cursor-not-allowed text-muted/40 line-through' : ''}`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <span>
                <span className="mr-1 inline-block size-3 rounded-full bg-forest align-middle" />
                Selected
              </span>
              <span>
                <span className="mr-1 inline-block size-3 rounded-full border border-ink/20 align-middle line-through" />
                Unavailable
              </span>
              <span>
                Checkout may share a date with the next guest’s check-in.
              </span>
            </div>
            {availability?.unavailableRanges.length ? (
              <p className="mt-3 text-xs leading-5 text-muted">
                <span className="font-semibold text-ink">
                  Unavailable dates:
                </span>{' '}
                {availability.unavailableRanges
                  .map(
                    (range) =>
                      `${formatDate(range.startDate)} – ${formatDate(addDays(range.endDate, -1))}`,
                  )
                  .join('; ')}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">
                No blocked dates in this availability window.
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
        <div className="grid gap-2 text-sm font-medium text-ink">
          <span>Check-in</span>
          <div
            className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 py-3 text-sm"
            aria-live="polite"
          >
            {checkIn ? formatDate(checkIn) : 'Select an arrival date'}
          </div>
          {dateErrors.checkIn ? (
            <span className="text-xs text-terracotta">
              {dateErrors.checkIn}
            </span>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm font-medium text-ink">
          <span>Check-out</span>
          <div
            className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 py-3 text-sm"
            aria-live="polite"
          >
            {checkOut ? formatDate(checkOut) : 'Select a departure date'}
          </div>
          {dateErrors.checkOut ? (
            <span className="text-xs text-terracotta">
              {dateErrors.checkOut}
            </span>
          ) : null}
        </div>
      </div>

      <label className="grid max-w-xs gap-2 text-sm font-medium text-ink">
        Guests
        <select
          value={guestCount}
          onChange={(event) => setGuestCount(event.target.value)}
          className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
        >
          {Array.from({ length: maxGuests }, (_, index) => index + 1).map(
            (count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'guest' : 'guests'}
              </option>
            ),
          )}
        </select>
        <span className="text-xs font-normal text-muted">
          Up to {maxGuests} guests
        </span>
      </label>

      <div className="rounded-2xl bg-sand p-4 text-sm">
        <div className="flex justify-between gap-4 text-muted">
          <span>Price per night</span>
          <span>
            {quote
              ? money(quote.nightlyPrice, quote.currency)
              : availability
                ? money(
                    availability.apartment.nightlyPrice,
                    availability.apartment.currency,
                  )
                : '—'}
          </span>
        </div>
        {quote ? (
          <>
            <div className="mt-2 flex justify-between gap-4 text-muted">
              <span>Number of nights</span>
              <span>{quote.nights}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4 text-muted">
              <span>Nightly subtotal</span>
              <span>
                {money(quote.priceBreakdown.subtotal, quote.currency)}
              </span>
            </div>
            {quote.priceBreakdown.charges.map((charge, index) => (
              <div
                key={`${charge.name}-${index}`}
                className="mt-2 flex justify-between gap-4 text-muted"
              >
                <span>{charge.name}</span>
                <span>{money(charge.lineTotal, quote.currency)}</span>
              </div>
            ))}
            {quote.priceBreakdown.discountTotal !== '0.00' ? (
              <div className="mt-2 flex justify-between gap-4 text-muted">
                <span>Discount</span>
                <span>
                  −{money(quote.priceBreakdown.discountTotal, quote.currency)}
                </span>
              </div>
            ) : null}
            <div className="mt-3 flex justify-between gap-4 border-t border-ink/10 pt-3 font-semibold text-ink">
              <span>Estimated total</span>
              <span>{money(quote.totalAmount, quote.currency)}</span>
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted">
            {loadingQuote
              ? 'Calculating your total…'
              : 'Choose dates to see your server-calculated total.'}
          </p>
        )}
        {quoteError ? (
          <p className="mt-3 text-xs text-terracotta" role="alert">
            {quoteError}
          </p>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-muted">
        Check-in:{' '}
        {availability?.apartment.checkInPolicy ??
          'Property check-in details will be confirmed before arrival.'}
        <br />
        Check-out:{' '}
        {availability?.apartment.checkOutPolicy ??
          'Property check-out details will be confirmed before departure.'}
      </p>
      <button
        type="submit"
        disabled={
          !availability ||
          Boolean(availabilityError) ||
          loadingAvailability ||
          loadingQuote ||
          !quote
        }
        className="min-h-12 rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue to guest information
      </button>
    </form>
  );
}
