'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useState, type FormEvent } from 'react';
import type { ApartmentDetail } from '@/lib/apartments';
import { getApiBaseUrl } from '@/lib/apartments';
import { POLICY_VERSIONS } from '@/lib/policy-versions';
import {
  createSecretHex,
  guestInformationSchema,
  parseBookingCreation,
} from '@/lib/booking';
import { ApartmentPhoto } from '@/components/site/apartment-photo';
import { BookingProgress } from './booking-progress';
import { StayDateSelector, type StaySelection } from './stay-date-selector';
import {
  GoogleContinueButton,
  type GoogleProfile,
} from './google-continue-button';

type FieldErrors = Record<string, string>;

export function BookingForm({
  apartment,
  apartmentId,
  initialCheckIn = '',
  initialCheckOut = '',
  initialGuests = 1,
}: {
  apartment: ApartmentDetail;
  apartmentId: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'dates' | 'guest'>('dates');
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(
    String(Math.min(initialGuests, apartment.maxGuests)),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile | null>(
    null,
  );

  const updateSelection = useCallback((selection: StaySelection) => {
    setCheckIn(selection.checkIn);
    setCheckOut(selection.checkOut);
    setGuestCount(String(selection.guestCount));
  }, []);

  function continueFromDates(selection: StaySelection) {
    const next = new URLSearchParams({
      apartmentId,
      apartmentSlug: apartment.slug,
      checkIn: selection.checkIn,
      checkOut: selection.checkOut,
      guests: String(selection.guestCount),
    });
    router.replace(`/booking?${next.toString()}`, { scroll: false });
    setErrors({});
    setStep('guest');
  }

  async function submitGuestInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError('');
    const form = new FormData(event.currentTarget);
    const parsed = guestInformationSchema.safeParse({
      fullName: form.get('fullName'),
      email: form.get('email'),
      phone: form.get('phone'),
      specialRequests: form.get('specialRequests') ?? '',
      acceptedTerms: form.get('acceptedTerms') === 'on',
      acceptedPrivacyNotice: form.get('acceptedTerms') === 'on',
      acceptedTermsVersion: POLICY_VERSIONS.terms,
      privacyNoticeVersion: POLICY_VERSIONS.privacy,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return;
    }

    setErrors({});
    setSubmitting(true);
    const attemptKey = `staywell:attempt:${apartmentId}:${checkIn}:${checkOut}:${guestCount}`;
    let attempt: { idempotencyKey: string; accessToken: string };
    try {
      const stored = sessionStorage.getItem(attemptKey);
      attempt = stored
        ? (JSON.parse(stored) as typeof attempt)
        : {
            idempotencyKey: createSecretHex(),
            accessToken: createSecretHex(),
          };
      sessionStorage.setItem(attemptKey, JSON.stringify(attempt));
      const response = await fetch(`${getApiBaseUrl()}/bookings`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'Idempotency-Key': attempt.idempotencyKey,
          authorization: `Bearer ${attempt.accessToken}`,
        },
        body: JSON.stringify({
          apartmentId,
          checkIn,
          checkOut,
          guestCount: Number(guestCount),
          fullName: parsed.data.fullName.trim(),
          email: parsed.data.email.trim().toLowerCase(),
          phone: parsed.data.phone.trim(),
          specialRequests: parsed.data.specialRequests,
          acceptedTerms: parsed.data.acceptedTerms,
          acceptedTermsVersion: parsed.data.acceptedTermsVersion,
          acceptedPrivacyNotice: parsed.data.acceptedPrivacyNotice,
          privacyNoticeVersion: parsed.data.privacyNoticeVersion,
        }),
      });
      const body: unknown = await response.json();
      const result = parseBookingCreation(body);
      if (!response.ok || !result.success) {
        const errorBody =
          body && typeof body === 'object'
            ? (body as { error?: { message?: string } }).error
            : undefined;
        setRequestError(
          errorBody?.message ??
            'We could not save this booking. Check your details and try again.',
        );
        return;
      }
      sessionStorage.setItem(
        `staywell:booking-token:${result.data.bookingReference}`,
        result.data.accessToken,
      );
      router.push(
        `/checkout/${encodeURIComponent(result.data.bookingReference)}`,
      );
    } catch {
      setRequestError(
        'We could not reach the booking service. Your entries are still here; please retry.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="section-wrap min-h-[70vh]">
      <BookingProgress current={step === 'dates' ? 1 : 2} />
      <div className="mx-auto mt-10 grid max-w-6xl gap-8 lg:grid-cols-[1fr_340px]">
        <section className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#285548]">
            {step === 'dates' ? 'Step 1 of 4' : 'Step 2 of 4'}
          </p>
          <h1 className="mt-2 font-display text-3xl text-ink">
            {step === 'dates'
              ? 'Choose your dates.'
              : 'Your guest information.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {step === 'dates'
              ? 'Select your stay dates and the number of guests. Availability and pricing are confirmed by the booking service.'
              : 'Share the details needed to prepare your reservation. Your contact information is not included in public apartment responses.'}
          </p>

          {step === 'dates' ? (
            <StayDateSelector
              apartmentId={apartmentId}
              initialCheckIn={checkIn}
              initialCheckOut={checkOut}
              initialGuests={Number(guestCount)}
              maxGuests={apartment.maxGuests}
              onSelectionChange={updateSelection}
              onContinue={continueFromDates}
            />
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-sand px-4 py-3 text-sm text-ink">
                <span>{checkIn}</span>
                <span aria-hidden="true">→</span>
                <span>{checkOut}</span>
                <span className="text-muted">
                  · {guestCount} {Number(guestCount) === 1 ? 'guest' : 'guests'}
                </span>
                <button
                  type="button"
                  onClick={() => setStep('dates')}
                  className="ml-auto rounded px-2 py-1 text-xs font-semibold text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                >
                  Change
                </button>
              </div>
              {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                <div className="mt-6 grid gap-2">
                  <GoogleContinueButton onProfile={setGoogleProfile} />
                  <p className="text-xs text-muted">
                    {googleProfile
                      ? `Details filled in from Google (${googleProfile.email}). Add your phone number below.`
                      : 'Or enter your details below.'}
                  </p>
                </div>
              ) : null}
              <form
                onSubmit={submitGuestInformation}
                className="mt-6 grid gap-5"
              >
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Full name
                  <input
                    required
                    name="fullName"
                    autoComplete="name"
                    key={googleProfile?.fullName ?? 'manual-name'}
                    defaultValue={googleProfile?.fullName ?? ''}
                    maxLength={160}
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={
                      errors.fullName ? 'full-name-error' : undefined
                    }
                    className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                  />
                  {errors.fullName ? (
                    <span
                      id="full-name-error"
                      className="text-xs text-terracotta"
                    >
                      {errors.fullName}
                    </span>
                  ) : null}
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Email address
                    <input
                      required
                      name="email"
                      type="email"
                      autoComplete="email"
                      key={googleProfile?.email ?? 'manual-email'}
                      defaultValue={googleProfile?.email ?? ''}
                      maxLength={320}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={
                        errors.email ? 'email-error' : undefined
                      }
                      className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                    />
                    {errors.email ? (
                      <span
                        id="email-error"
                        className="text-xs text-terracotta"
                      >
                        {errors.email}
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-ink">
                    Phone number
                    <input
                      required
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={32}
                      placeholder="+234 800 000 0000"
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={
                        errors.phone ? 'phone-error' : 'phone-help'
                      }
                      className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                    />
                    {errors.phone ? (
                      <span
                        id="phone-error"
                        className="text-xs text-terracotta"
                      >
                        {errors.phone}
                      </span>
                    ) : (
                      <span id="phone-help" className="text-xs text-muted">
                        Include a country code if you are outside Nigeria.
                      </span>
                    )}
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Special requests{' '}
                  <span className="font-normal text-muted">Optional</span>
                  <textarea
                    name="specialRequests"
                    rows={4}
                    maxLength={500}
                    className="rounded-xl border border-ink/15 bg-canvas px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                  />
                  <span className="text-xs text-muted">
                    Up to 500 characters. Requests are not guaranteed until
                    confirmed.
                  </span>
                </label>
                <div className="rounded-2xl border border-ink/10 bg-canvas/70 p-4 text-sm leading-6 text-muted">
                  <p className="font-semibold text-ink">Apartment policies</p>
                  <p className="mt-2">
                    {apartment.cancellationPolicy ??
                      'Cancellation terms have not been provided yet. Contact the property before completing payment.'}
                  </p>
                  <p className="mt-2">
                    Check-in:{' '}
                    {apartment.checkInPolicy ??
                      'Information has not been provided yet.'}
                  </p>
                  <p className="mt-2">
                    Check-out:{' '}
                    {apartment.checkOutPolicy ??
                      'Information has not been provided yet.'}
                  </p>
                  {apartment.houseRules.length ? (
                    <p className="mt-2">
                      House rules: {apartment.houseRules.join(' · ')}
                    </p>
                  ) : null}
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-ink">
                    <input
                      name="acceptedTerms"
                      type="checkbox"
                      className="mt-1 size-4 accent-forest"
                      aria-invalid={Boolean(errors.acceptedTerms)}
                      aria-describedby={
                        errors.acceptedTerms ? 'terms-error' : undefined
                      }
                    />
                    <span>
                      I have read and agree to Staywell&apos;s{' '}
                      <Link
                        href="/terms-and-privacy#terms-and-conditions"
                        className="font-semibold text-forest underline underline-offset-2"
                      >
                        Terms &amp; Conditions
                      </Link>{' '}
                      and acknowledge its{' '}
                      <Link
                        href="/terms-and-privacy#privacy-notice"
                        className="font-semibold text-forest underline underline-offset-2"
                      >
                        Privacy Notice
                      </Link>
                      .
                    </span>
                  </label>
                  {errors.acceptedTerms ? (
                    <p
                      id="terms-error"
                      className="mt-2 text-xs text-terracotta"
                    >
                      {errors.acceptedTerms}
                    </p>
                  ) : null}
                </div>
                {requestError ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-terracotta/25 bg-terracotta/5 px-4 py-3 text-sm text-terracotta"
                  >
                    {requestError}
                  </p>
                ) : null}
                <button
                  disabled={submitting}
                  type="submit"
                  className="min-h-12 rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:cursor-wait disabled:opacity-60"
                >
                  {submitting
                    ? 'Preparing your checkout…'
                    : 'Review booking and payment'}
                </button>
                <p className="text-center text-xs leading-5 text-muted">
                  Your dates will be held for 15 minutes after the server
                  confirms availability.
                </p>
              </form>
            </>
          )}
        </section>

        <aside className="h-fit overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm lg:sticky lg:top-28">
          <div className="relative aspect-[4/3] bg-sand">
            <ApartmentPhoto
              src={apartment.coverImageUrl}
              alt={apartment.coverImageAlt ?? apartment.name}
              sizes="(max-width: 1024px) 100vw, 340px"
              className="object-cover"
            />
          </div>
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#285548]">
              Your apartment
            </p>
            <h2 className="mt-2 font-display text-2xl text-ink">
              {apartment.name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {apartment.displayLocation}
            </p>
            <p className="mt-4 text-sm text-muted">
              {apartment.currency}{' '}
              {Number(apartment.nightlyPrice).toLocaleString('en')} per night
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              The final total is calculated by the booking service after dates
              and pricing rules are checked.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
