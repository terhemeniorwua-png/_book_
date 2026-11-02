import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import Joi from 'joi';
import { Model, Op, UniqueConstraintError } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import { Booking, Guest, PaymentStateEvent, PaymentTransaction, PaymentWebhookEvent } from '../db/models/index.js';

type RecordLike = Record<string, unknown>;
type PaystackTransaction = {
  id: number | string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
  paid_at?: string | null;
};
type PaystackResponse<T> = { status: boolean; message?: string; data: T };
type ProviderClient = {
  initialize: (body: RecordLike) => Promise<{ authorization_url: string; access_code: string; reference: string }>;
  verify: (reference: string) => Promise<PaystackTransaction>;
  refund: (reference: string) => Promise<unknown>;
};

export class PaymentError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'PaymentError';
  }
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const idempotencySchema = Joi.string().trim().min(16).max(128).pattern(/^[A-Za-z0-9._:-]+$/).required();
export const paymentReferenceSchema = Joi.object({ reference: Joi.string().trim().min(8).max(120).pattern(/^[A-Za-z0-9.=\-_]+$/).required() }).unknown(false);
export const paymentBookingParamsSchema = Joi.object({ bookingReference: Joi.string().pattern(/^AB-[A-F0-9]{14}$/).required() }).unknown(false);

function minorUnits(value: string | number) {
  const amount = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new PaymentError(409, 'INVALID_BOOKING_AMOUNT', 'This booking cannot be paid at this time.');
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new PaymentError(409, 'INVALID_BOOKING_AMOUNT', 'This booking cannot be paid at this time.');
  return Number(minor);
}

export function verifyPaystackSignature(rawBody: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createPaystackClient(secretKey: string, fetcher: typeof fetch = fetch): ProviderClient {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`https://api.paystack.co${path}`, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json', ...init.headers },
      });
    } catch {
      throw new PaymentError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment service is temporarily unavailable. Try again shortly.');
    }
    let payload: PaystackResponse<T>;
    try { payload = await response.json() as PaystackResponse<T>; } catch {
      throw new PaymentError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment service is temporarily unavailable. Try again shortly.');
    }
    if (!response.ok || payload.status !== true) throw new PaymentError(502, 'PAYMENT_PROVIDER_REJECTED', 'Payment service could not process this request.');
    return payload.data;
  }
  return {
    initialize: (body) => request('/transaction/initialize', { method: 'POST', body: JSON.stringify(body) }),
    verify: (reference) => request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' }),
    refund: (reference) => request('/refund', { method: 'POST', body: JSON.stringify({ transaction: reference }) }),
  };
}

const defaultClient = () => {
  if (!env.PAYSTACK_SECRET_KEY) throw new PaymentError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not available right now.');
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
  if (!match) throw new PaymentError(401, 'BOOKING_ACCESS_REQUIRED', 'A valid booking access token is required.');
  return match[1]!;
}

export function validatePaymentIdempotencyKey(value: string | undefined) {
  const { error, value: key } = idempotencySchema.validate(value);
  if (error) throw new PaymentError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid payment attempt key is required.');
  return key as string;
}

function paymentAccessUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try { return new URL(value).hostname === 'checkout.paystack.com' && new URL(value).protocol === 'https:'; } catch { return false; }
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
      const booking = await Booking.findOne({
        where: { bookingReference }, include: [{ model: Guest, as: 'guest' }], transaction, lock: transaction.LOCK.UPDATE,
      }) as Model | null;
      const bookingData = booking?.get({ plain: true }) as (RecordLike & { guest?: RecordLike }) | undefined;
      if (!bookingData || !accessTokenMatches(token, bookingData.accessTokenHash as string | null)) throw new PaymentError(404, 'BOOKING_NOT_FOUND', 'Booking could not be found.');
      if (bookingData.status !== 'pending' || !bookingData.expiresAt || Date.parse(String(bookingData.expiresAt)) <= Date.now()) throw new PaymentError(410, 'BOOKING_HOLD_EXPIRED', 'This reservation hold has expired. Start again to check availability.');
      const currency = String(bookingData.currency).toUpperCase();
      if (currency !== env.PAYSTACK_CURRENCY || currency !== 'NGN') throw new PaymentError(409, 'UNSUPPORTED_CURRENCY', 'This booking currency is not supported for online payment.');
      const byKey = await PaymentTransaction.findOne({ where: { idempotencyKeyHash }, transaction, lock: transaction.LOCK.UPDATE });
      if (byKey) {
        const existing = byKey.get({ plain: true }) as RecordLike;
        if (existing.bookingId !== bookingData.id || existing.provider !== 'paystack') throw new PaymentError(409, 'IDEMPOTENCY_CONFLICT', 'This payment attempt key has already been used.');
        attempt = byKey;
        guestEmail = String(bookingData.guest?.email ?? '');
        return { existing: true, authorizationUrl: existing.authorizationUrl };
      }
      if (bookingData.paymentStatus === 'paid' || bookingData.paymentStatus === 'refund_pending' || bookingData.paymentStatus === 'refunded') throw new PaymentError(409, 'BOOKING_NOT_PAYABLE', 'This reservation is not eligible for payment.');
      const reference = `staywell_${randomBytes(18).toString('hex')}`;
      attempt = await PaymentTransaction.create({
        bookingId: bookingData.id,
        provider: 'paystack',
        transactionReference: reference,
        expectedAmount: bookingData.totalAmount,
        currency,
        status: 'initiated',
        idempotencyKeyHash,
        providerMetadata: {},
      }, { transaction });
      await PaymentStateEvent.create({ paymentTransactionId: attempt.get('id'), previousStatus: null, nextStatus: 'initiated', source: 'checkout', metadata: {} }, { transaction });
      await booking.update({ paymentStatus: 'pending' }, { transaction });
      guestEmail = String(bookingData.guest?.email ?? '');
      if (callbackUrl) {
        const callback = new URL(callbackUrl);
        callback.searchParams.set('bookingReference', bookingReference);
        callbackUrl = callback.toString();
      }
      return { existing: false, authorizationUrl: null };
    });
    const attemptData = attempt!.get({ plain: true }) as RecordLike;
    if (result.existing && typeof result.authorizationUrl === 'string' && paymentAccessUrl(result.authorizationUrl)) {
      return { authorizationUrl: result.authorizationUrl, reference: String(attemptData.transactionReference), currency: String(attemptData.currency) };
    }
    if (result.existing) throw new PaymentError(409, 'PAYMENT_INITIALIZATION_PENDING', 'This payment attempt is still being prepared. Retry shortly.');
    const amount = minorUnits(attemptData.expectedAmount as string | number);
    const response = await client.initialize({
      email: guestEmail,
      amount: String(amount),
      currency: attemptData.currency,
      reference: attemptData.transactionReference,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      metadata: { booking_reference: bookingReference },
    });
    if (response.reference !== attemptData.transactionReference || !paymentAccessUrl(response.authorization_url)) throw new PaymentError(502, 'INVALID_PROVIDER_RESPONSE', 'Payment service returned an invalid checkout response.');
    await attempt!.update({ authorizationUrl: response.authorization_url, status: 'pending' });
    return { authorizationUrl: response.authorization_url, reference: response.reference, currency: String(attemptData.currency) };
  } catch (error) {
    if (error instanceof UniqueConstraintError) throw new PaymentError(409, 'PAYMENT_ATTEMPT_CONFLICT', 'A payment attempt is already being prepared. Retry shortly.');
    throw error;
  }
}

function verificationMatches(provider: PaystackTransaction, payment: RecordLike, guestEmail: string) {
  return provider.reference === payment.transactionReference &&
    provider.amount === minorUnits(payment.expectedAmount as string | number) &&
    provider.currency.toUpperCase() === String(payment.currency).toUpperCase() &&
    Boolean(provider.customer?.email) && provider.customer!.email!.trim().toLowerCase() === guestEmail.trim().toLowerCase();
}

