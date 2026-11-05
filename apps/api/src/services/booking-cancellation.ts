import Joi from 'joi';
import { Op, type Transaction } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import {
  AdminAuditEvent,
  Apartment,
  Booking,
  BookingCancellation,
  BookingCancellationToken,
  BookingRefund,
  Guest,
  PaymentTransaction,
} from '../db/models/index.js';
import {
  formatScheduledDateTime,
  resolveCancellationSchedule,
  type CancellationSchedule,
} from './cancellation-policy.js';
import {
  CANCELLATION_TOKEN_PURPOSE,
  hashCancellationToken,
  isValidCancellationTokenShape,
} from './cancellation-tokens.js';
import {
  sendAdminCancellationReceivedEmail,
  sendAdminRefundOutcomeEmail,
  sendCancellationCompletedEmail,
  sendCancellationReceivedEmail,
  sendRefundFailedEmail,
  sendRefundSuccessfulEmail,
} from './email.js';
import {
  createPaystackClient,
  PaymentError,
  type ProviderClient,
} from './paystack.js';
import {
  mapProviderRefundStatus,
  sanitizeRefundMetadata,
  updateRefundWithinTransaction,
  type RefundStatus,
} from './refund-processing.js';

type Row = Record<string, unknown>;
export const CANCELLATION_REFUND_POLICY = 'full_transaction_amount';

export class CancellationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CancellationError';
  }
}

export const cancellationTokenSchema = Joi.object({
  token: Joi.string()
    .pattern(/^[A-Za-z0-9_-]{43}$/)
    .required(),
}).unknown(false);

export const refundListQuerySchema = Joi.object({
  status: Joi.string().valid(
    'not_applicable',
    'pending',
    'processing',
    'successful',
    'failed',
  ),
  page: Joi.number().integer().min(1).max(100_000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
}).unknown(false);

export const refundIdParamsSchema = Joi.object({
  refundId: Joi.string().uuid().required(),
}).unknown(false);

export const refundRetrySchema = Joi.object({
  reason: Joi.string().trim().min(8).max(500).required(),
}).unknown(false);

export function readCancellationTokenHeader(value: string | undefined) {
  if (!isValidCancellationTokenShape(value))
    throw new CancellationError(
      400,
      'INVALID_CANCELLATION_TOKEN',
      'The cancellation link is invalid.',
    );
  return value;
}

function plain(model: import('sequelize').Model) {
  return model.get({ plain: true }) as Row;
}

function dateTime(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : typeof value === 'string'
      ? value
      : null;
}

function scheduleFor(booking: Row, apartment: Row) {
  return resolveCancellationSchedule(
    {
      checkIn: String(booking.checkIn),
      acceptedPolicySnapshot: booking.acceptedPolicySnapshot,
    },
    {
      timezone: apartment.timezone as string | null | undefined,
      checkInTime: apartment.checkInTime as string | null | undefined,
    },
  );
}

async function findPaymentForBooking(
  bookingId: string,
  transaction?: Transaction,
) {
  return PaymentTransaction.findOne({
    where: {
      bookingId,
      provider: 'paystack',
      status: {
        [Op.in]: ['succeeded', 'refund_pending', 'refunded', 'needs_review'],
      },
      verifiedAt: { [Op.ne]: null },
    },
    order: [['createdAt', 'DESC']],
    ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
  });
}

function ineligibilityMessage(reason: string | null) {
  if (reason === 'ALREADY_CANCELLED')
    return 'This booking has already been cancelled.';
  if (reason === 'CANCELLATION_DEADLINE_PASSED')
    return 'The cancellation deadline has passed. This booking can no longer be cancelled online.';
  if (reason === 'CHECK_IN_STARTED')
    return 'The scheduled check-in time has passed, so this booking can no longer be cancelled online.';
  if (reason === 'CANCELLATION_IN_PROGRESS')
    return 'A cancellation request for this booking is already being processed.';
  return 'This booking is not eligible for online cancellation. Please contact Staywell support.';
}

function requestItem(input: {
  booking: Row;
  guest: Row;
  apartment: Row;
  payment?: Row;
  schedule: CancellationSchedule;
  now: Date;
  alreadyCancelled: boolean;
  cancellation?: Row;
  inProgress?: boolean;
}) {
  const { booking, guest, apartment, payment, schedule, now } = input;
  let reason: string | null = null;
  if (input.alreadyCancelled) reason = 'ALREADY_CANCELLED';
  else if (input.inProgress) reason = 'CANCELLATION_IN_PROGRESS';
  else if (schedule.reason) reason = schedule.reason;
  else if (String(booking.status) !== 'confirmed')
    reason = 'BOOKING_NOT_ELIGIBLE';
  else if (String(booking.paymentStatus) !== 'paid')
    reason = 'BOOKING_NOT_ELIGIBLE';
  const eligible = reason === null;
  return {
    bookingReference: String(booking.bookingReference),
    bookingStatus: input.alreadyCancelled
      ? 'cancelled'
      : String(booking.status),
    paymentStatus: String(booking.paymentStatus),
    guestName:
      `${String(guest.firstName ?? '')} ${String(guest.lastName ?? '')}`.trim(),
    apartment: {
      name: String(apartment.name),
      location: String(apartment.displayLocation ?? ''),
    },
    checkIn: String(booking.checkIn),
    checkOut: String(booking.checkOut),
    nights: Number(booking.nights),
    guestCount: Number(booking.guestCount),
    amountPaid: String(payment?.expectedAmount ?? booking.totalAmount),
    currency: String(payment?.currency ?? booking.currency),
    scheduledCheckInAt: schedule.checkInAt.toISOString(),
    cancellationDeadline: schedule.deadlineAt.toISOString(),
    deadlineLabel: formatScheduledDateTime(
      schedule.deadlineAt,
      schedule.timeZone,
    ),
    timeZone: schedule.timeZone,
    eligible,
    reason,
    message: eligible
      ? 'This booking can be cancelled online.'
      : ineligibilityMessage(reason),
    checkedAt: now.toISOString(),
    alreadyCancelled: input.alreadyCancelled,
    cancelledAt: dateTime(input.cancellation?.completedAt),
    refundStatus: input.cancellation?.refund
      ? String((input.cancellation.refund as Row).status)
      : null,
  };
}

async function tokenRecord(token: string, transaction?: Transaction) {
  return BookingCancellationToken.findOne({
    where: {
      tokenHash: hashCancellationToken(token),
      purpose: CANCELLATION_TOKEN_PURPOSE,
    },
    ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}),
  });
}

