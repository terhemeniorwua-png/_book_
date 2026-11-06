import type { Metadata } from 'next';
import Link from 'next/link';
import { POLICY_LAST_UPDATED, POLICY_VERSIONS } from '@/lib/policy-versions';

export const metadata: Metadata = {
  title: 'Terms & Conditions and Privacy Notice',
  description:
    'Read the Staywell booking Terms & Conditions and Privacy Notice.',
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 border-b border-ink/10 py-8 last:border-0 sm:py-10"
    >
      <h2 className="font-display text-2xl text-forest sm:text-3xl">{title}</h2>
      <div className="policy-copy mt-5 space-y-4 text-sm leading-7 text-ink/80 sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export default function TermsAndPrivacyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-canvas">
      <div className="border-b border-ink/10 bg-[#183C32] px-5 py-14 text-white sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C6A36B]">
            Clear stays, clear information
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl leading-tight sm:text-5xl">
            Terms &amp; Conditions and Privacy Notice
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
            These documents explain the rules for using Staywell to book an
            apartment and how information connected with your visit is handled.
          </p>
          <p className="mt-5 text-xs text-white/65">
            Last updated: {POLICY_LAST_UPDATED}
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14 lg:px-12">
        <aside className="h-fit rounded-2xl border border-ink/10 bg-white p-5 lg:sticky lg:top-28">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-forest">
            On this page
          </h2>
          <nav aria-label="Policy sections" className="mt-4 grid gap-3 text-sm">
            <a
              className="text-forest underline-offset-4 hover:underline"
              href="#terms-and-conditions"
            >
              Terms &amp; Conditions
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#terms-bookings"
            >
              Bookings
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#terms-payments"
            >
              Prices and payments
            </a>
            <a className="pl-3 text-muted hover:text-ink" href="#terms-stay">
              Your stay
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#terms-cancellation"
            >
              Cancellation and refunds
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#terms-responsibility"
            >
              Responsibility and changes
            </a>
            <a
              className="text-forest underline-offset-4 hover:underline"
              href="#privacy-notice"
            >
              Privacy Notice
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#privacy-information"
            >
              Information and use
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#privacy-sharing"
            >
              Sharing and security
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#privacy-rights"
            >
              Retention and your choices
            </a>
            <a
              className="text-forest underline-offset-4 hover:underline"
              href="#cookie-policy"
            >
              Cookie Policy
            </a>
            <a
              className="pl-3 text-muted hover:text-ink"
              href="#cookie-categories"
            >
              Cookies in use
            </a>
          </nav>
        </aside>

        <article className="min-w-0 rounded-3xl border border-ink/10 bg-white px-5 py-2 shadow-sm sm:px-9 lg:px-12">
          <div id="terms-and-conditions" className="scroll-mt-28 pt-8 sm:pt-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A77D3D]">
              Document 1
            </p>
            <h2 className="mt-2 font-display text-3xl text-forest sm:text-4xl">
              Terms &amp; Conditions
            </h2>
            <p className="mt-2 text-xs text-muted">
              Policy version: {POLICY_VERSIONS.terms}
            </p>
            <p className="mt-4 text-sm leading-7 text-ink/75 sm:text-base sm:leading-8">
              These Terms apply when you use Staywell to view or reserve an
              apartment. By using the website you agree to the terms that apply
              to that use. Submitting a booking request requires you to actively
              accept these Terms and acknowledge the{' '}
              <a
                className="font-semibold text-forest underline"
                href="#privacy-notice"
              >
                Privacy Notice
              </a>
              .
            </p>
          </div>

          <Section id="terms-bookings" title="1. Making a booking">
            <p>
              Staywell lets customers browse published apartment information and
              request available dates. To make a booking, provide the requested
              name, email address, telephone number, stay dates, guest count,
              and any optional special requests. Keep your contact details
              accurate so Staywell can send booking and payment updates.
            </p>
            <p>
              A date selection or payment initiation is not a confirmed
              reservation. Your dates are held for the period shown during
              checkout. A booking is confirmed only after the backend verifies
              successful payment with Paystack and confirms that the reservation
              still holds the apartment dates. A frontend success screen alone
              is not confirmation.
            </p>
            <p>
              Apartment availability and property details can change. The
              booking confirmation is the record of the dates, guest count, and
              other reservation details accepted for your stay. Contact Staywell
              promptly if it appears incorrect.
            </p>
          </Section>

          <Section id="terms-payments" title="2. Prices and payments">
            <p>
              Apartment rates and any listed charges are shown in the booking
              flow. The final total is calculated by Staywell’s booking service
              and displayed before you proceed to payment. Do not rely on an
              amount that differs from the final checkout total.
            </p>
            <p>
              Paystack processes card and other supported payment methods.
              Staywell verifies the transaction with Paystack before confirming
              a booking. A pending payment, payment initiation, or browser
              redirect does not by itself confirm a reservation.
            </p>
            <p>
              If the amount, currency, or payment status looks wrong, keep the
              Paystack transaction reference and contact Staywell using a
              verified contact method supplied with your booking. Do not send
              full card details, PINs, passwords, or one-time codes.
            </p>
          </Section>

          <Section
            id="terms-stay"
            title="3. Check-in, check-out, and guest responsibilities"
          >
            <p>
              Follow the check-in and check-out dates and times in your booking
              confirmation and the apartment-specific information provided for
              your stay. The actual time may vary by apartment. Any request to
              change an arrival or departure arrangement must be agreed with
              Staywell or the property; the platform does not promise that a
              requested change can be made.
            </p>
            <p>
              Provide accurate information for everyone included in the guest
              count. Follow the apartment’s published house rules and safety
              instructions, treat the property and its contents with care, avoid
              damage, and respect neighbours and other occupants. Tell Staywell
              through an approved contact channel if you encounter a problem or
              safety concern.
            </p>
          </Section>

          <Section id="terms-cancellation" title="4. Cancellation and refunds">
            <p>
              You may submit an online cancellation request only when it is
              submitted at least 24 hours before the scheduled check-in date and
              time shown for your apartment. The deadline is calculated from
              that actual local check-in time. A request submitted exactly 24
              hours before check-in is eligible; a request submitted less than
              24 hours before check-in is not eligible for online cancellation.
            </p>
            <p>
              Opening the secure cancellation link does not cancel a booking.
              Review the booking and explicitly confirm the request. Staywell
              checks the booking, payment, and deadline again when you confirm.
              The request is accepted only when the backend confirms it.
            </p>
            <p>
              Booking cancellation and refund processing are separate. Staywell
              will send updates about the cancellation and refund. A refund is
              successful only after its outcome is verified through Paystack.
              The amount and any applicable deductions depend on the refund
              policy approved for the booking; these Terms do not create a
              refund percentage, fee, deduction, or processing-time promise.
            </p>
            <p className="rounded-xl border border-[#C6A36B]/40 bg-[#F6F1E8] p-4 text-sm">
              The owner must confirm and publish the approved refund amount
              policy for customer cancellations before this section is treated
              as final. The current system’s full-transaction refund behavior is
              still marked for owner approval.
            </p>
          </Section>

          <Section
            id="terms-responsibility"
            title="5. Changes, disputes, and service limitations"
          >
            <p>
              If you find an error in a reservation, need to ask about a change,
              or wish to dispute a payment or booking, contact Staywell using
              verified details included in your booking correspondence.
              Requested changes are subject to availability and agreement; no
              unsupported change service is promised here.
            </p>
            <p>
              Staywell works to keep listing and booking information useful and
              accurate, but information may occasionally be incomplete or out of
              date. The verified booking confirmation and apartment-specific
              arrangements should be used for your stay. Staywell may also
              experience interruptions caused by maintenance, network or
              provider outages, security events, or other circumstances outside
              its reasonable control. We will take reasonable steps to restore
              service and address affected bookings.
            </p>
            <p>
              Nothing in these Terms limits a right or responsibility that
              cannot lawfully be limited under applicable law. Staywell may
              update these Terms by publishing a new version here. The version
              you accept is recorded with your booking; a later version is not
              recorded as accepted by you unless you accept it.
            </p>
            <p>
              Staywell has not published verified public telephone, email, or
              postal contact details on this website. The owner must provide an
              approved customer support and dispute contact route before
              reservations are opened to the public.
            </p>
          </Section>

          <div
            id="privacy-notice"
            className="scroll-mt-28 border-t-2 border-[#C6A36B]/50 pt-10 sm:pt-12"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A77D3D]">
              Document 2
            </p>
            <h2 className="mt-2 font-display text-3xl text-forest sm:text-4xl">
              Privacy Notice
            </h2>
            <p className="mt-2 text-xs text-muted">
              Policy version: {POLICY_VERSIONS.privacy}
            </p>
            <p className="mt-4 text-sm leading-7 text-ink/75 sm:text-base sm:leading-8">
              This Notice describes information handled by the Staywell website
              and booking service. It is intended to reflect the current
              application and to be read with the Nigeria Data Protection Act
              2023 and other applicable law. It is not a claim of certification
              or legal approval.
            </p>
          </div>

          <Section
            id="privacy-information"
            title="1. Information we collect and why"
          >
            <p>
              When you request a booking, Staywell receives your name, email
              address, telephone number, apartment selection, check-in and
              check-out dates, guest count, and any special request you choose
              to provide. The service also creates a booking reference and
              stores reservation, price, payment status, Paystack transaction
              reference, and cancellation/refund status needed to manage the
              transaction.
            </p>
            <p>
              The browser temporarily uses session storage for protected booking
              access and payment idempotency tokens so the checkout and payment
              return can be matched to the booking. These are not used as
              advertising identifiers. The administrator area uses essential
              session and CSRF cookies for administrator sign-in and request
              protection. The application does not currently include an
              analytics or advertising tracking integration. Cookie choices are
              stored in local storage rather than a cookie.
            </p>
            <p>
              API operational logs may include request identifiers,
              route/method, response status, and technical connection
              information such as IP address. Sensitive request fields,
              credentials, and cancellation tokens are redacted. We use booking
              information to prepare and manage reservations, verify payments,
              send booking/cancellation/refund emails, prevent abuse, respond to
              messages sent through contact channels if provided, maintain
              transaction records, and operate and improve the service.
            </p>
            <p>
              Depending on the purpose, processing may be needed to take steps
              you request before a booking or perform the booking, meet legal
              obligations, protect the service and prevent abuse, or rely on
              consent where it is the appropriate legal basis. The owner should
              confirm and document the applicable legal basis for each purpose.
            </p>
          </Section>

          <Section id="cookie-policy" title="Cookie Policy">
            <p>
              A cookie is a small value stored by a website in your browser.
              Staywell also uses browser storage for checkout session tokens and
              your cookie choices; those values are not cookies and are not
              advertising identifiers. The full-screen settings panel lets you
              change optional category choices at any time using the Cookie
              Settings link in the footer.
            </p>
            <p>
              Your category choices are stored in this browser&apos;s local
              storage under a versioned consent record for up to 180 days. The
              record contains the preference categories and saved time, not your
              name, booking reference, or payment details. A policy version
              change or an expired/malformed record asks you to choose again.
              Strictly necessary cookies are always enabled; optional categories
              start disabled. Analytics and marketing scripts are not currently
              integrated, and no optional tracking requests are made before or
              after your choice.
            </p>
          </Section>

          <Section
            id="cookie-categories"
            title="Cookies and similar technologies in use"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-ink/10 bg-canvas p-4">
                <h3 className="font-semibold text-forest">
                  Strictly necessary
                </h3>
                <p className="mt-2 text-sm leading-6">
                  The Staywell API sets <code>admin_session</code> (HttpOnly)
                  and <code>admin_csrf</code> (readable by the admin page) for
                  administrator sign-in and CSRF protection. Both use the{' '}
                  <code>/api/v1/admin</code> path, SameSite Strict, Secure in
                  production, and an eight-hour maximum age. They are not used
                  for advertising. Customer booking does not set an
                  authentication cookie.
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-canvas p-4">
                <h3 className="font-semibold text-forest">Functional</h3>
                <p className="mt-2 text-sm leading-6">
                  No functional cookies are currently set. This category remains
                  off unless you choose it; Staywell does not currently have
                  optional cookie-based preferences to enable.
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-canvas p-4">
                <h3 className="font-semibold text-forest">Analytics</h3>
                <p className="mt-2 text-sm leading-6">
                  No analytics provider, analytics cookie, or analytics script
                  is integrated.
                </p>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-canvas p-4">
                <h3 className="font-semibold text-forest">Marketing</h3>
                <p className="mt-2 text-sm leading-6">
                  No advertising, marketing measurement, or cross-service
                  tracking provider is integrated.
                </p>
              </div>
            </div>
            <p>
              The cookie consent record itself is stored in browser local
              storage for 180 days, not in a cookie. Checkout access and
              idempotency tokens use session storage for the active booking
              session. Neither storage mechanism is shared with analytics or
              advertising services. If an optional provider is added later,
              Staywell must update this notice and ensure its scripts are gated
              by the corresponding saved preference before release.
            </p>
          </Section>

          <Section
            id="privacy-sharing"
            title="2. Payments, service providers, and security"
          >
            <p>
              Paystack processes payments. Staywell stores payment references,
              amounts, currency, verification results, and payment/refund status
              used to match provider events to a booking. The application does
              not request or store full card numbers, card security codes, PINs,
              or online banking passwords.
            </p>
            <p>
              Information is available to authorized Staywell administrators who
              need it to manage bookings and support operations. It may also be
              shared as needed with Paystack for payment processing; the
              configured email delivery provider (currently the API supports
              Resend) for transactional messages; Aiven PostgreSQL and the
              configured web/API hosting and infrastructure providers to run the
              service; and a configured S3-compatible storage provider for
              apartment images where enabled. Providers process information
              under their own applicable terms. Information may also be
              disclosed where required by law or a valid legal process.
            </p>
            <p>
              The service uses access controls, server-side payment
              verification, token hashing, request validation, and protected
              transport/configuration practices. These measures reduce risk but
              cannot guarantee that a system or transmission is completely
              secure.
            </p>
          </Section>

          <Section
            id="privacy-rights"
            title="3. Retention, your rights, and updates"
          >
            <p>
              Booking, payment, and related records may be retained for
              operational, accounting, legal, fraud-prevention, and
              dispute-resolution purposes. The platform has no automatic
              deletion schedule configured. Staywell should establish and
              publish a retention schedule appropriate to its legal obligations.
            </p>
            <p>
              Subject to identity checks, applicable law, and legitimate
              record-retention requirements, you may have rights to access and
              correct personal information, request deletion or restriction,
              object to certain processing, and receive a portable copy where
              applicable. You may withdraw consent where processing relies on
              consent. Requests should be sent using verified contact
              information in your booking correspondence. Some booking or
              transaction information may need to be retained even where
              deletion is requested. You may also have rights under the Nigeria
              Data Protection Act 2023, including the right to complain to the
              Nigeria Data Protection Commission. Read the{' '}
              <a
                className="font-semibold text-forest underline"
                href="https://ndpc.gov.ng/download/nigeria-data-protection-act-2023"
                target="_blank"
                rel="noreferrer"
              >
                Nigeria Data Protection Act 2023
              </a>
              .
            </p>
            <p>
              This Notice may be updated as the service changes or legal
              requirements develop. The current version and update date will be
              published on this page. A change does not rewrite the policy
              version recorded as accepted with an earlier booking.
            </p>
            <p className="rounded-xl border border-[#C6A36B]/40 bg-[#F6F1E8] p-4 text-sm">
              Staywell has not published a verified privacy contact on this
              website. The owner must identify an approved contact route for
              privacy requests and publish the applicable data-retention
              approach, the legal entity responsible for Staywell, and
              information about any cross-border processing and safeguards
              before treating this Notice as final.
            </p>
          </Section>

          <div className="flex flex-col gap-4 border-t border-ink/10 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">
              Questions about a booking? Check the contact details included in
              your booking correspondence.
            </p>
            <Link
              href="/"
              className="w-fit rounded-full bg-forest px-5 py-3 font-semibold text-white hover:bg-[#102B24]"
            >
              Return to Staywell
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}