export async function verifyPaymentForBooking(
  reference: string,
  bookingReference: string,
  authorizationHeader: string,
  client: ProviderClient = defaultClient(),
) {
  const token = authorization(authorizationHeader);
  const initial = await PaymentTransaction.findOne({ where: { transactionReference: reference, provider: 'paystack' } });
  if (!initial) throw new PaymentError(404, 'PAYMENT_NOT_FOUND', 'Payment could not be found.');
  const initialData = initial.get({ plain: true }) as RecordLike;
  const booking = await Booking.findByPk(initialData.bookingId, { include: [{ model: Guest, as: 'guest' }] }) as Model | null;
  const bookingData = booking?.get({ plain: true }) as (RecordLike & { guest?: RecordLike }) | undefined;
  if (!bookingData || bookingData.bookingReference !== bookingReference || !accessTokenMatches(token, bookingData.accessTokenHash as string | null)) throw new PaymentError(404, 'PAYMENT_NOT_FOUND', 'Payment could not be found.');
  if (initialData.status === 'succeeded' || initialData.status === 'refunded') return { status: initialData.status, bookingStatus: bookingData.status };
  const provider = await client.verify(reference);
  if (!verificationMatches(provider, initialData, String(bookingData.guest?.email ?? ''))) {
    await initial.update({ status: 'needs_review', verifiedAt: new Date(), processedAt: new Date() });
    throw new PaymentError(409, 'PAYMENT_MISMATCH', 'Payment could not be verified for this reservation. Contact support.');
  }
  return processVerifiedTransaction(reference, provider, client);
}

