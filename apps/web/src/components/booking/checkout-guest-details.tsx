'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { getApiBaseUrl } from '@/lib/apartments';
import { POLICY_VERSIONS } from '@/lib/policy-versions';

export function CheckoutGuestDetails({
  bookingReference,
  onSaved,
}: {
  bookingReference: string;
  onSaved: () => void;
}) {
  const [phoneError, setPhoneError] = useState('');
  const [termsError, setTermsError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();
    const accepted = form.get('acceptedTerms') === 'on';
    setRequestError('');
    setPhoneError(phone.length < 7 ? 'Enter a valid phone number.' : '');
    setTermsError(
      accepted
        ? ''
        : 'Agree to the Terms & Conditions and Privacy Notice to continue.',
    );
    if (phone.length < 7 || !accepted) return;
    const accessToken = sessionStorage.getItem(
      `staywell:booking-token:${bookingReference}`,
    );
    if (!accessToken) {
      setRequestError(
        'Your secure booking session has expired. Please start the booking again.',
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/bookings/${encodeURIComponent(bookingReference)}/guest-details`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            phone,
            acceptedTerms: true,
            acceptedTermsVersion: POLICY_VERSIONS.terms,
            acceptedPrivacyNotice: true,
            privacyNoticeVersion: POLICY_VERSIONS.privacy,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setRequestError(
          body?.error?.message ??
            'We could not save your details. Please try again.',
        );
        return;
      }
      onSaved();
    } catch {
      setRequestError(
        'We could not reach the booking service. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="guest-details-heading"
      className="rounded-3xl border border-forest/20 bg-white p-5 sm:p-6"
    >
      <h2
        id="guest-details-heading"
        className="font-display text-2xl text-ink"
      >
        One more step: your contact details
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        We have your name and email from Google. Add a phone number and agree
        to the terms to unlock payment.
      </p>
      <form onSubmit={submit} noValidate className="mt-5 grid gap-5">
        <label className="grid gap-2 text-sm font-medium text-ink">
          Phone number
          <input
            required
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            placeholder="+234 800 000 0000"
            aria-invalid={Boolean(phoneError)}
            className="min-h-12 rounded-xl border border-ink/15 bg-canvas px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
          />
          {phoneError ? (
            <span className="text-xs text-terracotta">{phoneError}</span>
          ) : (
            <span className="text-xs text-muted">
              Include a country code if you are outside Nigeria.
            </span>
          )}
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
          <input
            name="acceptedTerms"
            type="checkbox"
            className="mt-1 size-4 accent-forest"
            aria-invalid={Boolean(termsError)}
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
        {termsError ? (
          <p className="text-xs text-terracotta">{termsError}</p>
        ) : null}
        {requestError ? (
          <p
            role="alert"
            className="rounded-xl border border-terracotta/25 bg-terracotta/5 px-4 py-3 text-sm text-terracotta"
          >
            {requestError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="min-h-12 rounded-xl bg-forest px-6 py-3 text-sm font-semibold text-white hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </section>
  );
}
