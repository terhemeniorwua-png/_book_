import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import { logger } from '../logger.js';
import {
  AdminAccount,
  Apartment,
  ApartmentImage,
  Booking,
  BookingCancellation,
  BookingRefund,
  EmailNotification,
  Guest,
  PaymentTransaction,
} from '../db/models/index.js';
import { renderBookingConfirmationEmail } from './email-templates.js';
import { deliverEmail } from './email-provider.js';
import {
  formatScheduledDateTimeWithZone,
  formatScheduledTimeWithZone,
  resolveCancellationSchedule,
  type CancellationSchedule,
} from './cancellation-policy.js';

type Row = Record<string, unknown>;
type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
type BookingEmailContext = {
  bookingId: string;
  bookingReference: string;
  guestName: string;
  guestEmail: string;
  apartmentName: string;
  apartmentLocation: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  specialRequests: string | null;
  amountPaid: string;
  currency: string;
  schedule: CancellationSchedule;
  apartmentSummary?: string;
  apartmentCoverImageUrl?: string | null;
  checkOutTime?: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function appBaseUrl() {
  return (env.CUSTOMER_APP_URL ?? env.CORS_ORIGIN_LIST[0] ?? '').replace(
    /\/$/,
    '',
  );
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function displayMoney(value: string | number, currency: string) {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;padding:0;background:#f6f1e8;color:#292c29;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1e8;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden">
          <tr><td style="background:#183c32;padding:22px 28px;color:#ffffff">
            <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8d7b5">Staywell</div>
            <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25">${escapeHtml(title)}</h1>
          </td></tr>
          <tr><td style="padding:26px 28px">${body}</td></tr>
          <tr><td style="padding:18px 28px;background:#f6f1e8;color:#686f69;font-size:12px;line-height:1.6">
            Staywell apartment stays. This message was sent about your booking. If you were not expecting it, contact Staywell support.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function summaryTable(context: BookingEmailContext) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:7px 0;color:#686f69">Booking reference</td><td style="padding:7px 0;font-weight:bold;text-align:right">${escapeHtml(context.bookingReference)}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Apartment</td><td style="padding:7px 0;font-weight:bold;text-align:right">${escapeHtml(context.apartmentName)}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Location</td><td style="padding:7px 0;text-align:right">${escapeHtml(context.apartmentLocation)}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Check-in</td><td style="padding:7px 0;text-align:right">${escapeHtml(displayDate(context.checkIn))} at ${escapeHtml(formatScheduledTimeWithZone(context.schedule.checkInAt, context.schedule.timeZone))}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Check-out</td><td style="padding:7px 0;text-align:right">${escapeHtml(displayDate(context.checkOut))}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Guests / nights</td><td style="padding:7px 0;text-align:right">${context.guestCount} ${context.guestCount === 1 ? 'guest' : 'guests'} · ${context.nights} ${context.nights === 1 ? 'night' : 'nights'}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Amount paid</td><td style="padding:7px 0;font-weight:bold;text-align:right">${escapeHtml(displayMoney(context.amountPaid, context.currency))}</td></tr>
  </table>`;
}

function refundTable(refund: Row, originalReference: string) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:7px 0;color:#686f69">Refund amount</td><td style="padding:7px 0;font-weight:bold;text-align:right">${escapeHtml(displayMoney(String(refund.amount), String(refund.currency)))}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Original payment reference</td><td style="padding:7px 0;text-align:right">${escapeHtml(originalReference)}</td></tr>
    <tr><td style="padding:7px 0;color:#686f69">Refund reference</td><td style="padding:7px 0;text-align:right">${escapeHtml(String(refund.providerRefundId ?? refund.providerReference ?? 'Processing'))}</td></tr>
  </table>`;
}

async function sendAndRecord(
  type: string,
  recipient: string,
  message: EmailMessage,
  bookingId: string | null,
  cancellationId: string | null = null,
) {
  if (!recipient) return;
  const deduplicationKey = createHash('sha256')
    .update(
      `${type}:${bookingId ?? ''}:${cancellationId ?? ''}:${recipient.toLowerCase()}`,
    )
    .digest('hex');
  const [candidate] = await EmailNotification.findOrCreate({
    where: { deduplicationKey },
    defaults: {
      bookingId,
      cancellationId,
      deduplicationKey,
      type,
      recipient,
      status: 'queued',
      attempts: 0,
    },
  });
  const record = await sequelize.transaction(async (transaction) => {
    const locked = await EmailNotification.findByPk(
      String(candidate.get('id')),
      {
        transaction,
        lock: transaction.LOCK.UPDATE,
      },
    );
    if (!locked) return null;
    const value = locked.get({ plain: true }) as Row;
    const sendingIsStale =
      value.status === 'sending' &&
      Date.parse(String(value.updatedAt)) < Date.now() - 5 * 60_000;
    if (
      value.status === 'sent' ||
      (value.status === 'sending' && !sendingIsStale)
    )
      return null;
    await locked.update(
      {
        status: 'sending',
        attempts: Number(value.attempts) + 1,
      },
      { transaction },
    );
    return locked;
  });
  if (!record) return;

  logger.info(
    {
      event: 'email_dispatch_attempted',
      notificationId: record.get('id'),
      type,
    },
    'Email dispatch attempted',
  );
  const delivery = await deliverEmail({
    ...message,
    idempotencyKey: deduplicationKey,
  });
  await record.update({
    status: delivery.accepted
      ? 'sent'
      : delivery.retryable
        ? 'queued'
        : 'failed',
    lastError: delivery.errorCode,
    sentAt: delivery.accepted ? new Date() : null,
    providerMessageId: delivery.providerMessageId,
    attempts:
      Number(record.get('attempts')) + Math.max(0, delivery.attempts - 1),
  });
  if (delivery.accepted) {
    logger.info(
      {
        event: 'email_provider_accepted',
        notificationId: record.get('id'),
        type,
        providerStatus: delivery.providerStatus,
        providerMessageId: delivery.providerMessageId,
        attempts: delivery.attempts,
      },
      'Email provider accepted message',
    );
  } else {
    logger.warn(
      {
        event: 'email_provider_rejected_or_unavailable',
        notificationId: record.get('id'),
        type,
        errorCode: delivery.errorCode,
        providerStatus: delivery.providerStatus,
        retryable: delivery.retryable,
        attempts: delivery.attempts,
      },
      'Email provider did not accept message',
    );
  }
}

async function activeAdministratorEmails() {
  const admins = await AdminAccount.findAll({
    where: { isActive: true },
    attributes: ['email'],
  });
  return [
    ...new Set(
      admins
        .map((admin) =>
          String(admin.get('email') ?? '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

async function sendToAdministrators(input: {
  type: string;
  subject: string;
  title: string;
  body: string;
  text: string;
  bookingId: string;
  cancellationId: string | null;
}) {
  const recipients = await activeAdministratorEmails();
  await Promise.all(
    recipients.map((recipient) =>
      sendAndRecord(
        input.type,
        recipient,
        {
          to: recipient,
          subject: input.subject,
          html: layout(input.title, input.body),
          text: input.text,
        },
        input.bookingId,
        input.cancellationId,
      ),
    ),
  );
}

async function loadBookingContext(
  bookingId: string,
): Promise<BookingEmailContext | null> {
  const booking = (await Booking.findByPk(bookingId, {
    include: [
      { model: Guest, as: 'guest' },
      {
        model: Apartment,
        as: 'apartment',
        include: [
          {
            model: ApartmentImage,
            as: 'images',
            where: { isPublished: true },
            required: false,
            attributes: ['objectKey', 'isCover', 'position'],
            separate: true,
            order: [
              ['isCover', 'DESC'],
              ['position', 'ASC'],
            ],
          },
        ],
      },
    ],
  })) as
    | (import('sequelize').Model & {
        get: (options: { plain: true }) => Row;
      })
    | null;
  if (!booking) return null;
  const value = booking.get({ plain: true });
  const guest = (value.guest ?? {}) as Row;
  const apartment = (value.apartment ?? {}) as Row;
  if (
    !guest.email ||
    !apartment.name ||
    value.status !== 'confirmed' ||
    value.paymentStatus !== 'paid'
  )
    return null;
  const payment = await PaymentTransaction.findOne({
    where: {
      bookingId,
      provider: 'paystack',
      status: 'succeeded',
      verifiedAt: { [Op.ne]: null },
    },
    order: [['createdAt', 'DESC']],
  });
  const paymentValue = payment?.get({ plain: true }) as Row | undefined;
  if (!paymentValue) return null;
  const snapshot =
    value.acceptedPolicySnapshot &&
    typeof value.acceptedPolicySnapshot === 'object'
      ? (value.acceptedPolicySnapshot as Row)
      : {};
  const apartmentImages = (apartment.images ?? []) as Row[];
  const coverImage =
    apartmentImages.find((image) => image.isCover) ?? apartmentImages[0];
  const objectKey = String(coverImage?.objectKey ?? '');
  return {
    bookingId,
    bookingReference: String(value.bookingReference),
    guestName:
      `${String(guest.firstName ?? '')} ${String(guest.lastName ?? '')}`.trim(),
    guestEmail: String(guest.email),
    apartmentName: String(apartment.name),
    apartmentLocation: String(apartment.displayLocation ?? ''),
    checkIn: String(value.checkIn),
    checkOut: String(value.checkOut),
    nights: Number(value.nights),
    guestCount: Number(value.guestCount),
    specialRequests:
      typeof value.specialRequests === 'string' ? value.specialRequests : null,
    amountPaid: String(paymentValue?.expectedAmount ?? value.totalAmount),
    currency: String(paymentValue?.currency ?? value.currency),
    schedule: resolveCancellationSchedule(
      {
        checkIn: String(value.checkIn),
        acceptedPolicySnapshot: value.acceptedPolicySnapshot,
      },
      {
        timezone: apartment.timezone as string | null | undefined,
        checkInTime: apartment.checkInTime as string | null | undefined,
      },
    ),
    apartmentSummary: String(apartment.shortDescription ?? ''),
    apartmentCoverImageUrl: objectKey.startsWith('https://images.unsplash.com/')
      ? objectKey
      : null,
    checkOutTime:
      typeof snapshot.checkOutTime === 'string'
        ? snapshot.checkOutTime
        : typeof apartment.checkOutTime === 'string'
          ? apartment.checkOutTime.slice(0, 5)
          : null,
  };
}

async function sendBookingConfirmation(
  bookingId: string,
  cancellationToken: string,
) {
  const context = await loadBookingContext(bookingId);
  if (!context) return;
  const link = `${appBaseUrl()}/booking/cancel#token=${encodeURIComponent(cancellationToken)}`;
  const deadline = formatScheduledDateTimeWithZone(
    context.schedule.deadlineAt,
    context.schedule.timeZone,
  );
  const template = renderBookingConfirmationEmail({
    customerName: context.guestName,
    bookingReference: context.bookingReference,
    apartmentName: context.apartmentName,
    apartmentLocation: context.apartmentLocation,
    apartmentSummary: context.apartmentSummary ?? '',
    apartmentCoverImageUrl: context.apartmentCoverImageUrl ?? null,
    checkInDate: context.checkIn,
    checkInTime: formatScheduledTimeWithZone(
      context.schedule.checkInAt,
      context.schedule.timeZone,
    ),
    checkOutDate: context.checkOut,
    checkOutTime: context.checkOutTime ?? null,
    guestCount: context.guestCount,
    amountPaid: context.amountPaid,
    currency: context.currency,
    cancellationDeadline: deadline,
    cancellationUrl: link,
    termsUrl: `${appBaseUrl()}/terms-and-privacy#terms-and-conditions`,
    privacyUrl: `${appBaseUrl()}/terms-and-privacy#privacy-notice`,
    cookieUrl: `${appBaseUrl()}/terms-and-privacy#cookie-policy`,
    supportEmail: env.SUPPORT_EMAIL_ADDRESS ?? null,
  });
  await sendAndRecord(
    'booking_confirmed',
    context.guestEmail,
    {
      to: context.guestEmail,
      ...template,
    },
    context.bookingId,
  );
}

export async function sendBookingConfirmationEmail(
  bookingId: string,
  cancellationToken: string,
) {
  try {
    await sendBookingConfirmation(bookingId, cancellationToken);
  } catch (error) {
    logger.error(
      {
        event: 'booking_confirmation_dispatch_failed',
        bookingId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode:
          error && typeof error === 'object' && 'name' in error
            ? String(error.name)
            : 'UNKNOWN',
      },
      'Booking confirmation dispatch failed before provider acceptance',
    );
  }
}

async function loadCancellationContext(cancellationId: string) {
  const cancellation = (await BookingCancellation.findByPk(cancellationId, {
    include: [
      {
        model: Booking,
        as: 'booking',
        include: [
          { model: Guest, as: 'guest' },
          { model: Apartment, as: 'apartment' },
        ],
      },
      { model: BookingRefund, as: 'refund' },
    ],
  })) as
    | (import('sequelize').Model & {
        get: (options: { plain: true }) => Row;
      })
    | null;
  if (!cancellation) return null;
  const value = cancellation.get({ plain: true });
  const booking = (value.booking ?? {}) as Row;
  const guest = (booking.guest ?? {}) as Row;
  const apartment = (booking.apartment ?? {}) as Row;
  if (!guest.email || !apartment.name) return null;
  const context: BookingEmailContext = {
    bookingId: String(booking.id),
    bookingReference: String(booking.bookingReference),
    guestName:
      `${String(guest.firstName ?? '')} ${String(guest.lastName ?? '')}`.trim(),
    guestEmail: String(guest.email),
    apartmentName: String(apartment.name),
    apartmentLocation: String(apartment.displayLocation ?? ''),
    checkIn: String(booking.checkIn),
    checkOut: String(booking.checkOut),
    nights: Number(booking.nights),
    guestCount: Number(booking.guestCount),
    specialRequests:
      typeof booking.specialRequests === 'string'
        ? booking.specialRequests
        : null,
    amountPaid: String(booking.totalAmount),
    currency: String(booking.currency),
    schedule: resolveCancellationSchedule(
      {
        checkIn: String(booking.checkIn),
        acceptedPolicySnapshot: booking.acceptedPolicySnapshot,
      },
      {
        timezone: apartment.timezone as string | null | undefined,
        checkInTime: apartment.checkInTime as string | null | undefined,
      },
    ),
  };
  return {
    context,
    cancellationId,
    refund: (value.refund ?? {}) as Row,
  };
}

export async function sendCancellationReceivedEmail(cancellationId: string) {
  try {
    const loaded = await loadCancellationContext(cancellationId);
    if (!loaded) return;
    const { context } = loaded;
    const subject = 'Staywell — Your Cancellation Request Has Been Received';
    const body = `<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(context.guestName)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7">We have received your request to unbook <strong>${escapeHtml(context.apartmentName)}</strong>. Your refund is being processed or reviewed by our team.</p>
      ${summaryTable(context)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">You will receive another email when the cancellation is complete and a further update when Paystack confirms the refund outcome. Please do not submit another cancellation request.</p>`;
    await sendAndRecord(
      'cancellation_requested',
      context.guestEmail,
      {
        to: context.guestEmail,
        subject,
        html: layout('Unbooking request received', body),
        text: [
          `Hello ${context.guestName},`,
          `We received your request to unbook ${context.apartmentName} (${context.bookingReference}).`,
          'Your refund is being processed or reviewed. We will send another email when the cancellation is complete and when the refund outcome is confirmed.',
        ].join('\n\n'),
      },
      context.bookingId,
      cancellationId,
    );
  } catch {
    // Do not leak notification or token details through logs.
  }
}

export async function sendCancellationCompletedEmail(cancellationId: string) {
  try {
    const loaded = await loadCancellationContext(cancellationId);
    if (!loaded) return;
    const { context } = loaded;
    const subject = 'Staywell — Your Apartment Booking Has Been Cancelled';
    const body = `<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(context.guestName)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7">Your booking for <strong>${escapeHtml(context.apartmentName)}</strong> has been successfully cancelled. The dates are no longer reserved for you.</p>
      ${summaryTable(context)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">The refund is a separate step. We will send a final email when Paystack confirms whether the refund succeeded.</p>`;
    await sendAndRecord(
      'cancellation_completed',
      context.guestEmail,
      {
        to: context.guestEmail,
        subject,
        html: layout('Booking cancelled', body),
        text: [
          `Hello ${context.guestName},`,
          `Your booking ${context.bookingReference} for ${context.apartmentName} has been cancelled.`,
          'The refund is a separate step; we will email you when Paystack confirms the outcome.',
        ].join('\n\n'),
      },
      context.bookingId,
      cancellationId,
    );
  } catch {
    // Do not leak notification or token details through logs.
  }
}

async function loadRefundContext(refundId: string) {
  const refund = (await BookingRefund.findByPk(refundId, {
    include: [
      {
        model: Booking,
        as: 'booking',
        include: [
          { model: Guest, as: 'guest' },
          { model: Apartment, as: 'apartment' },
        ],
      },
      { model: BookingCancellation, as: 'cancellation' },
      { model: PaymentTransaction, as: 'payment' },
    ],
  })) as
    | (import('sequelize').Model & {
        get: (options: { plain: true }) => Row;
      })
    | null;
  if (!refund) return null;
  const value = refund.get({ plain: true });
  const booking = (value.booking ?? {}) as Row;
  const guest = (booking.guest ?? {}) as Row;
  const apartment = (booking.apartment ?? {}) as Row;
  const cancellation = (value.cancellation ?? {}) as Row;
  if (!guest.email || !apartment.name) return null;
  const context: BookingEmailContext = {
    bookingId: String(booking.id),
    bookingReference: String(booking.bookingReference),
    guestName:
      `${String(guest.firstName ?? '')} ${String(guest.lastName ?? '')}`.trim(),
    guestEmail: String(guest.email),
    apartmentName: String(apartment.name),
    apartmentLocation: String(apartment.displayLocation ?? ''),
    checkIn: String(booking.checkIn),
    checkOut: String(booking.checkOut),
    nights: Number(booking.nights),
    guestCount: Number(booking.guestCount),
    specialRequests:
      typeof booking.specialRequests === 'string'
        ? booking.specialRequests
        : null,
    amountPaid: String(booking.totalAmount),
    currency: String(booking.currency),
    schedule: resolveCancellationSchedule(
      {
        checkIn: String(booking.checkIn),
        acceptedPolicySnapshot: booking.acceptedPolicySnapshot,
      },
      {
        timezone: apartment.timezone as string | null | undefined,
        checkInTime: apartment.checkInTime as string | null | undefined,
      },
    ),
  };
  return {
    context,
    refund: value,
    originalReference: String(value.providerReference),
    cancellationId: String(cancellation.id ?? ''),
  };
}

export async function sendRefundSuccessfulEmail(refundId: string) {
  try {
    const loaded = await loadRefundContext(refundId);
    if (!loaded) return;
    const { context } = loaded;
    const subject = 'Staywell — Your Refund Has Been Processed';
    const body = `<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(context.guestName)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7">Paystack has confirmed your refund for the cancelled booking at <strong>${escapeHtml(context.apartmentName)}</strong>.</p>
      ${refundTable(loaded.refund, loaded.originalReference)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">Depending on your bank or card provider, the refund may take additional business days to appear on your statement.</p>`;
    await sendAndRecord(
      'refund_successful',
      context.guestEmail,
      {
        to: context.guestEmail,
        subject,
        html: layout('Refund processed', body),
        text: [
          `Hello ${context.guestName},`,
          `Paystack confirmed your refund of ${displayMoney(String(loaded.refund.amount), String(loaded.refund.currency))} for booking ${context.bookingReference}.`,
          `Original payment reference: ${loaded.originalReference}`,
          `Refund reference: ${String(loaded.refund.providerRefundId ?? loaded.refund.providerReference ?? 'Processing')}`,
        ].join('\n\n'),
      },
      context.bookingId,
      loaded.cancellationId || null,
    );
  } catch {
    // Do not leak provider or notification details through logs.
  }
}

export async function sendRefundFailedEmail(refundId: string) {
  try {
    const loaded = await loadRefundContext(refundId);
    if (!loaded) return;
    const { context } = loaded;
    const subject = 'Staywell — Update on Your Booking Refund';
    const body = `<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(context.guestName)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7">Your booking for <strong>${escapeHtml(context.apartmentName)}</strong> is cancelled, but the refund is experiencing a problem. Staywell is addressing it.</p>
      ${refundTable(loaded.refund, loaded.originalReference)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">Our team will investigate the refund with Paystack and update you. You do not need to submit another cancellation request, and no new payment will be taken.</p>`;
    await sendAndRecord(
      'refund_failed',
      context.guestEmail,
      {
        to: context.guestEmail,
        subject,
        html: layout('Refund needs attention', body),
        text: [
          `Hello ${context.guestName},`,
          `Your booking ${context.bookingReference} is cancelled, but the refund is experiencing a problem. Staywell is addressing it.`,
          'Our team will investigate with Paystack and update you. No new payment will be taken.',
        ].join('\n\n'),
      },
      context.bookingId,
      loaded.cancellationId || null,
    );
  } catch {
    // Do not leak provider or notification details through logs.
  }
}

export async function sendRefundDelayedEmail(refundId: string) {
  try {
    const loaded = await loadRefundContext(refundId);
    if (!loaded) return;
    const { context } = loaded;
    const subject = 'Staywell — Update on Your Booking Refund';
    const body = `<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(context.guestName)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.7">Paystack is still processing the refund for your cancelled booking at <strong>${escapeHtml(context.apartmentName)}</strong>. Staywell is monitoring the update and will let you know when Paystack confirms the outcome.</p>
      ${refundTable(loaded.refund, loaded.originalReference)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">Your apartment booking remains cancelled. You do not need to submit another cancellation request.</p>`;
    await sendAndRecord(
      'refund_delayed',
      context.guestEmail,
      {
        to: context.guestEmail,
        subject,
        html: layout('Update on your booking refund', body),
        text: [
          `Hello ${context.guestName},`,
          `Paystack is still processing the refund for your cancelled booking ${context.bookingReference}. Staywell is monitoring the update.`,
          `Original payment reference: ${loaded.originalReference}`,
          'Your apartment booking remains cancelled. We will email you when Paystack confirms the outcome.',
        ].join('\n\n'),
      },
      context.bookingId,
      loaded.cancellationId || null,
    );
  } catch {
    // Do not leak provider or notification details through logs.
  }
}

export async function sendAdminCancellationReceivedEmail(
  cancellationId: string,
) {
  try {
    const loaded = await loadCancellationContext(cancellationId);
    if (!loaded) return;
    const { context } = loaded;
    const subject = `Cancellation requested — ${context.bookingReference}`;
    const body = `<p style="margin:0 0 12px;font-size:15px;line-height:1.7">A customer submitted an unbooking request. The booking is cancelled, its dates have been released, and the refund is tracked separately.</p>
      ${summaryTable(context)}
      <p style="margin:0 0 6px;font-size:14px"><strong>Guest email:</strong> ${escapeHtml(context.guestEmail)}</p>
      ${context.specialRequests ? `<p style="margin:0 0 6px;font-size:14px"><strong>Special requests:</strong> ${escapeHtml(context.specialRequests)}</p>` : ''}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">Review the cancellation, payment reference, and refund status in the administrator dashboard.</p>`;
    await sendToAdministrators({
      type: 'admin_cancellation_requested',
      subject,
      title: 'Cancellation requested',
      body,
      text: [
        `A customer submitted an unbooking request for ${context.bookingReference}.`,
        `Apartment: ${context.apartmentName}`,
        `Guest: ${context.guestName} (${context.guestEmail})`,
        `Check-in: ${context.checkIn}`,
        `Check-out: ${context.checkOut}`,
        'The booking is cancelled and the refund is tracked separately. Review it in the administrator dashboard.',
      ].join('\n\n'),
      bookingId: context.bookingId,
      cancellationId,
    });
  } catch {
    // Do not leak customer or notification details through logs.
  }
}

export async function sendAdminRefundOutcomeEmail(
  refundId: string,
  outcome: 'successful' | 'failed',
) {
  try {
    const loaded = await loadRefundContext(refundId);
    if (!loaded) return;
    const { context } = loaded;
    const successful = outcome === 'successful';
    const subject = successful
      ? `Refund processed — ${context.bookingReference}`
      : `Refund failed — ${context.bookingReference}`;
    const title = successful ? 'Refund processed' : 'Refund needs attention';
    const statusText = successful
      ? 'Paystack confirmed that the refund was processed.'
      : 'Paystack reported that the refund failed. The booking remains cancelled and the payment requires manual review.';
    const body = `<p style="margin:0 0 12px;font-size:15px;line-height:1.7">${statusText}</p>
      ${summaryTable(context)}
      ${refundTable(loaded.refund, loaded.originalReference)}
      <p style="margin:0;font-size:13px;line-height:1.7;color:#686f69">The booking status and the refund status are tracked separately. Review the refund reference and failure details in the administrator dashboard.</p>`;
    await sendToAdministrators({
      type: successful ? 'admin_refund_successful' : 'admin_refund_failed',
      subject,
      title,
      body,
      text: [
        `${statusText} (${context.bookingReference})`,
        `Refund amount: ${displayMoney(String(loaded.refund.amount), String(loaded.refund.currency))}`,
        `Original payment reference: ${loaded.originalReference}`,
        `Refund reference: ${String(loaded.refund.providerRefundId ?? loaded.refund.providerReference ?? 'Processing')}`,
        'The booking and refund statuses are tracked separately. Review the administrator dashboard.',
      ].join('\n\n'),
      bookingId: context.bookingId,
      cancellationId: loaded.cancellationId || null,
    });
  } catch {
    // Do not leak provider or notification details through logs.
  }
}
