import { type Transaction } from 'sequelize';
import {
  Booking,
  BookingRefund,
  PaymentStateEvent,
  PaymentTransaction,
} from '../db/models/index.js';

export type RefundStatus =
  | 'not_applicable'
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed';

type Row = Record<string, unknown>;

export function mapProviderRefundStatus(value: unknown): RefundStatus {
  const status = String(value ?? '').toLowerCase();
  if (['processed', 'successful', 'success', 'completed'].includes(status))
    return 'successful';
  if (['failed', 'reversed', 'cancelled', 'canceled'].includes(status))
    return 'failed';
  if (['processing', 'pending', 'queued'].includes(status)) return 'processing';
  return 'processing';
}

export function sanitizeRefundMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Row;
  const allowed = [
    'id',
    'status',
    'amount',
    'currency',
    'transaction',
    'domain',
    'reason',
    'created_at',
    'updated_at',
    'processed_at',
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

function paymentStatusFor(status: RefundStatus) {
  if (status === 'successful') return 'refunded';
  if (status === 'failed') return 'needs_review';
  return 'refund_pending';
}

function bookingPaymentStatusFor(status: RefundStatus) {
  if (status === 'successful') return 'refunded';
  if (status === 'failed') return 'manual_review';
  return 'refund_pending';
}

export type RefundChange = {
  refundId: string;
  bookingId: string;
  cancellationId: string;
  previousStatus: string;
  nextStatus: RefundStatus;
  changed: boolean;
};

export async function updateRefundWithinTransaction(
  transaction: Transaction,
  refundId: string,
  input: {
    status: RefundStatus;
    providerRefundId?: string | null;
    metadata?: Row;
    failureReason?: string | null;
    processedAt?: Date | null;
    source: string;
  },
): Promise<RefundChange | null> {
  const refund = await BookingRefund.findByPk(refundId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!refund) return null;
  const value = refund.get({ plain: true }) as Row;
  const previousStatus = String(value.status);
  if (previousStatus === 'successful' && input.status !== 'successful')
    return {
      refundId,
      bookingId: String(value.bookingId),
      cancellationId: String(value.cancellationId),
      previousStatus,
      nextStatus: 'successful',
      changed: false,
    };
  if (previousStatus === 'processing' && input.status === 'pending')
    return {
      refundId,
      bookingId: String(value.bookingId),
      cancellationId: String(value.cancellationId),
      previousStatus,
      nextStatus: 'processing',
      changed: false,
    };
  if (previousStatus === input.status && !input.metadata) {
    return {
      refundId,
      bookingId: String(value.bookingId),
      cancellationId: String(value.cancellationId),
      previousStatus,
      nextStatus: input.status,
      changed: false,
    };
  }

  const existingMetadata =
    value.providerMetadata &&
    typeof value.providerMetadata === 'object' &&
    !Array.isArray(value.providerMetadata)
      ? (value.providerMetadata as Row)
      : {};
  const processedAt = ['successful', 'failed'].includes(input.status)
    ? (input.processedAt ?? new Date())
    : null;
  await refund.update(
    {
      status: input.status,
      ...(input.providerRefundId !== undefined
        ? { providerRefundId: input.providerRefundId }
        : {}),
      ...(input.metadata
        ? { providerMetadata: { ...existingMetadata, ...input.metadata } }
        : {}),
      ...(input.failureReason !== undefined
        ? { failureReason: input.failureReason }
        : {}),
      processedAt,
    },
    { transaction },
  );

  const payment = await PaymentTransaction.findByPk(
    String(value.paymentTransactionId),
    { transaction, lock: transaction.LOCK.UPDATE },
  );
  if (payment) {
    const paymentValue = payment.get({ plain: true }) as Row;
    const nextPaymentStatus = paymentStatusFor(input.status);
    if (paymentValue.status !== nextPaymentStatus) {
      await payment.update(
        {
          status: nextPaymentStatus,
          processedAt:
            input.status === 'successful' || input.status === 'failed'
              ? (input.processedAt ?? new Date())
              : paymentValue.processedAt,
        },
        { transaction },
      );
      await PaymentStateEvent.create(
        {
          paymentTransactionId: value.paymentTransactionId,
          previousStatus: String(paymentValue.status),
          nextStatus: nextPaymentStatus,
          source: input.source.slice(0, 24),
          metadata: { refundStatus: input.status },
        },
        { transaction },
      );
    }
  }

  const booking = await Booking.findByPk(String(value.bookingId), {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (booking)
    await booking.update(
      { paymentStatus: bookingPaymentStatusFor(input.status) },
      { transaction },
    );

  return {
    refundId,
    bookingId: String(value.bookingId),
    cancellationId: String(value.cancellationId),
    previousStatus,
    nextStatus: input.status,
    changed: true,
  };
}