export async function getCancellationRequest(
  token: string,
  now: Date = new Date(),
) {
  if (!isValidCancellationTokenShape(token))
    throw new CancellationError(
      404,
      'CANCELLATION_LINK_INVALID',
      'This cancellation link is not valid.',
    );
  const tokenRow = await tokenRecord(token);
  if (!tokenRow)
    throw new CancellationError(
      404,
      'CANCELLATION_LINK_INVALID',
      'This cancellation link is not valid.',
    );
  const tokenValue = plain(tokenRow);
  if (
    tokenValue.revokedAt ||
    (tokenValue.usedAt && !tokenValue.revokedAt) ||
    !tokenValue.expiresAt ||
    Date.parse(String(tokenValue.expiresAt)) <= now.getTime()
  ) {
    if (!tokenValue.usedAt)
      throw new CancellationError(
        410,
        'CANCELLATION_LINK_EXPIRED',
        'This cancellation link has expired.',
      );
  }
  const booking = (await Booking.findByPk(String(tokenValue.bookingId), {
    include: [
      { model: Guest, as: 'guest' },
      { model: Apartment, as: 'apartment' },
      {
        model: BookingCancellation,
        as: 'cancellation',
        include: [{ model: BookingRefund, as: 'refund' }],
      },
    ],
  })) as import('sequelize').Model | null;
  if (!booking)
    throw new CancellationError(
      404,
      'CANCELLATION_LINK_INVALID',
      'This cancellation link is not valid.',
    );
  const bookingValue = plain(booking);
  const guest = (bookingValue.guest ?? {}) as Row;
  const apartment = (bookingValue.apartment ?? {}) as Row;
  if (!guest.firstName || !apartment.name)
    throw new CancellationError(
      404,
      'CANCELLATION_LINK_INVALID',
      'This cancellation link is not valid.',
    );
  const schedule = scheduleFor(bookingValue, apartment);
  const payment = await findPaymentForBooking(String(bookingValue.id));
  const cancellation = (bookingValue.cancellation ?? undefined) as
    | Row
    | undefined;
  return requestItem({
    booking: bookingValue,
    guest,
    apartment,
    payment: payment?.get({ plain: true }) as Row | undefined,
    schedule,
    now,
    alreadyCancelled:
      String(bookingValue.status) === 'cancelled' || Boolean(cancellation),
    cancellation,
    inProgress: String(bookingValue.status) === 'cancellation_requested',
  });
}

