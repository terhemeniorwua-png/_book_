import { z } from 'zod';

export const cancellationTokenPattern = /^[A-Za-z0-9_-]{43}$/;

const moneySchema = z.union([z.string(), z.number()]);
const refundStatusSchema = z
  .enum(['not_applicable', 'pending', 'processing', 'successful', 'failed'])
  .nullable();

export const cancellationRequestSchema = z.object({
  bookingReference: z.string(),
  bookingStatus: z.string(),
  paymentStatus: z.string(),
  guestName: z.string(),
  apartment: z.object({
    name: z.string(),
    location: z.string(),
  }),
  checkIn: z.string(),
  checkOut: z.string(),
  nights: z.number(),
  guestCount: z.number(),
  amountPaid: moneySchema,
  currency: z.string().length(3),
  scheduledCheckInAt: z.string(),
  cancellationDeadline: z.string(),
  deadlineLabel: z.string(),
  timeZone: z.string(),
  eligible: z.boolean(),
  reason: z.string().nullable(),
  message: z.string(),
  checkedAt: z.string(),
  alreadyCancelled: z.boolean(),
  cancelledAt: z.string().nullable(),
  refundStatus: refundStatusSchema,
});

export const cancellationConfirmSchema = z.object({
  bookingReference: z.string(),
  bookingStatus: z.string(),
  refundStatus: z.enum([
    'not_applicable',
    'pending',
    'processing',
    'successful',
    'failed',
  ]),
  message: z.string(),
});

export type CancellationRequest = z.infer<typeof cancellationRequestSchema>;
export type CancellationConfirmation = z.infer<
  typeof cancellationConfirmSchema
>;
export type CancellationRefundStatus = NonNullable<
  CancellationRequest['refundStatus']
>;

export function parseCancellationRequest(value: unknown) {
  return cancellationRequestSchema.safeParse(value);
}

export function parseCancellationConfirmation(value: unknown) {
  return cancellationConfirmSchema.safeParse(value);
}

export function readCancellationToken(hash: string) {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const token = new URLSearchParams(value).get('token');
  return token && cancellationTokenPattern.test(token) ? token : null;
}

export function refundStatusLabel(status: CancellationRefundStatus) {
  if (status === 'successful') return 'Refund completed';
  if (status === 'failed') return 'Refund needs attention';
  if (status === 'processing') return 'Refund processing';
  if (status === 'pending') return 'Refund pending';
  return 'No refund due';
}
