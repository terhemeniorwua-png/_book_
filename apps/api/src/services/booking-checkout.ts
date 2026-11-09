import { createHash, timingSafeEqual } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import Joi from 'joi';
import { Model, Op, QueryTypes, UniqueConstraintError } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import {
  Apartment,
  ApartmentCharge,
  ApartmentImage,
  Booking,
  Guest,
} from '../db/models/index.js';
import { signApartmentImage } from './apartment-catalog.js';
import { guestDetailsComplete } from './guest-details.js';
import {
  isValidTimeZone,
  normalizeCheckInTime,
} from './cancellation-policy.js';

const MONEY_LIMIT_CENTS = 999_999_999_999n;
export const TERMS_VERSION = 'booking-terms-v1';
export const PRIVACY_NOTICE_VERSION = 'privacy-notice-v1';
const HOLD_MINUTES = 15;

export class BookingFlowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BookingFlowError';
  }
}

type BookingInput = {
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  fullName: string;
  email: string;
  phone?: string;
  specialRequests?: string;
  acceptedTerms?: true;
  acceptedTermsVersion?: typeof TERMS_VERSION;
  acceptedPrivacyNotice?: true;
  privacyNoticeVersion?: typeof PRIVACY_NOTICE_VERSION;
  deferGuestDetails?: boolean;
};