async function processVerifiedTransaction(reference: string, provider: PaystackTransaction, client: ProviderClient = defaultClient()) {
  const update = await sequelize.transaction(async (transaction) => {
    const payment = await PaymentTransaction.findOne({ where: { transactionReference: reference, provider: 'paystack' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!payment) throw new PaymentError(404, 'PAYMENT_NOT_FOUND', 'Payment could not be found.');
    const paymentData = payment.get({ plain: true }) as RecordLike;
    const booking = await Booking.findByPk(paymentData.bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new PaymentError(404, 'BOOKING_NOT_FOUND', 'Booking could not be found.');
    const bookingData = booking.get({ plain: true }) as RecordLike;
    const now = new Date();
    if (provider.status !== 'success') {
      if (provider.status === 'failed' || provider.status === 'abandoned') {
        await payment.update({ status: provider.status, verifiedAt: now, processedAt: now, providerTransactionId: String(provider.id) }, { transaction });
        await PaymentStateEvent.create({ paymentTransactionId: paymentData.id, previousStatus: String(paymentData.status), nextStatus: provider.status, source: 'verification', metadata: {} }, { transaction });
        if (bookingData.status === 'pending' && bookingData.paymentStatus !== 'paid') await booking.update({ paymentStatus: 'failed' }, { transaction });
        return { status: provider.status, bookingStatus: String(bookingData.status), shouldRefund: false };
      }
      return { status: 'pending', bookingStatus: String(bookingData.status), shouldRefund: false };
    }
    if (paymentData.status === 'succeeded' || paymentData.status === 'refunded') return { status: String(paymentData.status), bookingStatus: String(bookingData.status), shouldRefund: false };
    const holdValid = bookingData.status === 'pending' && bookingData.expiresAt && Date.parse(String(bookingData.expiresAt)) > now.getTime();
    if (holdValid) {
      await payment.update({ status: 'succeeded', providerTransactionId: String(provider.id), verifiedAt: now, processedAt: now }, { transaction });
      await PaymentStateEvent.create({ paymentTransactionId: paymentData.id, previousStatus: String(paymentData.status), nextStatus: 'succeeded', source: 'verification', metadata: {} }, { transaction });
      await booking.update({ status: 'confirmed', paymentStatus: 'paid', expiresAt: null }, { transaction });
      return { status: 'succeeded', bookingStatus: 'confirmed', shouldRefund: false };
    }
    await payment.update({ status: 'refund_pending', providerTransactionId: String(provider.id), verifiedAt: now, processedAt: now }, { transaction });
    await PaymentStateEvent.create({ paymentTransactionId: paymentData.id, previousStatus: String(paymentData.status), nextStatus: 'refund_pending', source: 'late_success', metadata: { bookingStatus: String(bookingData.status) } }, { transaction });
    if (bookingData.status === 'pending' || bookingData.status === 'expired' || bookingData.status === 'cancelled' || bookingData.status === 'rejected') {
      await booking.update({ paymentStatus: 'refund_pending' }, { transaction });
    }
    return { status: 'refund_pending', bookingStatus: String(bookingData.status), shouldRefund: true };
  });
  if (update.shouldRefund) {
    try {
      await client.refund(reference);
    } catch {
      // Keep the verified charge in refund_pending for the operator reconciliation job.
    }
  }
  return { status: update.status, bookingStatus: update.bookingStatus };
}

export async function handlePaystackWebhook(rawBody: Buffer, signature: string | undefined, client: ProviderClient = defaultClient()) {
  const secret = env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new PaymentError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not available right now.');
  if (!verifyPaystackSignature(rawBody, signature, secret)) throw new PaymentError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid.');
  let event: RecordLike;
  try { event = JSON.parse(rawBody.toString('utf8')) as RecordLike; } catch { throw new PaymentError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.'); }
  const eventType = typeof event.event === 'string' ? event.event : 'unknown';
  const data = event.data && typeof event.data === 'object' ? event.data as RecordLike : {};
  const reference = typeof data.reference === 'string' ? data.reference : null;
  const eventHash = sha256(rawBody);
  let eventRow: Model;
  try {
    eventRow = await PaymentWebhookEvent.create({ eventHash, eventType: eventType.slice(0, 80), transactionReference: reference, processingStatus: 'received' });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    eventRow = await PaymentWebhookEvent.findOne({ where: { eventHash } }) as Model;
    if (!eventRow) throw error;
    if ((eventRow.get('processingStatus') as string) === 'processed' || (eventRow.get('processingStatus') as string) === 'ignored') return { duplicate: true };
  }
  if (eventType !== 'charge.success' || !reference) {
    await eventRow.update({ processingStatus: 'ignored', processedAt: new Date() });
    return { duplicate: false, ignored: true };
  }
  const payment = await PaymentTransaction.findOne({ where: { transactionReference: reference, provider: 'paystack' } });
  if (!payment) throw new PaymentError(404, 'PAYMENT_NOT_FOUND', 'Payment could not be found.');
  const p = payment.get({ plain: true }) as RecordLike;
  const booking = await Booking.findByPk(p.bookingId, { include: [{ model: Guest, as: 'guest' }] }) as Model | null;
  const bookingData = booking?.get({ plain: true }) as (RecordLike & { guest?: RecordLike }) | undefined;
  if (!bookingData) throw new PaymentError(404, 'BOOKING_NOT_FOUND', 'Booking could not be found.');
  const verified = await client.verify(reference);
  if (!verificationMatches(verified, p, String(bookingData.guest?.email ?? '')) || verified.status !== 'success') throw new PaymentError(409, 'PAYMENT_NOT_VERIFIED', 'Webhook transaction could not be independently verified.');
  await processVerifiedTransaction(reference, verified, client);
  await eventRow.update({ processingStatus: 'processed', processedAt: new Date() });
  return { duplicate: false, processed: true };
}

export async function reconcileStalePayments(client: ProviderClient = defaultClient()) {
  const cutoff = new Date(Date.now() - env.PAYMENT_RECONCILIATION_AGE_MINUTES * 60_000);
  const payments = await PaymentTransaction.findAll({
    where: { provider: 'paystack', status: { [Op.in]: ['initiated', 'pending', 'refund_pending', 'needs_review'] }, createdAt: { [Op.lt]: cutoff } },
    limit: 100,
    order: [['createdAt', 'ASC']],
  });
  const results: Array<{ reference: string; status: string }> = [];
  for (const payment of payments) {
    const p = payment.get({ plain: true }) as RecordLike;
    if (p.status === 'refund_pending') {
      try { await client.refund(String(p.transactionReference)); } catch { /* preserve pending for next retry */ }
      results.push({ reference: String(p.transactionReference), status: 'refund_pending' });
      continue;
    }
    try {
      const provider = await client.verify(String(p.transactionReference));
      const booking = await Booking.findByPk(p.bookingId, { include: [{ model: Guest, as: 'guest' }] }) as Model | null;
      const b = booking?.get({ plain: true }) as (RecordLike & { guest?: RecordLike }) | undefined;
      if (!b || !verificationMatches(provider, p, String(b.guest?.email ?? ''))) {
        await payment.update({ status: 'needs_review', verifiedAt: new Date(), processedAt: new Date() });
        results.push({ reference: String(p.transactionReference), status: 'needs_review' });
        continue;
      }
      const outcome = provider.status === 'success'
        ? await processVerifiedTransaction(String(p.transactionReference), provider, client)
        : provider.status === 'failed' || provider.status === 'abandoned'
          ? await processVerifiedTransaction(String(p.transactionReference), provider, client)
          : { status: 'pending' };
      results.push({ reference: String(p.transactionReference), status: outcome.status });
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      results.push({ reference: String(p.transactionReference), status: 'retry_required' });
    }
  }
  return results;
}