type ConfirmOptions = {
  now?: Date;
  client?: ProviderClient;
};

type RefundStart = {
  cancellationId: string;
  refundId: string;
  bookingId: string;
  bookingReference: string;
  providerReference: string;
};

export async function confirmCancellation(
  token: string,
  options: ConfirmOptions = {},
) {
  if (!isValidCancellationTokenShape(token))
    throw new CancellationError(
      404,
      'CANCELLATION_LINK_INVALID',
      'This cancellation link is not valid.',
    );
  const now = options.now ?? new Date();
  const refundStart = await sequelize.transaction(async (transaction) => {
    const tokenRow = await tokenRecord(token, transaction);
    if (!tokenRow)
      throw new CancellationError(
        404,
        'CANCELLATION_LINK_INVALID',
        'This cancellation link is not valid.',
      );
    const tokenValue = plain(tokenRow);
    if (tokenValue.usedAt)
      throw new CancellationError(
        409,
        'CANCELLATION_ALREADY_PROCESSED',
        'This cancellation request has already been submitted.',
      );
    if (tokenValue.revokedAt)
      throw new CancellationError(
        410,
        'CANCELLATION_LINK_EXPIRED',
        'This cancellation link has expired.',
      );
    if (
      !tokenValue.expiresAt ||
      Date.parse(String(tokenValue.expiresAt)) <= now.getTime()
    )
      throw new CancellationError(
        410,
        'CANCELLATION_LINK_EXPIRED',
        'This cancellation link has expired.',
      );

    const booking = await Booking.findByPk(String(tokenValue.bookingId), {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!booking)
      throw new CancellationError(
        404,
        'CANCELLATION_LINK_INVALID',
        'This cancellation link is not valid.',
      );
    const bookingValue = plain(booking);
    const existing = await BookingCancellation.findOne({
      where: { bookingId: bookingValue.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existing || String(bookingValue.status) === 'cancelled')
      throw new CancellationError(
        409,
        'CANCELLATION_ALREADY_PROCESSED',
        'This booking has already been cancelled.',
      );
    if (String(bookingValue.status) === 'cancellation_requested')
      throw new CancellationError(
        409,
        'CANCELLATION_IN_PROGRESS',
        'A cancellation request for this booking is already being processed.',
      );
    if (
      String(bookingValue.status) !== 'confirmed' ||
      String(bookingValue.paymentStatus) !== 'paid'
    )
      throw new CancellationError(
        409,
        'BOOKING_NOT_CANCELLABLE',
        'This booking is not eligible for online cancellation.',
      );

    const apartmentModel = await Apartment.findByPk(
      String(bookingValue.apartmentId),
      { transaction },
    );
    if (!apartmentModel)
      throw new CancellationError(
        404,
        'BOOKING_NOT_CANCELLABLE',
        'This booking is not eligible for online cancellation.',
      );
    const schedule = scheduleFor(bookingValue, plain(apartmentModel) as Row);
    if (now.getTime() >= schedule.checkInAt.getTime())
      throw new CancellationError(
        409,
        'CHECK_IN_STARTED',
        ineligibilityMessage('CHECK_IN_STARTED'),
      );
    if (now.getTime() > schedule.deadlineAt.getTime())
      throw new CancellationError(
        409,
        'CANCELLATION_DEADLINE_PASSED',
        ineligibilityMessage('CANCELLATION_DEADLINE_PASSED'),
      );

    const payment = await findPaymentForBooking(
      String(bookingValue.id),
      transaction,
    );
    const paymentValue = payment?.get({ plain: true }) as Row | undefined;
    if (!paymentValue || String(paymentValue.status) !== 'succeeded')
      throw new CancellationError(
        409,
        'VERIFIED_PAYMENT_REQUIRED',
        'A verified, refundable Paystack payment was not found for this booking.',
      );

    const cancellation = await BookingCancellation.create(
      {
        bookingId: bookingValue.id,
        tokenId: tokenValue.id,
        source: 'customer_link',
        requestedAt: now,
        completedAt: now,
        deadlineAt: schedule.deadlineAt,
      },
      { transaction },
    );
    const refund = await BookingRefund.create(
      {
        bookingId: bookingValue.id,
        cancellationId: cancellation.get('id'),
        paymentTransactionId: paymentValue.id,
        provider: 'paystack',
        providerReference: paymentValue.transactionReference,
        status: 'pending',
        amount: paymentValue.expectedAmount,
        currency: paymentValue.currency,
        policy: CANCELLATION_REFUND_POLICY,
        requestedAt: now,
        providerMetadata: {},
      },
      { transaction },
    );
    await tokenRow.update({ usedAt: now }, { transaction });
    await BookingCancellationToken.update(
      { revokedAt: now },
      {
        where: {
          bookingId: bookingValue.id,
          usedAt: null,
          revokedAt: null,
        },
        transaction,
      },
    );
    await sequelize.query(
      "SELECT set_config('app.event_source', 'customer_cancellation', true)",
      { transaction },
    );
    await booking.update(
      { status: 'cancelled', paymentStatus: 'refund_pending' },
      { transaction },
    );
    return {
      cancellationId: String(cancellation.get('id')),
      refundId: String(refund.get('id')),
      bookingId: String(bookingValue.id),
      bookingReference: String(bookingValue.bookingReference),
      providerReference: String(paymentValue.transactionReference),
    } satisfies RefundStart;
  });

  // The booking and refund request are already committed at this point. A
  // provider interruption must not make the customer believe the booking is
  // still active or that the refund completed.
  let refundStatus: RefundStatus = 'pending';
  try {
    const processed = await processCancellationRefund(refundStart.refundId, {
      client: options.client,
      now,
    });
    refundStatus = processed.status ?? 'pending';
  } catch {
    refundStatus = 'pending';
  }
  void Promise.all([
    sendCancellationReceivedEmail(refundStart.cancellationId),
    sendCancellationCompletedEmail(refundStart.cancellationId),
    sendAdminCancellationReceivedEmail(refundStart.cancellationId),
  ]).catch(() => undefined);
  return {
    bookingReference: refundStart.bookingReference,
    bookingStatus: 'cancelled',
    refundStatus,
    message: 'Unbooking request received!',
  };
}

function refundClient(client?: ProviderClient) {
  if (client) return client;
  if (!env.PAYSTACK_SECRET_KEY)
    throw new PaymentError(
      503,
      'PAYMENTS_NOT_CONFIGURED',
      'Refunds are not configured right now.',
    );
  return createPaystackClient(env.PAYSTACK_SECRET_KEY);
}

function providerRefundId(value: Row) {
  const id = value.id ?? value.refund_reference;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

export async function processCancellationRefund(
  refundId: string,
  options: { client?: ProviderClient; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const started = await sequelize.transaction(async (transaction) => {
    const refund = await BookingRefund.findByPk(refundId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!refund) return null;
    const value = plain(refund);
    if (!['pending', 'failed'].includes(String(value.status))) return null;
    await refund.update(
      {
        status: 'processing',
        attempts: Number(value.attempts) + 1,
        lastAttemptAt: now,
        failureReason: null,
        processedAt: null,
      },
      { transaction },
    );
    return {
      providerReference: String(value.providerReference),
      provider: String(value.provider),
    };
  });
  if (!started)
    return {
      status: (await BookingRefund.findByPk(refundId))?.get('status') as
        | RefundStatus
        | undefined,
    };

  let client: ProviderClient;
  try {
    client = refundClient(options.client);
  } catch (error) {
    const status =
      error instanceof PaymentError && error.code === 'PAYMENTS_NOT_CONFIGURED'
        ? ('failed' as const)
        : ('processing' as const);
    await finalizeRefundAttempt(refundId, status, {
      failureReason:
        error instanceof PaymentError
          ? error.code.toLowerCase()
          : 'refund_request_uncertain',
      source: 'cancellation_refund',
    });
    return { status };
  }

  try {
    const response = await client.refund(started.providerReference);
    const data =
      response && typeof response === 'object' && !Array.isArray(response)
        ? (response as Row)
        : {};
    const mapped = mapProviderRefundStatus(data.status);
    const failureReason =
      mapped === 'failed' ? 'provider_reported_failure' : null;
    await finalizeRefundAttempt(refundId, mapped, {
      providerRefundId: providerRefundId(data),
      metadata: sanitizeRefundMetadata(data),
      failureReason,
      processedAt: mapped === 'successful' || mapped === 'failed' ? now : null,
      source: 'cancellation_refund',
    });
    if (mapped === 'successful') {
      void sendRefundSuccessfulEmail(refundId);
      void sendAdminRefundOutcomeEmail(refundId, 'successful');
    }
    if (mapped === 'failed') {
      void sendRefundFailedEmail(refundId);
      void sendAdminRefundOutcomeEmail(refundId, 'failed');
    }
    return { status: mapped };
  } catch (error) {
    const rejected =
      error instanceof PaymentError &&
      error.code === 'PAYMENT_PROVIDER_REJECTED';
    const status: RefundStatus = rejected ? 'failed' : 'processing';
    await finalizeRefundAttempt(refundId, status, {
      failureReason: rejected
        ? 'provider_rejected_refund'
        : 'refund_request_uncertain',
      processedAt: rejected ? now : null,
      source: 'cancellation_refund',
    });
    if (rejected) {
      void sendRefundFailedEmail(refundId);
      void sendAdminRefundOutcomeEmail(refundId, 'failed');
    }
    return { status };
  }
}

async function finalizeRefundAttempt(
  refundId: string,
  status: RefundStatus,
  input: {
    providerRefundId?: string | null;
    metadata?: Row;
    failureReason?: string | null;
    processedAt?: Date | null;
    source: string;
  },
) {
  await sequelize.transaction(async (transaction) => {
    await updateRefundWithinTransaction(transaction, refundId, {
      status,
      providerRefundId: input.providerRefundId,
      metadata: input.metadata,
      failureReason: input.failureReason,
      processedAt: input.processedAt,
      source: input.source,
    });
  });
}

function normalizeProviderRefundList(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === 'object') {
    const data = (value as Row).data;
    if (Array.isArray(data)) return data as Row[];
  }
  return [];
}

export async function retryCancellationRefund(
  refundId: string,
  reason: string,
  admin: { id: string; role: string },
  options: { client?: ProviderClient; now?: Date } = {},
) {
  if (!env.PAYSTACK_SECRET_KEY && !options.client)
    throw new CancellationError(
      503,
      'PAYMENTS_NOT_CONFIGURED',
      'Refund processing is not configured.',
    );
  const client = refundClient(options.client);
  const refund = await BookingRefund.findByPk(refundId);
  if (!refund)
    throw new CancellationError(
      404,
      'REFUND_NOT_FOUND',
      'The refund could not be found.',
    );
  const value = plain(refund);
  if (String(value.status) !== 'failed')
    throw new CancellationError(
      409,
      'REFUND_NOT_RETRYABLE',
      'Only a failed refund can be retried.',
    );
  const booking = await Booking.findByPk(String(value.bookingId));
  if (!booking || String(booking.get('status')) !== 'cancelled')
    throw new CancellationError(
      409,
      'REFUND_NOT_RETRYABLE',
      'Only a refund for a cancelled booking can be retried.',
    );

  let confirmedNoActiveRefund = !value.providerRefundId;
  if (client.listRefunds) {
    try {
      const rows = normalizeProviderRefundList(
        await client.listRefunds(String(value.providerReference)),
      );
      const processed = rows.find((row) =>
        ['processed', 'successful', 'success', 'completed'].includes(
          String(row.status).toLowerCase(),
        ),
      );
      if (processed) {
        await finalizeRefundAttempt(refundId, 'successful', {
          providerRefundId: providerRefundId(processed),
          metadata: sanitizeRefundMetadata(processed),
          source: 'admin_refund_retry',
          processedAt: options.now ?? new Date(),
        });
        void sendRefundSuccessfulEmail(refundId);
        void sendAdminRefundOutcomeEmail(refundId, 'successful');
        return { status: 'successful' as const };
      }
      const active = rows.find((row) =>
        ['pending', 'processing', 'queued'].includes(
          String(row.status).toLowerCase(),
        ),
      );
      if (active) {
        await finalizeRefundAttempt(refundId, 'processing', {
          providerRefundId: providerRefundId(active),
          metadata: sanitizeRefundMetadata(active),
          source: 'admin_refund_retry',
        });
        return { status: 'processing' as const };
      }
      confirmedNoActiveRefund = true;
    } catch {
      if (value.providerRefundId)
        throw new CancellationError(
          409,
          'REFUND_STATUS_UNVERIFIED',
          'Paystack could not confirm whether the previous refund is still active. Check Paystack before retrying.',
        );
    }
  } else if (value.providerRefundId) {
    throw new CancellationError(
      409,
      'REFUND_STATUS_UNVERIFIED',
      'The previous refund reference is present. Check Paystack before retrying.',
    );
  }
  if (!confirmedNoActiveRefund)
    throw new CancellationError(
      409,
      'REFUND_STATUS_UNVERIFIED',
      'Paystack could not confirm whether the previous refund is still active. Check Paystack before retrying.',
    );

  await sequelize.transaction(async (transaction) => {
    await updateRefundWithinTransaction(transaction, refundId, {
      status: 'pending',
      failureReason: null,
      processedAt: null,
      source: 'admin_refund_retry',
    });
  });
  await AdminAuditEvent.create({
    adminAccountId: admin.id,
    action: 'refund.retry_requested',
    targetType: 'booking_refund',
    targetId: refundId,
    metadata: {
      reason,
      bookingReference: booking.get('bookingReference'),
      providerReference: value.providerReference,
      previousStatus: value.status,
    },
  });
  const result = await processCancellationRefund(refundId, {
    client,
    now: options.now,
  });
  return { status: result.status };
}

export async function listAdminRefunds(query: Row) {
  const page = Number(query.page);
  const limit = Number(query.limit);
  const result = await BookingRefund.findAndCountAll({
    where: query.status ? { status: query.status } : {},
    include: [
      {
        model: Booking,
        as: 'booking',
        attributes: [
          'id',
          'bookingReference',
          'status',
          'paymentStatus',
          'checkIn',
          'checkOut',
          'totalAmount',
          'currency',
          'createdAt',
        ],
      },
      {
        model: BookingCancellation,
        as: 'cancellation',
        attributes: [
          'id',
          'requestedAt',
          'completedAt',
          'deadlineAt',
          'source',
        ],
      },
      {
        model: PaymentTransaction,
        as: 'payment',
        attributes: [
          'id',
          'transactionReference',
          'status',
          'expectedAmount',
          'currency',
          'verifiedAt',
        ],
      },
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['createdAt', 'DESC']],
  });
  return {
    items: result.rows.map((model) => {
      const value = plain(model);
      const booking = (value.booking ?? {}) as Row;
      const cancellation = (value.cancellation ?? {}) as Row;
      const payment = (value.payment ?? {}) as Row;
      return {
        id: value.id,
        bookingId: value.bookingId,
        bookingReference: booking.bookingReference ?? null,
        bookingStatus: booking.status ?? null,
        bookingPaymentStatus: booking.paymentStatus ?? null,
        checkIn: booking.checkIn ?? null,
        checkOut: booking.checkOut ?? null,
        cancellationRequestedAt: cancellation.requestedAt ?? null,
        cancellationCompletedAt: cancellation.completedAt ?? null,
        cancellationDeadline: cancellation.deadlineAt ?? null,
        status: value.status,
        amount: value.amount,
        currency: value.currency,
        policy: value.policy,
        provider: value.provider,
        providerReference: value.providerReference,
        providerRefundId: value.providerRefundId,
        failureReason: value.failureReason,
        attempts: value.attempts,
        requestedAt: value.requestedAt,
        lastAttemptAt: value.lastAttemptAt,
        processedAt: value.processedAt,
        originalPaymentReference: payment.transactionReference ?? null,
        originalPaymentStatus: payment.status ?? null,
        originalPaymentVerifiedAt: payment.verifiedAt ?? null,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      totalPages: Math.ceil(result.count / limit),
    },
  };
}
