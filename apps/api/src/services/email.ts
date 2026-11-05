import { Op } from 'sequelize';
import { env } from '../config/env.js';
import {
  AdminAccount,
  Apartment,
  Booking,
  BookingCancellation,
  BookingRefund,
  EmailNotification,
  Guest,
  PaymentTransaction,
} from '../db/models/index.js';
import {
  formatScheduledDateTime,
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
type DeliveryResult = {
  delivered: boolean;
  retryable: boolean;
  errorCode: string | null;
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
    <tr><td style="padding:7px 0;color:#686f69">Check-in</td><td style="padding:7px 0;text-align:right">${escapeHtml(displayDate(context.checkIn))} at ${escapeHtml(formatScheduledDateTime(context.schedule.checkInAt, context.schedule.timeZone, { dateStyle: undefined, timeStyle: 'short' }))}</td></tr>
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

export async function deliverEmail(
  message: EmailMessage,
): Promise<DeliveryResult> {
  if (!env.EMAIL_PROVIDER_API_KEY || !env.EMAIL_FROM_ADDRESS)
    return {
      delivered: false,
      retryable: true,
      errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    };
  try {
    const response = await fetch(env.EMAIL_PROVIDER_API_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM_ADDRESS,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (response.ok)
      return { delivered: true, retryable: false, errorCode: null };
    return {
      delivered: false,
      retryable: response.status >= 500 || response.status === 429,
      errorCode:
        response.status >= 500 || response.status === 429
          ? 'EMAIL_PROVIDER_UNAVAILABLE'
          : 'EMAIL_PROVIDER_REJECTED',
    };
  } catch {
    return {
      delivered: false,
      retryable: true,
      errorCode: 'EMAIL_PROVIDER_UNAVAILABLE',
    };
  }
}

async function sendAndRecord(
  type: string,
  recipient: string,
  message: EmailMessage,
  bookingId: string | null,
  cancellationId: string | null = null,
) {
  if (!recipient) return;
  const record = await EmailNotification.create({
    bookingId,
    cancellationId,
    type,
    recipient,
    status: 'queued',
    attempts: 0,
  });
  const delivery = await deliverEmail(message);
  await record.update({
    status: delivery.delivered
      ? 'sent'
      : delivery.retryable
        ? 'queued'
        : 'failed',
    attempts: 1,
    lastError: delivery.errorCode,
    sentAt: delivery.delivered ? new Date() : null,
  });
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
      { model: Apartment, as: 'apartment' },
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
  if (!guest.email || !apartment.name) return null;
  const payment = await PaymentTransaction.findOne({
    where: {
      bookingId,
      provider: 'paystack',
      status: { [Op.in]: ['succeeded', 'refund_pending', 'refunded'] },
      verifiedAt: { [Op.ne]: null },
    },
    order: [['createdAt', 'DESC']],
  });
  const paymentValue = payment?.get({ plain: true }) as Row | undefined;
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
  };
}

async function sendBookingConfirmation(
  bookingId: string,
  cancellationToken: string,
) {
  const context = await loadBookingContext(bookingId);
  if (!context) return;
  const link = `${appBaseUrl()}/booking/cancel#token=${encodeURIComponent(cancellationToken)}`;
  const deadline = formatScheduledDateTime(
    context.schedule.deadlineAt,
    context.schedule.timeZone,
  );
  const subject = `Your Staywell booking is confirmed — ${context.bookingReference}`;
  const body = `<p style="margin:0 0 12px;font-size:16px">Hello ${escapeHtml(context.guestName)},</p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7">Your apartment booking is confirmed. We are looking forward to your stay.</p>
    ${summaryTable(context)}
    <div style="margin:20px 0;padding:16px;border-radius:12px;background:#f6f1e8">
      <p style="margin:0 0 6px;font-size:13px;color:#686f69">Cancellation deadline</p>
      <p style="margin:0;font-size:16px;font-weight:bold">${escapeHtml(deadline)}</p>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#686f69">You may submit a cancellation request until this time, which is at least 24 hours before your scheduled check-in. Opening the link below does not cancel your booking.</p>
    </div>
    ${context.specialRequests ? `<p style="margin:0 0 16px;font-size:14px"><strong>Special requests:</strong> ${escapeHtml(context.specialRequests)}</p>` : ''}
    <p style="margin:20px 0 10px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#183c32;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:bold">Unbook Apartment</a></p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#686f69">The button opens a secure page where you must review the booking and explicitly confirm the cancellation. If the cancellation deadline has passed, the page will explain that the booking can no longer be cancelled online.</p>`;
  await sendAndRecord(
    'booking_confirmed',
    context.guestEmail,
    {
      to: context.guestEmail,
      subject,
      html: layout('Your stay is confirmed', body),
      text: [
        `Hello ${context.guestName},`,
        `Your booking ${context.bookingReference} for ${context.apartmentName} is confirmed.`,
        `Check-in: ${displayDate(context.checkIn)} at ${formatScheduledDateTime(context.schedule.checkInAt, context.schedule.timeZone, { dateStyle: undefined, timeStyle: 'short' })}`,
        `Check-out: ${displayDate(context.checkOut)}`,
        `Amount paid: ${displayMoney(context.amountPaid, context.currency)}`,
        `Cancellation deadline: ${deadline}`,
        `Unbook Apartment: ${link}`,
        'Opening the link does not cancel your booking; you must confirm on the secure page.',
      ].join('\n\n'),
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
  } catch {
    // Cancellation links and notification bodies must never be written to logs.
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
    const subject = `We received your unbooking request — ${context.bookingReference}`;
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
    const subject = `Your Staywell booking has been cancelled — ${context.bookingReference}`;
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
    const subject = `Your Staywell refund has been processed — ${context.bookingReference}`;
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
    const subject = `Update on your Staywell refund — ${context.bookingReference}`;
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