type Attempt = { idempotencyKey: string; accessToken: string };

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function cents(value: string | number) {
  const [whole = '0', fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

function decimal(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

function stayNights(checkIn: string, checkOut: string) {
  return (
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) /
    86_400_000
  );
}

function assertStayRules(
  property: Record<string, unknown>,
  checkIn: string,
  checkOut: string,
  guestCount: number,
) {
  const nights = stayNights(checkIn, checkOut);
  const minimumNights = Number(property.minStayNights);
  const maximumNights = property.maxStayNights
    ? Number(property.maxStayNights)
    : 365;
  if (
    checkIn < todayInBookingZone() ||
    nights < 1 ||
    nights > 365 ||
    guestCount < 1 ||
    guestCount > Number(property.maxGuests) ||
    nights < minimumNights ||
    nights > maximumNights
  ) {
    throw new BookingFlowError(
      'Choose dates, guest count, and stay length within this apartment’s booking rules.',
      400,
      'STAY_RULES_NOT_MET',
    );
  }
  return nights;
}

async function releaseExpiredHolds(
  apartmentId: string,
  transaction: import('sequelize').Transaction,
) {
  await Booking.update(
    { status: 'expired' },
    {
      where: {
        apartmentId,
        status: 'pending',
        expiresAt: { [Op.lte]: new Date() },
      },
      transaction,
    },
  );
}

async function stayIsUnavailable(
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  transaction: import('sequelize').Transaction,
) {
  const rows = await sequelize.query<{ unavailable: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM apartment_inventory_claims
       WHERE apartment_id = :apartmentId
         AND stay_dates && daterange(CAST(:checkIn AS date), CAST(:checkOut AS date), '[)')
     ) AS unavailable`,
    {
      replacements: { apartmentId, checkIn, checkOut },
      transaction,
      type: QueryTypes.SELECT,
    },
  );
  return rows[0]?.unavailable ?? false;
}

async function activePricingCharges(
  apartmentId: string,
  chargeDate: string,
  transaction: import('sequelize').Transaction,
) {
  const chargeModels = await ApartmentCharge.findAll({
    where: {
      apartmentId,
      isActive: true,
      [Op.and]: [
        {
          [Op.or]: [
            { validFrom: null },
            { validFrom: { [Op.lte]: chargeDate } },
          ],
        },
        {
          [Op.or]: [
            { validUntil: null },
            { validUntil: { [Op.gt]: chargeDate } },
          ],
        },
      ],
    },
    transaction,
    lock: transaction.LOCK.SHARE,
  });
  return chargeModels.map(
    (charge) => charge.get({ plain: true }) as Record<string, unknown>,
  );
}

function publicBookingRules(property: Record<string, unknown>) {
  return {
    minStayNights: Number(property.minStayNights),
    maxStayNights: property.maxStayNights
      ? Number(property.maxStayNights)
      : 365,
    maxGuests: Number(property.maxGuests),
    checkInPolicy: property.checkInPolicy ?? null,
    checkOutPolicy: property.checkOutPolicy ?? null,
  };
}

export async function getApartmentAvailability(
  apartmentId: string,
  from: string,
  to: string,
) {
  return sequelize.transaction(async (transaction) => {
    const apartment = await Apartment.scope('public').findByPk(apartmentId, {
      attributes: [
        'id',
        'name',
        'nightlyPrice',
        'currency',
        'maxGuests',
        'minStayNights',
        'maxStayNights',
        'checkInPolicy',
        'checkOutPolicy',
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!apartment)
      throw new BookingFlowError(
        'This apartment is not available for booking.',
        404,
        'APARTMENT_NOT_FOUND',
      );
    await releaseExpiredHolds(apartmentId, transaction);
    const claims = await sequelize.query<{
      startDate: string;
      endDate: string;
    }>(
      `SELECT lower(stay_dates)::text AS "startDate",
              upper(stay_dates)::text AS "endDate"
       FROM apartment_inventory_claims
       WHERE apartment_id = :apartmentId
         AND stay_dates && daterange(CAST(:from AS date), CAST(:to AS date), '[)')
       ORDER BY lower(stay_dates)`,
      {
        replacements: { apartmentId, from, to },
        transaction,
        type: QueryTypes.SELECT,
      },
    );
    const property = apartment.get({ plain: true }) as Record<string, unknown>;
    return {
      apartment: {
        id: property.id,
        name: property.name,
        nightlyPrice: property.nightlyPrice,
        currency: property.currency,
        ...publicBookingRules(property),
      },
      from,
      to,
      unavailableRanges: claims,
    };
  });
}

export async function getApartmentQuote(
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  guestCount: number,
) {
  return sequelize.transaction(async (transaction) => {
    const apartment = await Apartment.scope('public').findByPk(apartmentId, {
      attributes: [
        'id',
        'name',
        'nightlyPrice',
        'currency',
        'maxGuests',
        'minStayNights',
        'maxStayNights',
        'checkInPolicy',
        'checkOutPolicy',
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!apartment)
      throw new BookingFlowError(
        'This apartment is not available for booking.',
        404,
        'APARTMENT_NOT_FOUND',
      );
    await releaseExpiredHolds(apartmentId, transaction);
    const property = apartment.get({ plain: true }) as Record<string, unknown>;
    const nights = assertStayRules(property, checkIn, checkOut, guestCount);
    if (await stayIsUnavailable(apartmentId, checkIn, checkOut, transaction))
      throw new BookingFlowError(
        'The selected dates are not available.',
        409,
        'DATES_UNAVAILABLE',
      );
    const charges = await activePricingCharges(
      apartmentId,
      checkIn,
      transaction,
    );
    const price = parseTotalPrice(property, charges, nights, guestCount);
    return {
      apartment: {
        id: property.id,
        name: property.name,
        ...publicBookingRules(property),
      },
      checkIn,
      checkOut,
      guestCount,
      nights,
      nightlyPrice: price.breakdown.nightly.unitAmount,
      currency: price.currency,
      priceBreakdown: price.breakdown,
      totalAmount: decimal(price.total),
    };
  });
}

function todayInBookingZone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.BOOKING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function fingerprint(input: BookingInput) {
  return sha256(
    JSON.stringify({
      apartmentId: input.apartmentId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestCount: input.guestCount,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      specialRequests: input.specialRequests ?? '',
      acceptedTerms: input.acceptedTerms,
      acceptedTermsVersion: input.acceptedTermsVersion,
      acceptedPrivacyNotice: input.acceptedPrivacyNotice,
      privacyNoticeVersion: input.privacyNoticeVersion,
      ...(input.deferGuestDetails === true ? { deferGuestDetails: true } : {}),
    }),
  );
}

function parseTotalPrice(
  apartment: Record<string, unknown>,
  charges: Array<Record<string, unknown>>,
  nights: number,
  guests: number,
) {
  const currency = String(apartment.currency);
  const nightlyCents = cents(String(apartment.nightlyPrice));
  const subtotal = nightlyCents * BigInt(nights);
  const items = charges.map((charge) => {
    if (charge.currency !== currency) {
      throw new BookingFlowError(
        'Apartment pricing needs to be reviewed before booking.',
        409,
        'PRICING_UNAVAILABLE',
      );
    }
    const unit = cents(String(charge.amount));
    const basis = String(charge.calculationBasis);
    const quantity =
      basis === 'flat'
        ? 1
        : basis === 'per_night'
          ? nights
          : basis === 'per_guest'
            ? guests
            : basis === 'per_guest_per_night'
              ? guests * nights
              : 0;
    const lineTotal =
      basis === 'percentage'
        ? (subtotal * unit + 5_000n) / 10_000n
        : unit * BigInt(quantity);
    return {
      name: String(charge.name),
      type: String(charge.chargeType),
      calculationBasis: basis,
      unitAmount: decimal(unit),
      quantity: basis === 'percentage' ? `${String(charge.amount)}%` : quantity,
      lineTotal: decimal(lineTotal),
      currency,
      required: Boolean(charge.isRequired),
    };
  });
  const chargesTotal = items.reduce(
    (total, item) => total + cents(item.lineTotal),
    0n,
  );
  const total = subtotal + chargesTotal;
  if (total < 0n || total > MONEY_LIMIT_CENTS) {
    throw new BookingFlowError(
      'The selected stay cannot be priced. Please contact the property.',
      409,
      'PRICING_UNAVAILABLE',
    );
  }
  return {
    currency,
    total,
    breakdown: {
      nightly: {
        unitAmount: decimal(nightlyCents),
        quantity: nights,
        lineTotal: decimal(subtotal),
      },
      charges: items,
      discounts: [] as Array<never>,
      discountTotal: '0.00',
      subtotal: decimal(subtotal),
      total: decimal(total),
    },
  };
}

function safeBookingResult(booking: Model) {
  const value = booking.get({ plain: true }) as Record<string, unknown>;
  return {
    bookingReference: value.bookingReference,
    status: value.status,
    paymentStatus: value.paymentStatus,
    checkIn: value.checkIn,
    checkOut: value.checkOut,
    guestCount: value.guestCount,
    nights: value.nights,
    currency: value.currency,
    totalAmount: value.totalAmount,
    priceBreakdown: value.priceBreakdown,
    expiresAt: value.expiresAt,
  };
}

async function findIdempotentBooking(keyHash: string) {
  return Booking.findOne({ where: { idempotencyKeyHash: keyHash } });
}

function isTokenMatch(storedHash: unknown, token: string) {
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash))
    return false;
  const candidate = Buffer.from(sha256(token), 'hex');
  const saved = Buffer.from(storedHash, 'hex');
  return timingSafeEqual(saved, candidate);
}

async function resultForExisting(
  booking: Model,
  expectedFingerprint: string,
  accessToken: string,
) {
  const value = booking.get({ plain: true }) as Record<string, unknown>;
  if (
    value.requestFingerprint !== expectedFingerprint ||
    !isTokenMatch(value.accessTokenHash, accessToken)
  ) {
    throw new BookingFlowError(
      'This booking attempt cannot be reused with different details.',
      409,
      'IDEMPOTENCY_CONFLICT',
    );
  }
  return { ...safeBookingResult(booking), accessToken, replayed: true };
}

function normalizePhone(raw: string) {
  const digits = parsePhoneNumberFromString(raw.trim(), 'NG');
  if (!digits?.isValid()) {
    throw new BookingFlowError(
      'Enter a valid phone number, including its country code when needed.',
      400,
      'INVALID_PHONE',
    );
  }
  return digits.number;
}

export async function createBooking(rawInput: BookingInput, attempt: Attempt) {
  const deferred = rawInput.deferGuestDetails === true;
  const input = {
    ...rawInput,
    email: rawInput.email.trim().toLowerCase(),
    fullName: rawInput.fullName.trim().replace(/\s+/g, ' '),
    phone: deferred ? undefined : normalizePhone(rawInput.phone ?? ''),
    specialRequests: rawInput.specialRequests?.trim() || undefined,
  };
  const requestFingerprint = fingerprint(input);
  const idempotencyKeyHash = sha256(attempt.idempotencyKey);
  const accessTokenHash = sha256(attempt.accessToken);
  const alreadyCreated = await findIdempotentBooking(idempotencyKeyHash);
  if (alreadyCreated)
    return resultForExisting(
      alreadyCreated,
      requestFingerprint,
      attempt.accessToken,
    );

  const nights = stayNights(input.checkIn, input.checkOut);
  if (input.checkIn < todayInBookingZone() || nights < 1 || nights > 365) {
    throw new BookingFlowError(
      'Choose valid future check-in and check-out dates.',
      400,
      'INVALID_STAY_DATES',
    );
  }

  try {
    const booking = await sequelize.transaction(async (transaction) => {
      const apartment = await Apartment.scope('public').findByPk(
        input.apartmentId,
        { transaction, lock: transaction.LOCK.SHARE },
      );
      if (!apartment)
        throw new BookingFlowError(
          'This apartment is not available for booking.',
          404,
          'APARTMENT_NOT_FOUND',
        );
      const property = apartment.get({ plain: true }) as Record<
        string,
        unknown
      >;
      assertStayRules(
        property,
        input.checkIn,
        input.checkOut,
        input.guestCount,
      );
      await releaseExpiredHolds(input.apartmentId, transaction);
      if (
        await stayIsUnavailable(
          input.apartmentId,
          input.checkIn,
          input.checkOut,
          transaction,
        )
      ) {
        throw new BookingFlowError(
          'The selected dates are not available.',
          409,
          'DATES_UNAVAILABLE',
        );
      }

      const pricing = parseTotalPrice(
        property,
        await activePricingCharges(
          input.apartmentId,
          input.checkIn,
          transaction,
        ),
        nights,
        input.guestCount,
      );

      const [firstName, ...lastParts] = input.fullName.split(' ');
      const guest = await Guest.create(
        {
          firstName,
          lastName: lastParts.join(' ') || firstName,
          email: input.email,
          phone: input.phone ?? null,
        },
        { transaction },
      );
      return Booking.create(
        {
          apartmentId: input.apartmentId,
          guestId: guest.get('id'),
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guestCount: input.guestCount,
          nights,
          priceBreakdown: pricing.breakdown,
          totalAmount: decimal(pricing.total),
          currency: pricing.currency,
          status: 'pending',
          paymentStatus: 'unpaid',
          expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
          idempotencyKeyHash,
          accessTokenHash,
          requestFingerprint,
          specialRequests: input.specialRequests ?? null,
          termsAcceptedAt: deferred ? null : new Date(),
          termsVersion: deferred ? null : input.acceptedTermsVersion,
          privacyNoticeAcknowledgedAt: deferred ? null : new Date(),
          privacyNoticeVersion: deferred ? null : input.privacyNoticeVersion,
          acceptedPolicySnapshot: {
            checkInPolicy: property.checkInPolicy,
            checkOutPolicy: property.checkOutPolicy,
            cancellationPolicy: property.cancellationPolicy,
            houseRules: property.houseRules,
            timeZone: isValidTimeZone(property.timezone as string | null)
              ? property.timezone
              : env.BOOKING_TIME_ZONE,
            checkInTime: normalizeCheckInTime(
              property.checkInTime as string | null,
            ),
            checkOutTime:
              typeof property.checkOutTime === 'string'
                ? property.checkOutTime.slice(0, 5)
                : null,
          },
        },
        { transaction },
      );
    });
    return {
      ...safeBookingResult(booking),
      accessToken: attempt.accessToken,
      replayed: false,
    };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const racedBooking = await findIdempotentBooking(idempotencyKeyHash);
      if (racedBooking)
        return resultForExisting(
          racedBooking,
          requestFingerprint,
          attempt.accessToken,
        );
    }
    if ((error as { parent?: { code?: string } }).parent?.code === '23P01') {
      throw new BookingFlowError(
        'The selected dates are no longer available.',
        409,
        'DATES_UNAVAILABLE',
      );
    }
    throw error;
  }
}

export async function getBookingCheckout(
  bookingReference: string,
  accessToken: string,
) {
  const booking = await Booking.findOne({
    where: { bookingReference },
    include: [
      {
        model: Apartment,
        as: 'apartment',
        attributes: [
          'id',
          'slug',
          'name',
          'displayLocation',
          'cancellationPolicy',
        ],
      },
      { model: Guest, as: 'guest', attributes: ['phone'] },
    ],
  });
  const value = booking?.get({ plain: true }) as
    | Record<string, unknown>
    | undefined;
  if (!booking || !value || !isTokenMatch(value.accessTokenHash, accessToken))
    return null;

  const apartment = value.apartment as Record<string, unknown>;
  if (!apartment || typeof apartment.id !== 'string') return null;
  const image = await ApartmentImage.findOne({
    where: { apartmentId: apartment.id, isPublished: true, isCover: true },
    attributes: ['objectKey', 'altText'],
    order: [['position', 'ASC']],
  });
  const imageValue = image?.get({ plain: true }) as
    | Record<string, unknown>
    | undefined;
  return {
    ...safeBookingResult(booking),
    guestDetailsComplete: guestDetailsComplete(value),
    apartment: {
      id: apartment.id,
      name: apartment.name,
      slug: apartment.slug,
      displayLocation: apartment.displayLocation,
      cancellationPolicy: apartment.cancellationPolicy,
      imageUrl: imageValue
        ? await signApartmentImage(String(imageValue.objectKey))
        : null,
      imageAlt: imageValue?.altText ?? null,
    },
    paymentTerms: `Payment must be completed within ${HOLD_MINUTES} minutes to keep these dates reserved.`,
  };
}

const dateOnly = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      return helpers.error('date.format');
    return value;
  });

const whenDeferred = (schema: Joi.Schema) =>
  Joi.when('deferGuestDetails', {
    is: Joi.valid(true).required(),
    then: Joi.forbidden(),
    otherwise: schema.required(),
  });

export const createBookingBodySchema = Joi.object({
  apartmentId: Joi.string()
    .guid({ version: ['uuidv4', 'uuidv1', 'uuidv5'] })
    .required(),
  checkIn: dateOnly.required(),
  checkOut: dateOnly.required(),
  guestCount: Joi.number().integer().min(1).max(50).required(),
  fullName: Joi.string()
    .trim()
    .min(2)
    .max(160)
    .pattern(/^[^\u0000-\u001f\u007f]+$/)
    .required(),
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(320)
    .required(),
  deferGuestDetails: Joi.boolean().optional(),
  phone: whenDeferred(Joi.string().trim().min(7).max(32)),
  specialRequests: Joi.string().trim().max(500).allow('', null),
  acceptedTerms: whenDeferred(Joi.boolean().valid(true)),
  acceptedTermsVersion: whenDeferred(Joi.string().valid(TERMS_VERSION)),
  acceptedPrivacyNotice: whenDeferred(Joi.boolean().valid(true)),
  privacyNoticeVersion: whenDeferred(
    Joi.string().valid(PRIVACY_NOTICE_VERSION),
  ),
}).unknown(false);

export const bookingReferenceParamsSchema = Joi.object({
  bookingReference: Joi.string()
    .pattern(/^AB-[A-F0-9]{14}$/)
    .required(),
}).unknown(false);

const apartmentIdParamsSchema = Joi.object({
  apartmentId: Joi.string()
    .guid({ version: ['uuidv4', 'uuidv1', 'uuidv5'] })
    .required(),
}).unknown(false);

export const availabilityParamsSchema = apartmentIdParamsSchema;

export const availabilityQuerySchema = Joi.object({
  from: dateOnly.required(),
  to: dateOnly.required(),
})
  .custom((value, helpers) => {
    const days = stayNights(value.from, value.to);
    if (days < 1 || days > 366) return helpers.error('availability.window');
    return value;
  })
  .messages({
    'availability.window': 'Choose an availability window up to 366 days.',
  })
  .unknown(false);

export const apartmentQuoteParamsSchema = apartmentIdParamsSchema;

export const apartmentQuoteQuerySchema = Joi.object({
  checkIn: dateOnly.required(),
  checkOut: dateOnly.required(),
  guestCount: Joi.number().integer().min(1).max(50).required(),
}).unknown(false);

export function validateBookingAttemptHeaders(
  idempotencyKey: string | undefined,
  authorization: string | undefined,
) {
  const schema = Joi.object({
    idempotencyKey: Joi.string().hex().length(64).required(),
    accessToken: Joi.string().hex().length(64).required(),
  }).unknown(false);
  const tokenMatch = authorization?.match(/^Bearer ([a-fA-F0-9]{64})$/);
  const result = schema.validate({
    idempotencyKey,
    accessToken: tokenMatch?.[1],
  });
  if (result.error) {
    throw new BookingFlowError(
      'A valid booking attempt token is required.',
      400,
      'INVALID_BOOKING_TOKEN',
    );
  }
  return {
    idempotencyKey: result.value.idempotencyKey as string,
    accessToken: result.value.accessToken as string,
  };
}

export function validateBookingAccessHeader(authorization: string | undefined) {
  const tokenMatch = authorization?.match(/^Bearer ([a-fA-F0-9]{64})$/);
  if (!tokenMatch) {
    throw new BookingFlowError(
      'Booking access could not be verified.',
      404,
      'BOOKING_NOT_FOUND',
    );
  }
  return tokenMatch[1]!;
}

export const guestDetailsBodySchema = Joi.object({
  phone: Joi.string().trim().min(7).max(32).required(),
  acceptedTerms: Joi.boolean().valid(true).required(),
  acceptedTermsVersion: Joi.string().valid(TERMS_VERSION).required(),
  acceptedPrivacyNotice: Joi.boolean().valid(true).required(),
  privacyNoticeVersion: Joi.string().valid(PRIVACY_NOTICE_VERSION).required(),
}).unknown(false);

export async function saveGuestDetails(
  bookingReference: string,
  accessToken: string,
  input: {
    phone: string;
    acceptedTermsVersion: typeof TERMS_VERSION;
    privacyNoticeVersion: typeof PRIVACY_NOTICE_VERSION;
  },
) {
  const phone = normalizePhone(input.phone);
  await sequelize.transaction(async (transaction) => {
    const booking = await Booking.findOne({
      where: { bookingReference },
      include: [{ model: Guest, as: 'guest' }],
      transaction,
      lock: { level: transaction.LOCK.UPDATE, of: Booking },
    });
    const value = booking?.get({ plain: true }) as
      | Record<string, unknown>
      | undefined;
    if (!booking || !value || !isTokenMatch(value.accessTokenHash, accessToken))
      throw new BookingFlowError(
        'Booking could not be found',
        404,
        'BOOKING_NOT_FOUND',
      );
    if (
      value.status !== 'pending' ||
      !value.expiresAt ||
      Date.parse(String(value.expiresAt)) <= Date.now()
    )
      throw new BookingFlowError(
        'This booking hold has expired',
        410,
        'BOOKING_EXPIRED',
      );
    if (guestDetailsComplete(value)) return;
    await Guest.update(
      { phone },
      { where: { id: value.guestId as string }, transaction },
    );
    await booking.update(
      {
        termsAcceptedAt: new Date(),
        termsVersion: input.acceptedTermsVersion,
        privacyNoticeAcknowledgedAt: new Date(),
        privacyNoticeVersion: input.privacyNoticeVersion,
      },
      { transaction },
    );
  });
}
