import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import Joi from 'joi';
import { Model, Op, UniqueConstraintError } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import {
  Apartment,
  Booking,
  BookingRefund,
  Guest,
  InventoryClaim,
  PaymentStateEvent,
  PaymentTransaction,
  PaymentWebhookEvent,
} from '../db/models/index.js';
import { createCancellationToken } from './cancellation-tokens.js';
import { resolveCancellationSchedule } from './cancellation-policy.js';
import {
  sendAdminRefundOutcomeEmail,
  sendBookingConfirmationEmail,
  sendRefundFailedEmail,
  sendRefundSuccessfulEmail,
} from './email.js';
import {
  mapProviderRefundStatus,
  sanitizeRefundMetadata,
  updateRefundWithinTransaction,
} from './refund-processing.js';

type RecordLike = Record<string, unknown>;
export type PaystackTransaction = {
  id: number | string;
  domain: 'test' | 'live';
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
  paid_at?: string | null;
};
type PaystackResponse<T> = { status: boolean; message?: string; data: T };
export type ProviderClient = {
  initialize: (body: RecordLike) => Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>;
  verify: (reference: string) => Promise<PaystackTransaction>;
  refund: (reference: string) => Promise<unknown>;
  listRefunds?: (reference: string) => Promise<unknown>;
};

export class PaymentError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const idempotencySchema = Joi.string()
  .trim()
  .min(16)
  .max(128)
  .pattern(/^[A-Za-z0-9._:-]+$/)
  .required();
export const paymentReferenceSchema = Joi.object({
  reference: Joi.string()
    .trim()
    .min(8)
    .max(120)
    .pattern(/^[A-Za-z0-9.=\-_]+$/)
    .required(),
}).unknown(false);
export const paymentBookingParamsSchema = Joi.object({
  bookingReference: Joi.string()
    .pattern(/^AB-[A-F0-9]{14}$/)
    .required(),
}).unknown(false);

export function toPaystackMinorUnits(value: string | number) {
  const amount = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match)
    throw new PaymentError(
      409,
      'INVALID_BOOKING_AMOUNT',
      'This booking cannot be paid at this time.',
    );
  const minor =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new PaymentError(
      409,
      'INVALID_BOOKING_AMOUNT',
      'This booking cannot be paid at this time.',
    );
  return Number(minor);
}

export function canConfirmPaidReservation(
  bookingStatus: string,
  expiresAt: string | Date | null,
  hasInventoryClaim: boolean,
  now = Date.now(),
) {
  return (
    bookingStatus === 'pending' &&
    Boolean(expiresAt) &&
    Date.parse(String(expiresAt)) > now &&
    hasInventoryClaim
  );
}

export function verifyPaystackSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function createPaystackClient(
  secretKey: string,
  fetcher: typeof fetch = fetch,
): ProviderClient {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`https://api.paystack.co${path}`, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        headers: {
          authorization: `Bearer ${secretKey}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      });
    } catch {
      throw new PaymentError(
        503,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'Payment service is temporarily unavailable. Try again shortly.',
      );
    }
    let payload: PaystackResponse<T>;
    try {
      payload = (await response.json()) as PaystackResponse<T>;
    } catch {
      throw new PaymentError(
        503,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'Payment service is temporarily unavailable. Try again shortly.',
      );
    }
    if (!response.ok || payload.status !== true)
      throw new PaymentError(
        502,
        'PAYMENT_PROVIDER_REJECTED',
        'Payment service could not process this request.',
      );
    return payload.data;
  }
  return {
    initialize: (body) =>
      request('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    verify: (reference) =>
      request(`/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
      }),
    refund: (reference) =>
      request('/refund', {
        method: 'POST',
        body: JSON.stringify({ transaction: reference }),
      }),
    listRefunds: (reference) =>
      request(`/refund?transaction=${encodeURIComponent(reference)}`, {
        method: 'GET',
      }),
  };
}

const defaultClient = () => {
  if (!env.PAYSTACK_SECRET_KEY)
    throw new PaymentError(
      503,
      'PAYMENTS_NOT_CONFIGURED',
      'Payments are not available right now.',
    );
  return createPaystackClient(env.PAYSTACK_SECRET_KEY);
};

function accessTokenMatches(token: string, hash: string | null) {
  if (!hash || !/^[a-f0-9]{64}$/i.test(token)) return false;
  const actual = Buffer.from(sha256(token), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function authorization(token: string) {
  const match = /^Bearer ([A-Fa-f0-9]{64})$/.exec(token ?? '');
  if (!match)
    throw new PaymentError(
      401,
      'BOOKING_ACCESS_REQUIRED',
      'A valid booking access token is required.',
    );
  return match[1]!;
}

export function validatePaymentIdempotencyKey(value: string | undefined) {
  const { error, value: key } = idempotencySchema.validate(value);
  if (error)
    throw new PaymentError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'A valid payment attempt key is required.',
    );
  return key as string;
}

function paymentAccessUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try {
    return (
      new URL(value).hostname === 'checkout.paystack.com' &&
      new URL(value).protocol === 'https:'
    );
  } catch {
    return false;
  }
}

export async function initializePayment(
  bookingReference: string,
  authorizationHeader: string,
  idempotencyKey: string,
  client: ProviderClient = defaultClient(),
) {
  const token = authorization(authorizationHeader);
  const idempotencyKeyHash = sha256(idempotencyKey);
  let attempt: Model;
  let guestEmail = '';
  let callbackUrl = env.PAYSTACK_CALLBACK_URL;
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const booking = (await Booking.findOne({
        where: { bookingReference },
        include: [{ model: Guest, as: 'guest' }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Booking },
      })) as Model | null;
      const bookingData = booking?.get({ plain: true }) as
        | (RecordLike & { guest?: RecordLike })
        | undefined;
      if (
        !bookingData ||
        !accessTokenMatches(token, bookingData.accessTokenHash as string | null)
      )
        throw new PaymentError(
          404,
          'BOOKING_NOT_FOUND',
          'Booking could not be found.',
        );
      if (
        bookingData.status !== 'pending' ||
        !bookingData.expiresAt ||
        Date.parse(String(bookingData.expiresAt)) <= Date.now()
      )
        throw new PaymentError(
          410,
          'BOOKING_HOLD_EXPIRED',
          'This reservation hold has expired. Start again to check availability.',
        );
      const currency = String(bookingData.currency).toUpperCase();
      if (currency !== env.PAYSTACK_CURRENCY || currency !== 'NGN')
        throw new PaymentError(
          409,
          'UNSUPPORTED_CURRENCY',
          'This booking currency is not supported for online payment.',
        );
      const byKey = await PaymentTransaction.findOne({
        where: { idempotencyKeyHash },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (byKey) {
        const existing = byKey.get({ plain: true }) as RecordLike;
        if (
          existing.bookingId !== bookingData.id ||
          existing.provider !== 'paystack'
        )
          throw new PaymentError(
            409,
            'PAYMENT_IDEMPOTENCY_CONFLICT',
            'This payment attempt key has already been used.',
          );
        attempt = byKey;
        guestEmail = String(bookingData.guest?.email ?? '');
        return { existing: true, authorizationUrl: existing.authorizationUrl };
      }
      if (
        ['paid', 'refund_pending', 'refunded', 'manual_review'].includes(
          String(bookingData.paymentStatus),
        )
      )
        throw new PaymentError(
          409,
          'BOOKING_NOT_PAYABLE',
          'This reservation is not eligible for payment.',
        );
      const activeAttempt = await PaymentTransaction.findOne({
        where: {
          bookingId: String(bookingData.id),
          status: {
            [Op.in]: ['initiated', 'pending', 'refund_pending', 'needs_review'],
          },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (activeAttempt)
        throw new PaymentError(
          409,
          'PAYMENT_INITIALIZATION_PENDING',
          'Another payment attempt for this reservation is still being checked. Retry shortly.',
        );
      const reference = `staywell_${randomBytes(18).toString('hex')}`;
      attempt = await PaymentTransaction.create(
        {
          bookingId: bookingData.id,
          provider: 'paystack',
          transactionReference: reference,
          expectedAmount: bookingData.totalAmount,
          currency,
          status: 'initiated',
          idempotencyKeyHash,
          providerMetadata: {},
        },
        { transaction },
      );
      await PaymentStateEvent.create(
        {
          paymentTransactionId: attempt.get('id'),
          previousStatus: null,
          nextStatus: 'initiated',
          source: 'checkout',
          metadata: {},
        },
        { transaction },
      );
      await booking!.update({ paymentStatus: 'pending' }, { transaction });
      guestEmail = String(bookingData.guest?.email ?? '');
      if (callbackUrl) {
        const callback = new URL(callbackUrl);
        callback.searchParams.set('bookingReference', bookingReference);
        callbackUrl = callback.toString();
      }
      return { existing: false, authorizationUrl: null };
    });
    const attemptData = attempt!.get({ plain: true }) as RecordLike;
    if (
      result.existing &&
      typeof result.authorizationUrl === 'string' &&
      paymentAccessUrl(result.authorizationUrl)
    ) {
      return {
        authorizationUrl: result.authorizationUrl,
        reference: String(attemptData.transactionReference),
        currency: String(attemptData.currency),
      };
    }
    if (result.existing)
      throw new PaymentError(
        409,
        'PAYMENT_INITIALIZATION_PENDING',
        'This payment attempt is still being prepared. Retry shortly.',
      );
    const amount = toPaystackMinorUnits(
      attemptData.expectedAmount as string | number,
    );
    let response: Awaited<ReturnType<ProviderClient['initialize']>>;
    try {
      response = await client.initialize({
        email: guestEmail,
        amount: String(amount),
        currency: attemptData.currency,
        reference: attemptData.transactionReference,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: { booking_reference: bookingReference },
      });
    } catch (error) {
      if (
        error instanceof PaymentError &&
        error.code === 'PAYMENT_PROVIDER_REJECTED'
      ) {
        await sequelize.transaction(async (transaction) => {
          const current = await PaymentTransaction.findByPk(
            String(attemptData.id),
            { transaction, lock: transaction.LOCK.UPDATE },
          );
          if (current && current.get('status') === 'initiated') {
            await current.update(
              { status: 'failed', processedAt: new Date() },
              { transaction },
            );
            await PaymentStateEvent.create(
              {
                paymentTransactionId: current.get('id'),
                previousStatus: 'initiated',
                nextStatus: 'failed',
                source: 'initialization',
                metadata: {},
              },
              { transaction },
            );
          }
        });
      }
      throw error;
    }
    if (
      response.reference !== attemptData.transactionReference ||
      !paymentAccessUrl(response.authorization_url)
    )
      throw new PaymentError(
        502,
        'INVALID_PROVIDER_RESPONSE',
        'Payment service returned an invalid checkout response.',
      );
    await sequelize.transaction(async (transaction) => {
      const current = await PaymentTransaction.findByPk(
        String(attemptData.id),
        { transaction, lock: transaction.LOCK.UPDATE },
      );
      if (!current)
        throw new PaymentError(
          404,
          'PAYMENT_NOT_FOUND',
          'Payment could not be found.',
        );
      await current.update(
        { authorizationUrl: response.authorization_url, status: 'pending' },
        { transaction },
      );
      await PaymentStateEvent.create(
        {
          paymentTransactionId: current.get('id'),
          previousStatus: 'initiated',
          nextStatus: 'pending',
          source: 'initialization',
          metadata: {},
        },
        { transaction },
      );
    });
    return {
      authorizationUrl: response.authorization_url,
      reference: response.reference,
      currency: String(attemptData.currency),
    };
  } catch (error) {
    if (error instanceof UniqueConstraintError)
      throw new PaymentError(
        409,
        'PAYMENT_ATTEMPT_CONFLICT',
        'A payment attempt is already being prepared. Retry shortly.',
      );
    throw error;
  }
}

export function verificationMatches(
  provider: PaystackTransaction,
  payment: RecordLike,
  guestEmail: string,
) {
  return (
    provider.reference === payment.transactionReference &&
    provider.domain === (env.NODE_ENV === 'production' ? 'live' : 'test') &&
    provider.amount ===
      toPaystackMinorUnits(payment.expectedAmount as string | number) &&
    provider.currency.toUpperCase() ===
      String(payment.currency).toUpperCase() &&
    Boolean(provider.customer?.email) &&
    provider.customer!.email!.trim().toLowerCase() ===
      guestEmail.trim().toLowerCase()
  );
}

async function markPaymentForManualReview(
  reference: string,
  source: string,
  metadata: RecordLike = {},
) {
  await sequelize.transaction(async (transaction) => {
    const payment = await PaymentTransaction.findOne({
      where: { transactionReference: reference, provider: 'paystack' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payment) return;
    const paymentData = payment.get({ plain: true }) as RecordLike;
    const booking = await Booking.findByPk(String(paymentData.bookingId), {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !booking ||
      ['succeeded', 'refunded'].includes(String(paymentData.status))
    )
      return;
    const previousStatus = String(paymentData.status);
    if (previousStatus !== 'needs_review') {
      await payment.update(
        {
          status: 'needs_review',
          verifiedAt: new Date(),
          processedAt: new Date(),
        },
        { transaction },
      );
      await PaymentStateEvent.create(
        {
          paymentTransactionId: paymentData.id,
          previousStatus,
          nextStatus: 'needs_review',
          source,
          metadata,
        },
        { transaction },
      );
    }
    await booking.update({ paymentStatus: 'manual_review' }, { transaction });
  });
}

export async function verifyPaymentForBooking(
  reference: string,
  bookingReference: string,
  authorizationHeader: string,
  client: ProviderClient = defaultClient(),
) {
  const token = authorization(authorizationHeader);
  const initial = await PaymentTransaction.findOne({
    where: { transactionReference: reference, provider: 'paystack' },
  });
  if (!initial)
    throw new PaymentError(
      404,
      'PAYMENT_NOT_FOUND',
      'Payment could not be found.',
    );
  const initialData = initial.get({ plain: true }) as RecordLike;
  const booking = (await Booking.findByPk(String(initialData.bookingId), {
    include: [{ model: Guest, as: 'guest' }],
  })) as Model | null;
  const bookingData = booking?.get({ plain: true }) as
    | (RecordLike & { guest?: RecordLike })
    | undefined;
  if (
    !bookingData ||
    bookingData.bookingReference !== bookingReference ||
    !accessTokenMatches(token, bookingData.accessTokenHash as string | null)
  )
    throw new PaymentError(
      404,
      'PAYMENT_NOT_FOUND',
      'Payment could not be found.',
    );
  if (initialData.status === 'succeeded' || initialData.status === 'refunded')
    return { status: initialData.status, bookingStatus: bookingData.status };
  const provider = await client.verify(reference);
  if (
    !verificationMatches(
      provider,
      initialData,
      String(bookingData.guest?.email ?? ''),
    )
  ) {
    await markPaymentForManualReview(reference, 'verification_mismatch');
    throw new PaymentError(
      409,
      'PAYMENT_MISMATCH',
      'Payment could not be verified for this reservation. Contact support.',
    );
  }
  return processVerifiedTransaction(reference, provider, client);
}

type VerifiedTransactionUpdate = {
  status: string;
  bookingStatus: string;
  shouldRefund: boolean;
  confirmationToken?: string;
  bookingId?: string;
};

async function processVerifiedTransaction(
  reference: string,
  provider: PaystackTransaction,
  client: ProviderClient = defaultClient(),
) {
  const update = await sequelize.transaction<VerifiedTransactionUpdate>(
    async (transaction) => {
      const payment = await PaymentTransaction.findOne({
        where: { transactionReference: reference, provider: 'paystack' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!payment)
        throw new PaymentError(
          404,
          'PAYMENT_NOT_FOUND',
          'Payment could not be found.',
        );
      const paymentData = payment.get({ plain: true }) as RecordLike;
      const booking = await Booking.findByPk(String(paymentData.bookingId), {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!booking)
        throw new PaymentError(
          404,
          'BOOKING_NOT_FOUND',
          'Booking could not be found.',
        );
      const bookingData = booking.get({ plain: true }) as RecordLike;
      const now = new Date();
      if (
        paymentData.status === 'refund_pending' ||
        paymentData.status === 'refunded'
      ) {
        return {
          status: String(paymentData.status),
          bookingStatus: String(bookingData.status),
          shouldRefund: false,
        };
      }
      if (provider.status !== 'success') {
        if (provider.status === 'failed' || provider.status === 'abandoned') {
          await payment.update(
            {
              status: provider.status,
              verifiedAt: now,
              processedAt: now,
              providerTransactionId: String(provider.id),
            },
            { transaction },
          );
          await PaymentStateEvent.create(
            {
              paymentTransactionId: paymentData.id,
              previousStatus: String(paymentData.status),
              nextStatus: provider.status,
              source: 'verification',
              metadata: {},
            },
            { transaction },
          );
          if (
            bookingData.status === 'pending' &&
            bookingData.paymentStatus !== 'paid'
          )
            await booking.update({ paymentStatus: 'failed' }, { transaction });
          return {
            status: provider.status,
            bookingStatus: String(bookingData.status),
            shouldRefund: false,
          };
        }
        return {
          status: 'pending',
          bookingStatus: String(bookingData.status),
          shouldRefund: false,
        };
      }
      if (
        paymentData.status === 'succeeded' ||
        paymentData.status === 'refunded'
      )
        return {
          status: String(paymentData.status),
          bookingStatus: String(bookingData.status),
          shouldRefund: false,
        };
      const inventoryClaim = await InventoryClaim.findOne({
        where: { bookingId: bookingData.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const holdValid = canConfirmPaidReservation(
        String(bookingData.status),
        bookingData.expiresAt as string | Date | null,
        Boolean(inventoryClaim),
        now.getTime(),
      );
      if (holdValid) {
        await payment.update(
          {
            status: 'succeeded',
            providerTransactionId: String(provider.id),
            verifiedAt: now,
            processedAt: now,
          },
          { transaction },
        );
        await PaymentStateEvent.create(
          {
            paymentTransactionId: paymentData.id,
            previousStatus: String(paymentData.status),
            nextStatus: 'succeeded',
            source: 'verification',
            metadata: {},
          },
          { transaction },
        );
        await booking.update(
          { status: 'confirmed', paymentStatus: 'paid', expiresAt: null },
          { transaction },
        );
        const apartment = await Apartment.findByPk(
          String(bookingData.apartmentId),
          { transaction },
        );
        let confirmationToken: string | undefined;
        if (apartment) {
          const apartmentValue = apartment.get({ plain: true }) as RecordLike;
          const schedule = resolveCancellationSchedule(
            {
              checkIn: String(bookingData.checkIn),
              acceptedPolicySnapshot: bookingData.acceptedPolicySnapshot,
            },
            {
              timezone: apartmentValue.timezone as string | null | undefined,
              checkInTime: apartmentValue.checkInTime as
                | string
                | null
                | undefined,
            },
            now,
          );
          const expiresAt =
            schedule.checkInAt.getTime() > now.getTime()
              ? schedule.checkInAt
              : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          confirmationToken = (
            await createCancellationToken(
              String(bookingData.id),
              expiresAt,
              transaction,
            )
          ).token;
        }
        return {
          status: 'succeeded',
          bookingStatus: 'confirmed',
          shouldRefund: false,
          confirmationToken,
          bookingId: String(bookingData.id),
        };
      }
      const existingMetadata =
        paymentData.providerMetadata &&
        typeof paymentData.providerMetadata === 'object'
          ? (paymentData.providerMetadata as RecordLike)
          : {};
      await payment.update(
        {
          status: 'refund_pending',
          providerTransactionId: String(provider.id),
          verifiedAt: now,
          processedAt: now,
          providerMetadata: {
            ...existingMetadata,
            refundRequestStartedAt: now.toISOString(),
          },
        },
        { transaction },
      );
      await PaymentStateEvent.create(
        {
          paymentTransactionId: paymentData.id,
          previousStatus: String(paymentData.status),
          nextStatus: 'refund_pending',
          source: 'late_success',
          metadata: { bookingStatus: String(bookingData.status) },
        },
        { transaction },
      );
      if (
        bookingData.status === 'pending' ||
        bookingData.status === 'expired' ||
        bookingData.status === 'cancelled' ||
        bookingData.status === 'rejected'
      ) {
        const shouldExpire = bookingData.status === 'pending';
        await booking.update(
          {
            ...(shouldExpire ? { status: 'expired' } : {}),
            paymentStatus: 'refund_pending',
          },
          { transaction },
        );
      }
      return {
        status: 'refund_pending',
        bookingStatus: String(bookingData.status),
        shouldRefund: true,
      };
    },
  );
  if (update.shouldRefund) {
    try {
      const providerRefundResult = await client.refund(reference);
      const payment = await PaymentTransaction.findOne({
        where: { transactionReference: reference, provider: 'paystack' },
      });
      if (payment) {
        const metadata = payment.get('providerMetadata') as RecordLike;
        await payment.update({
          providerMetadata: {
            ...metadata,
            refundRequestAcknowledgedAt: new Date().toISOString(),
            refundRequestResultRecorded: Boolean(providerRefundResult),
          },
        });
      }
    } catch {
      // Keep the single refund request attempt recorded; an operator reviews it before retrying.
    }
  }
  if (update.confirmationToken && update.bookingId)
    void sendBookingConfirmationEmail(
      update.bookingId,
      update.confirmationToken,
    );
  return { status: update.status, bookingStatus: update.bookingStatus };
}

export async function handlePaystackWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  client: ProviderClient = defaultClient(),
) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret)
    throw new PaymentError(
      503,
      'PAYMENTS_NOT_CONFIGURED',
      'Payments are not available right now.',
    );
  if (!verifyPaystackSignature(rawBody, signature, secret))
    throw new PaymentError(
      401,
      'INVALID_WEBHOOK_SIGNATURE',
      'Webhook signature is invalid.',
    );
  let event: RecordLike;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as RecordLike;
  } catch {
    throw new PaymentError(
      400,
      'INVALID_WEBHOOK',
      'Webhook payload is invalid.',
    );
  }
  const eventType = typeof event.event === 'string' ? event.event : 'unknown';
  const data =
    event.data && typeof event.data === 'object'
      ? (event.data as RecordLike)
      : {};
  const transactionData =
    data.transaction &&
    typeof data.transaction === 'object' &&
    !Array.isArray(data.transaction)
      ? (data.transaction as RecordLike)
      : null;
  let reference =
    typeof data.reference === 'string'
      ? data.reference
      : typeof data.transaction_reference === 'string'
        ? data.transaction_reference
        : typeof transactionData?.reference === 'string'
          ? transactionData.reference
          : null;
  if (!reference && eventType.startsWith('refund.')) {
    const providerId =
      typeof data.id === 'string' || typeof data.id === 'number'
        ? String(data.id)
        : null;
    if (providerId) {
      const refund = await BookingRefund.findOne({
        where: { providerRefundId: providerId },
      });
      if (refund) reference = String(refund.get('providerReference'));
    }
  }
  const eventHash = sha256(rawBody);
  let eventRow: Model;
  try {
    eventRow = await PaymentWebhookEvent.create({
      eventHash,
      eventType: eventType.slice(0, 80),
      transactionReference: reference,
      processingStatus: 'received',
    });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    eventRow = (await PaymentWebhookEvent.findOne({
      where: { eventHash },
    })) as Model;
    if (!eventRow) throw error;
    if (
      (eventRow.get('processingStatus') as string) === 'processed' ||
      (eventRow.get('processingStatus') as string) === 'ignored'
    )
      return { duplicate: true };
  }
  if (
    !reference ||
    ![
      'charge.success',
      'refund.pending',
      'refund.processing',
      'refund.failed',
      'refund.processed',
    ].includes(eventType)
  ) {
    await eventRow.update({
      processingStatus: 'ignored',
      processedAt: new Date(),
    });
    return { duplicate: false, ignored: true };
  }
  if (eventType.startsWith('refund.')) {
    const payment = await PaymentTransaction.findOne({
      where: { transactionReference: reference, provider: 'paystack' },
    });
    if (!payment)
      throw new PaymentError(
        404,
        'PAYMENT_NOT_FOUND',
        'Payment could not be found.',
      );
    const paymentData = payment.get({ plain: true }) as RecordLike;
    const amount = data.amount;
    const eventAmount =
      typeof amount === 'number' ||
      (typeof amount === 'string' && /^\d+$/.test(amount))
        ? BigInt(amount)
        : -1n;
    const matches =
      eventAmount ===
        BigInt(
          toPaystackMinorUnits(paymentData.expectedAmount as string | number),
        ) &&
      typeof data.currency === 'string' &&
      data.currency.toUpperCase() ===
        String(paymentData.currency).toUpperCase() &&
      data.domain === (env.NODE_ENV === 'production' ? 'live' : 'test');
    if (!matches) {
      await markPaymentForManualReview(reference, 'refund_event_mismatch', {
        refundEvent: eventType,
      });
      const refund = await BookingRefund.findOne({
        where: { paymentTransactionId: String(paymentData.id) },
      });
      if (refund) {
        const change = await sequelize.transaction(async (transaction) =>
          updateRefundWithinTransaction(transaction, String(refund.get('id')), {
            status: 'failed',
            failureReason: 'refund_event_mismatch',
            processedAt: new Date(),
            source: 'paystack_webhook_mismatch',
          }),
        );
        if (change?.changed) {
          void sendRefundFailedEmail(change.refundId);
          void sendAdminRefundOutcomeEmail(change.refundId, 'failed');
        }
      }
      await eventRow.update({
        processingStatus: 'processed',
        processedAt: new Date(),
      });
      return { duplicate: false, processed: true, reviewRequired: true };
    }
    const refundChange = await sequelize.transaction(async (transaction) => {
      const lockedPayment = await PaymentTransaction.findByPk(
        String(paymentData.id),
        { transaction, lock: transaction.LOCK.UPDATE },
      );
      if (!lockedPayment)
        throw new PaymentError(
          404,
          'PAYMENT_NOT_FOUND',
          'Payment could not be found.',
        );
      const lockedData = lockedPayment.get({ plain: true }) as RecordLike;
      const refund = await BookingRefund.findOne({
        where: { paymentTransactionId: String(lockedData.id) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (refund) {
        const nextRefundStatus = mapProviderRefundStatus(
          eventType === 'refund.processed'
            ? 'processed'
            : eventType === 'refund.failed'
              ? 'failed'
              : 'processing',
        );
        const providerId =
          typeof data.id === 'string' || typeof data.id === 'number'
            ? String(data.id)
            : undefined;
        return updateRefundWithinTransaction(
          transaction,
          String(refund.get('id')),
          {
            status: nextRefundStatus,
            providerRefundId: providerId ?? null,
            metadata: {
              ...sanitizeRefundMetadata(data),
              lastRefundEvent: eventType,
            },
            failureReason:
              nextRefundStatus === 'failed'
                ? 'provider_reported_failure'
                : null,
            processedAt:
              nextRefundStatus === 'successful' || nextRefundStatus === 'failed'
                ? new Date()
                : null,
            source: 'paystack_webhook',
          },
        );
      }
      const booking = await Booking.findByPk(String(lockedData.bookingId), {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!booking)
        throw new PaymentError(
          404,
          'BOOKING_NOT_FOUND',
          'Booking could not be found.',
        );
      const nextStatus =
        eventType === 'refund.processed'
          ? 'refunded'
          : eventType === 'refund.failed'
            ? 'needs_review'
            : 'refund_pending';
      const previousStatus = String(lockedData.status);
      const terminalReview =
        previousStatus === 'refunded' ||
        (previousStatus === 'needs_review' && eventType !== 'refund.processed');
      if (!terminalReview && previousStatus !== nextStatus) {
        const metadata =
          lockedData.providerMetadata &&
          typeof lockedData.providerMetadata === 'object'
            ? (lockedData.providerMetadata as RecordLike)
            : {};
        await lockedPayment.update(
          {
            status: nextStatus,
            processedAt: ['refunded', 'needs_review'].includes(nextStatus)
              ? new Date()
              : lockedData.processedAt,
            providerMetadata: { ...metadata, lastRefundEvent: eventType },
          },
          { transaction },
        );
        await PaymentStateEvent.create(
          {
            paymentTransactionId: lockedData.id,
            previousStatus,
            nextStatus,
            source: 'paystack_webhook',
            metadata: { refundEvent: eventType },
          },
          { transaction },
        );
      }
      if (!terminalReview || eventType === 'refund.processed') {
        await booking.update(
          {
            paymentStatus:
              eventType === 'refund.processed'
                ? 'refunded'
                : eventType === 'refund.failed'
                  ? 'manual_review'
                  : 'refund_pending',
          },
          { transaction },
        );
      }
      return null;
    });
    if (refundChange?.changed) {
      if (refundChange.nextStatus === 'successful') {
        void sendRefundSuccessfulEmail(refundChange.refundId);
        void sendAdminRefundOutcomeEmail(refundChange.refundId, 'successful');
      }
      if (refundChange.nextStatus === 'failed') {
        void sendRefundFailedEmail(refundChange.refundId);
        void sendAdminRefundOutcomeEmail(refundChange.refundId, 'failed');
      }
    }
    await eventRow.update({
      processingStatus: 'processed',
      processedAt: new Date(),
    });
    return { duplicate: false, processed: true };
  }
  const payment = await PaymentTransaction.findOne({
    where: { transactionReference: reference, provider: 'paystack' },
  });
  if (!payment)
    throw new PaymentError(
      404,
      'PAYMENT_NOT_FOUND',
      'Payment could not be found.',
    );
  const p = payment.get({ plain: true }) as RecordLike;
  const booking = (await Booking.findByPk(String(p.bookingId), {
    include: [{ model: Guest, as: 'guest' }],
  })) as Model | null;
  const bookingData = booking?.get({ plain: true }) as
    | (RecordLike & { guest?: RecordLike })
    | undefined;
  if (!bookingData)
    throw new PaymentError(
      404,
      'BOOKING_NOT_FOUND',
      'Booking could not be found.',
    );
  const verified = await client.verify(reference);
  if (
    !verificationMatches(verified, p, String(bookingData.guest?.email ?? '')) ||
    verified.status !== 'success'
  ) {
    await markPaymentForManualReview(
      reference,
      'webhook_verification_mismatch',
    );
    await eventRow.update({
      processingStatus: 'processed',
      processedAt: new Date(),
    });
    return { duplicate: false, processed: true, reviewRequired: true };
  }
  await processVerifiedTransaction(reference, verified, client);
  await eventRow.update({
    processingStatus: 'processed',
    processedAt: new Date(),
  });
  return { duplicate: false, processed: true };
}

export async function reconcileStalePayments(
  client: ProviderClient = defaultClient(),
) {
  const cutoff = new Date(
    Date.now() - env.PAYMENT_RECONCILIATION_AGE_MINUTES * 60_000,
  );
  const payments = await PaymentTransaction.findAll({
    where: {
      provider: 'paystack',
      status: {
        [Op.in]: ['initiated', 'pending', 'refund_pending', 'needs_review'],
      },
      createdAt: { [Op.lt]: cutoff },
    },
    limit: 100,
    order: [['createdAt', 'ASC']],
  });
  const results: Array<{ reference: string; status: string }> = [];
  for (const payment of payments) {
    const p = payment.get({ plain: true }) as RecordLike;
    if (p.status === 'needs_review') {
      results.push({
        reference: String(p.transactionReference),
        status: 'needs_review',
      });
      continue;
    }
    if (p.status === 'refund_pending') {
      // Do not submit duplicate refunds automatically. The operator checks Paystack's refund record.
      results.push({
        reference: String(p.transactionReference),
        status: 'refund_pending',
      });
      continue;
    }
    try {
      const provider = await client.verify(String(p.transactionReference));
      const booking = (await Booking.findByPk(String(p.bookingId), {
        include: [{ model: Guest, as: 'guest' }],
      })) as Model | null;
      const b = booking?.get({ plain: true }) as
        | (RecordLike & { guest?: RecordLike })
        | undefined;
      if (
        !b ||
        !verificationMatches(provider, p, String(b.guest?.email ?? ''))
      ) {
        await markPaymentForManualReview(
          String(p.transactionReference),
          'reconciliation_mismatch',
        );
        results.push({
          reference: String(p.transactionReference),
          status: 'needs_review',
        });
        continue;
      }
      const outcome =
        provider.status === 'success'
          ? await processVerifiedTransaction(
              String(p.transactionReference),
              provider,
              client,
            )
          : provider.status === 'failed' || provider.status === 'abandoned'
            ? await processVerifiedTransaction(
                String(p.transactionReference),
                provider,
                client,
              )
            : { status: 'pending' };
      results.push({
        reference: String(p.transactionReference),
        status: outcome.status,
      });
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      results.push({
        reference: String(p.transactionReference),
        status: 'retry_required',
      });
    }
  }
  return results;
}
