import { randomUUID } from 'node:crypto';
import Joi from 'joi';
import {
  ExclusionConstraintError,
  type Includeable,
  Model,
  Op,
  Sequelize,
  UniqueConstraintError,
} from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import {
  AdminAuditEvent,
  AdminAccount,
  Amenity,
  Apartment,
  ApartmentCharge,
  ApartmentImage,
  AvailabilityBlock,
  Booking,
  BookingCancellation,
  BookingRefund,
  BookingStatusEvent,
  Guest,
  PaymentStateEvent,
  PaymentTransaction,
} from '../db/models/index.js';
import { createPaystackClient } from './paystack.js';
import { isValidTimeZone } from './cancellation-policy.js';
import {
  deleteApartmentImageObject,
  uploadApartmentImage,
} from './apartment-catalog.js';

type Row = Record<string, unknown>;
type AdminContext = { id: string; role: string };
const dateOnly = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      return helpers.error('any.invalid');
    return value;
  });
const decimalMoney = Joi.string().pattern(/^\d{1,10}(?:\.\d{1,2})?$/);

export class AdminDashboardError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminDashboardError';
  }
}

const commonApartment = {
  slug: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(160)
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: Joi.string().trim().min(2).max(180),
  shortDescription: Joi.string().trim().min(2).max(500),
  fullDescription: Joi.string().trim().min(2).max(20_000),
  nightlyPrice: decimalMoney,
  currency: Joi.string().uppercase().valid('NGN'),
  bedrooms: Joi.number().integer().min(0).max(30),
  bathrooms: Joi.number().min(0.5).max(30),
  maxGuests: Joi.number().integer().min(1).max(50),
  displayLocation: Joi.string().trim().min(2).max(180),
  addressLine1: Joi.string().trim().max(220).allow('', null),
  locality: Joi.string().trim().max(120).allow('', null),
  region: Joi.string().trim().max(120).allow('', null),
  countryCode: Joi.string().uppercase().length(2),
  status: Joi.string().valid('draft', 'published', 'archived'),
  minStayNights: Joi.number().integer().min(1).max(365),
  maxStayNights: Joi.number().integer().min(1).max(365).allow(null),
  houseRules: Joi.array().items(Joi.string().trim().min(1).max(300)).max(30),
  checkInPolicy: Joi.string().trim().max(2000).allow('', null),
  checkOutPolicy: Joi.string().trim().max(2000).allow('', null),
  cancellationPolicy: Joi.string().trim().max(5000).allow('', null),
  timezone: Joi.string()
    .trim()
    .max(80)
    .allow(null, '')
    .custom((value, helpers) => {
      if (value === null || value === '') return value;
      return isValidTimeZone(value) ? value : helpers.error('any.invalid');
    }),
  checkInTime: Joi.string()
    .trim()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    .allow(null, ''),
  checkOutTime: Joi.string()
    .trim()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
    .allow(null, ''),
  amenityIds: Joi.array().items(Joi.string().uuid()).unique().max(50),
  charges: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().trim().min(2).max(120).required(),
        chargeType: Joi.string().valid('fee', 'tax').required(),
        calculationBasis: Joi.string()
          .valid(
            'flat',
            'per_night',
            'per_guest',
            'per_guest_per_night',
            'percentage',
          )
          .required(),
        amount: decimalMoney.required(),
        currency: Joi.string().uppercase().valid('NGN').required(),
        isRequired: Joi.boolean().default(true),
        isActive: Joi.boolean().default(true),
        validFrom: dateOnly.allow(null),
        validUntil: dateOnly.allow(null),
      }).unknown(false),
    )
    .max(30),
};

export const createApartmentSchema = Joi.object({
  ...commonApartment,
  slug: commonApartment.slug.required(),
  name: commonApartment.name.required(),
  shortDescription: commonApartment.shortDescription.required(),
  fullDescription: commonApartment.fullDescription.required(),
  nightlyPrice: commonApartment.nightlyPrice.required(),
  currency: commonApartment.currency.default('NGN'),
  bedrooms: commonApartment.bedrooms.required(),
  bathrooms: commonApartment.bathrooms.required(),
  maxGuests: commonApartment.maxGuests.required(),
  displayLocation: commonApartment.displayLocation.required(),
  countryCode: commonApartment.countryCode.default('NG'),
  status: commonApartment.status.default('draft'),
}).unknown(false);
export const updateApartmentSchema = Joi.object(commonApartment)
  .min(1)
  .unknown(false);
export const apartmentIdParamsSchema = Joi.object({
  apartmentId: Joi.string().uuid().required(),
}).unknown(false);
export const imageParamsSchema = Joi.object({
  apartmentId: Joi.string().uuid().required(),
  imageId: Joi.string().uuid().required(),
}).unknown(false);
export const imageUploadQuerySchema = Joi.object({
  altText: Joi.string().trim().min(3).max(300).required(),
  position: Joi.number().integer().min(0).max(100).default(0),
  cover: Joi.boolean().default(false),
  published: Joi.boolean().default(false),
}).unknown(false);
export const amenitySchema = Joi.object({
  slug: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(80)
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .required(),
  name: Joi.string().trim().min(2).max(100).required(),
  iconKey: Joi.string().trim().max(80).allow(null, ''),
}).unknown(false);
export const availabilityBlockSchema = Joi.object({
  apartmentId: Joi.string().uuid().required(),
  startDate: dateOnly.required(),
  endDate: dateOnly.required(),
  reason: Joi.string().trim().min(3).max(240).required(),
})
  .custom((value, helpers) => {
    if (value.startDate >= value.endDate) return helpers.error('any.invalid');
    return value;
  })
  .unknown(false);
export const bookingListQuerySchema = Joi.object({
  q: Joi.string().trim().max(120),
  status: Joi.string().valid(
    'pending',
    'confirmed',
    'cancellation_requested',
    'checked_in',
    'completed',
    'cancelled',
    'expired',
    'rejected',
  ),
  paymentStatus: Joi.string().valid(
    'unpaid',
    'pending',
    'paid',
    'failed',
    'partially_refunded',
    'refund_pending',
    'refunded',
    'manual_review',
  ),
  checkInFrom: dateOnly,
  checkInTo: dateOnly,
  page: Joi.number().integer().min(1).max(100_000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
})
  .custom((value, helpers) =>
    value.checkInFrom && value.checkInTo && value.checkInFrom > value.checkInTo
      ? helpers.error('any.invalid')
      : value,
  )
  .unknown(false);
export const bookingIdParamsSchema = Joi.object({
  bookingId: Joi.string().uuid().required(),
}).unknown(false);
export const bookingStatusSchema = Joi.object({
  status: Joi.string()
    .valid('cancelled', 'rejected', 'checked_in', 'completed')
    .required(),
  reason: Joi.string().trim().min(8).max(500).required(),
}).unknown(false);
export const refundSchema = Joi.object({
  reason: Joi.string().trim().min(8).max(500).required(),
}).unknown(false);
export const paymentListQuerySchema = Joi.object({
  status: Joi.string().valid(
    'initiated',
    'pending',
    'succeeded',
    'failed',
    'cancelled',
    'abandoned',
    'refund_pending',
    'refunded',
    'needs_review',
  ),
  page: Joi.number().integer().min(1).max(100_000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
}).unknown(false);
export const auditQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(100_000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
}).unknown(false);

async function audit(
  admin: AdminContext,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Row = {},
  transaction?: import('sequelize').Transaction,
) {
  await AdminAuditEvent.create(
    { adminAccountId: admin.id, action, targetType, targetId, metadata },
    { transaction },
  );
}

async function setBookingAuditContext(
  admin: AdminContext,
  transaction: import('sequelize').Transaction,
) {
  await sequelize.query(
    "SELECT set_config('app.admin_id', :adminId, true), set_config('app.event_source', 'admin', true)",
    {
      replacements: { adminId: admin.id },
      transaction,
    },
  );
}

function plain(model: Model) {
  return model.get({ plain: true }) as Row;
}
function notFound(
  message = 'The requested administrator resource was not found.',
) {
  return new AdminDashboardError(404, 'ADMIN_RESOURCE_NOT_FOUND', message);
}

function serializeApartment(value: Row) {
  return {
    id: value.id,
    slug: value.slug,
    name: value.name,
    shortDescription: value.shortDescription,
    fullDescription: value.fullDescription,
    nightlyPrice: value.nightlyPrice,
    currency: value.currency,
    bedrooms: value.bedrooms,
    bathrooms: value.bathrooms,
    maxGuests: value.maxGuests,
    displayLocation: value.displayLocation,
    addressLine1: value.addressLine1,
    locality: value.locality,
    region: value.region,
    countryCode: value.countryCode,
    status: value.status,
    minStayNights: value.minStayNights,
    maxStayNights: value.maxStayNights,
    houseRules: value.houseRules,
    checkInPolicy: value.checkInPolicy,
    checkOutPolicy: value.checkOutPolicy,
    cancellationPolicy: value.cancellationPolicy,
    timezone: value.timezone,
    checkInTime: value.checkInTime,
    checkOutTime: value.checkOutTime,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    amenities: ((value.amenities ?? []) as Row[]).map((amenity) => ({
      id: amenity.id,
      slug: amenity.slug,
      name: amenity.name,
    })),
    images: ((value.images ?? []) as Row[]).map((image) => ({
      id: image.id,
      altText: image.altText,
      position: image.position,
      isCover: image.isCover,
      isPublished: image.isPublished,
    })),
    charges: ((value.charges ?? []) as Row[]).map((charge) => ({
      id: charge.id,
      name: charge.name,
      chargeType: charge.chargeType,
      calculationBasis: charge.calculationBasis,
      amount: charge.amount,
      currency: charge.currency,
      isRequired: charge.isRequired,
      isActive: charge.isActive,
      validFrom: charge.validFrom,
      validUntil: charge.validUntil,
    })),
  };
}

const apartmentAdminIncludes: Includeable[] = [
  { model: Amenity, as: 'amenities', through: { attributes: [] } },
  {
    model: ApartmentImage,
    as: 'images',
    attributes: ['id', 'altText', 'position', 'isCover', 'isPublished'],
  },
  { model: ApartmentCharge, as: 'charges' },
];

export async function listAdminApartments() {
  const rows = await Apartment.findAll({
    include: apartmentAdminIncludes,
    order: [['updatedAt', 'DESC']],
  });
  return rows.map((row) => serializeApartment(plain(row)));
}

export async function getAdminApartment(apartmentId: string) {
  const row = await Apartment.findByPk(apartmentId, {
    include: apartmentAdminIncludes,
  });
  if (!row) throw notFound('Apartment could not be found.');
  return serializeApartment(plain(row));
}

async function replaceAmenities(
  apartment: Model,
  amenityIds: string[],
  transaction: import('sequelize').Transaction,
) {
  const amenities = amenityIds.length
    ? await Amenity.findAll({
        where: { id: { [Op.in]: amenityIds } },
        transaction,
      })
    : [];
  if (amenities.length !== amenityIds.length)
    throw new AdminDashboardError(
      400,
      'UNKNOWN_AMENITY',
      'One or more selected amenities do not exist.',
    );
  await (
    apartment as Model & {
      setAmenities: (
        rows: Model[],
        options: { transaction: import('sequelize').Transaction },
      ) => Promise<void>;
    }
  ).setAmenities(amenities, { transaction });
}

async function replaceCharges(
  apartmentId: string,
  charges: Row[],
  transaction: import('sequelize').Transaction,
) {
  await ApartmentCharge.destroy({ where: { apartmentId }, transaction });
  if (charges.length)
    await ApartmentCharge.bulkCreate(
      charges.map((charge) => ({ ...charge, apartmentId })),
      { transaction },
    );
}

export async function createAdminApartment(input: Row, admin: AdminContext) {
  const values = { ...input };
  if (values.timezone === '') values.timezone = null;
  if (values.checkInTime === '') values.checkInTime = null;
  if (values.checkOutTime === '') values.checkOutTime = null;
  const amenityIds = (values.amenityIds ?? []) as string[];
  const charges = (values.charges ?? []) as Row[];
  delete values.amenityIds;
  delete values.charges;
  const apartment = await sequelize
    .transaction(async (transaction) => {
      const created = await Apartment.create(values, { transaction });
      await replaceAmenities(created, amenityIds, transaction);
      await replaceCharges(String(created.get('id')), charges, transaction);
      await audit(
        admin,
        'apartment.created',
        'apartment',
        String(created.get('id')),
        { slug: values.slug, status: values.status ?? 'draft' },
        transaction,
      );
      return created;
    })
    .catch((error: unknown) => {
      if (error instanceof UniqueConstraintError)
        throw new AdminDashboardError(
          409,
          'APARTMENT_SLUG_EXISTS',
          'An apartment with this slug already exists.',
        );
      throw error;
    });
  return getAdminApartment(String(apartment.get('id')));
}

export async function updateAdminApartment(
  apartmentId: string,
  input: Row,
  admin: AdminContext,
) {
  const values = { ...input };
  if (values.timezone === '') values.timezone = null;
  if (values.checkInTime === '') values.checkInTime = null;
  if (values.checkOutTime === '') values.checkOutTime = null;
  const amenityIds = values.amenityIds as string[] | undefined;
  const charges = values.charges as Row[] | undefined;
  delete values.amenityIds;
  delete values.charges;
  await sequelize
    .transaction(async (transaction) => {
      const apartment = await Apartment.findByPk(apartmentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!apartment) throw notFound('Apartment could not be found.');
      const before = plain(apartment);
      await apartment.update(values, { transaction });
      if (amenityIds)
        await replaceAmenities(apartment, amenityIds, transaction);
      if (charges) await replaceCharges(apartmentId, charges, transaction);
      await audit(
        admin,
        'apartment.updated',
        'apartment',
        apartmentId,
        {
          changedFields: Object.keys(values).sort(),
          ...(amenityIds ? { amenitiesChanged: true } : {}),
          ...(charges ? { chargesChanged: true } : {}),
          previousStatus: before.status,
          nextStatus: values.status ?? before.status,
        },
        transaction,
      );
    })
    .catch((error: unknown) => {
      if (error instanceof UniqueConstraintError)
        throw new AdminDashboardError(
          409,
          'APARTMENT_SLUG_EXISTS',
          'An apartment with this slug already exists.',
        );
      throw error;
    });
  return getAdminApartment(apartmentId);
}

export async function archiveAdminApartment(
  apartmentId: string,
  admin: AdminContext,
) {
  await sequelize.transaction(async (transaction) => {
    const apartment = await Apartment.findByPk(apartmentId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!apartment) throw notFound('Apartment could not be found.');
    await apartment.update({ status: 'archived' }, { transaction });
    await audit(
      admin,
      'apartment.archived',
      'apartment',
      apartmentId,
      {},
      transaction,
    );
  });
  return getAdminApartment(apartmentId);
}

export async function listAdminAmenities() {
  const rows = await Amenity.findAll({
    attributes: ['id', 'slug', 'name', 'iconKey'],
    order: [['name', 'ASC']],
  });
  return rows.map(plain);
}

export async function createAdminAmenity(input: Row, admin: AdminContext) {
  try {
    const amenity = await sequelize.transaction(async (transaction) => {
      const value = await Amenity.create(input, { transaction });
      await audit(
        admin,
        'amenity.created',
        'amenity',
        String(value.get('id')),
        { slug: input.slug },
        transaction,
      );
      return value;
    });
    return plain(amenity);
  } catch (error) {
    if (error instanceof UniqueConstraintError)
      throw new AdminDashboardError(
        409,
        'AMENITY_SLUG_EXISTS',
        'An amenity with this slug already exists.',
      );
    throw error;
  }
}

export async function uploadAdminApartmentImage(
  apartmentId: string,
  body: Buffer,
  contentType: string,
  metadata: Row,
  admin: AdminContext,
) {
  const types: Record<
    string,
    { extension: string; signature: (bytes: Buffer) => boolean }
  > = {
    'image/jpeg': {
      extension: 'jpg',
      signature: (bytes) =>
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff,
    },
    'image/png': {
      extension: 'png',
      signature: (bytes) =>
        bytes.length >= 8 &&
        bytes
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ),
    },
    'image/webp': {
      extension: 'webp',
      signature: (bytes) =>
        bytes.length >= 12 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP',
    },
  };
  const type = types[contentType];
  if (
    !type ||
    body.length < 12 ||
    body.length > 8 * 1024 * 1024 ||
    !type.signature(body)
  )
    throw new AdminDashboardError(
      400,
      'INVALID_IMAGE',
      'Upload a valid JPEG, PNG, or WebP image up to 8 MB.',
    );
  if (!(await Apartment.findByPk(apartmentId)))
    throw notFound('Apartment could not be found.');
  const objectKey = `apartments/${apartmentId}/${randomUUID()}.${type.extension}`;
  try {
    await uploadApartmentImage(objectKey, body, contentType);
  } catch {
    throw new AdminDashboardError(
      503,
      'IMAGE_STORAGE_UNAVAILABLE',
      'Image storage is not configured or is temporarily unavailable.',
    );
  }
  try {
    const image = await sequelize.transaction(async (transaction) => {
      if (metadata.cover)
        await ApartmentImage.update(
          { isCover: false },
          { where: { apartmentId }, transaction },
        );
      const value = await ApartmentImage.create(
        {
          apartmentId,
          objectKey,
          altText: metadata.altText,
          position: metadata.position,
          isCover: Boolean(metadata.cover),
          isPublished: Boolean(metadata.published),
        },
        { transaction },
      );
      await audit(
        admin,
        'apartment.image_uploaded',
        'apartment_image',
        String(value.get('id')),
        {
          apartmentId,
          contentType,
          bytes: body.length,
          published: Boolean(metadata.published),
        },
        transaction,
      );
      return value;
    });
    return {
      id: image.get('id'),
      altText: image.get('altText'),
      position: image.get('position'),
      isCover: image.get('isCover'),
      isPublished: image.get('isPublished'),
    };
  } catch (error) {
    await deleteApartmentImageObject(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function updateAdminApartmentImage(
  apartmentId: string,
  imageId: string,
  input: Row,
  admin: AdminContext,
) {
  return sequelize.transaction(async (transaction) => {
    const image = await ApartmentImage.findOne({
      where: { id: imageId, apartmentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!image) throw notFound('Apartment image could not be found.');
    if (input.isCover)
      await ApartmentImage.update(
        { isCover: false },
        { where: { apartmentId, id: { [Op.ne]: imageId } }, transaction },
      );
    await image.update(input, { transaction });
    await audit(
      admin,
      'apartment.image_updated',
      'apartment_image',
      imageId,
      { apartmentId, changedFields: Object.keys(input).sort() },
      transaction,
    );
    return {
      id: image.get('id'),
      altText: image.get('altText'),
      position: image.get('position'),
      isCover: image.get('isCover'),
      isPublished: image.get('isPublished'),
    };
  });
}

export async function deleteAdminApartmentImage(
  apartmentId: string,
  imageId: string,
  admin: AdminContext,
) {
  const objectKey = await sequelize.transaction(async (transaction) => {
    const image = await ApartmentImage.findOne({
      where: { id: imageId, apartmentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!image) throw notFound('Apartment image could not be found.');
    const key = String(image.get('objectKey'));
    await image.destroy({ transaction });
    await audit(
      admin,
      'apartment.image_deleted',
      'apartment_image',
      imageId,
      { apartmentId },
      transaction,
    );
    return key;
  });
  await deleteApartmentImageObject(objectKey).catch(() => undefined);
}

export async function createAvailabilityBlock(input: Row, admin: AdminContext) {
  try {
    return await sequelize.transaction(async (transaction) => {
      const apartment = await Apartment.findByPk(String(input.apartmentId), {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!apartment) throw notFound('Apartment could not be found.');
      const block = await AvailabilityBlock.create(
        { ...input, createdByAdminId: admin.id },
        { transaction },
      );
      await audit(
        admin,
        'availability.block_created',
        'availability_block',
        String(block.get('id')),
        {
          apartmentId: input.apartmentId,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason,
        },
        transaction,
      );
      return plain(block);
    });
  } catch (error) {
    if (error instanceof ExclusionConstraintError)
      throw new AdminDashboardError(
        409,
        'DATES_UNAVAILABLE',
        'These dates overlap an existing reservation or blocked period.',
      );
    throw error;
  }
}

export async function deleteAvailabilityBlock(
  blockId: string,
  admin: AdminContext,
) {
  return sequelize.transaction(async (transaction) => {
    const block = await AvailabilityBlock.findByPk(blockId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!block) throw notFound('Availability block could not be found.');
    const value = plain(block);
    await block.destroy({ transaction });
    await audit(
      admin,
      'availability.block_deleted',
      'availability_block',
      blockId,
      {
        apartmentId: value.apartmentId,
        startDate: value.startDate,
        endDate: value.endDate,
      },
      transaction,
    );
  });
}

export async function listAdminCalendar(query: Row) {
  const whereBlocks: Row = {
    startDate: { [Op.lt]: query.to },
    endDate: { [Op.gt]: query.from },
  };
  const whereBookings: Row = {
    checkIn: { [Op.lt]: query.to },
    checkOut: { [Op.gt]: query.from },
    status: { [Op.in]: ['pending', 'confirmed', 'checked_in'] },
  };
  if (query.apartmentId) {
    whereBlocks.apartmentId = query.apartmentId;
    whereBookings.apartmentId = query.apartmentId;
  }
  const [blocks, bookings] = await Promise.all([
    AvailabilityBlock.findAll({
      where: whereBlocks,
      order: [['startDate', 'ASC']],
    }),
    Booking.findAll({
      where: whereBookings,
      attributes: [
        'id',
        'bookingReference',
        'apartmentId',
        'checkIn',
        'checkOut',
        'status',
        'guestCount',
      ],
      order: [['checkIn', 'ASC']],
    }),
  ]);
  return { blocks: blocks.map(plain), reservations: bookings.map(plain) };
}

function bookingWhere(query: Row) {
  const where: Record<PropertyKey, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.checkInFrom || query.checkInTo)
    where.checkIn = {
      ...(query.checkInFrom ? { [Op.gte]: query.checkInFrom } : {}),
      ...(query.checkInTo ? { [Op.lte]: query.checkInTo } : {}),
    };
  if (query.q) {
    const term = `%${String(query.q).replace(/[\\%_]/g, '\\$&')}%`;
    where[Op.or] = [
      { bookingReference: { [Op.iLike]: term } },
      Sequelize.where(Sequelize.col('guest.email'), { [Op.iLike]: term }),
      Sequelize.where(
        Sequelize.fn(
          'concat',
          Sequelize.col('guest.first_name'),
          ' ',
          Sequelize.col('guest.last_name'),
        ),
        { [Op.iLike]: term },
      ),
      Sequelize.where(Sequelize.col('apartment.name'), { [Op.iLike]: term }),
    ];
  }
  return where;
}

const safePayment = (value: Row) => ({
  id: value.id,
  provider: value.provider,
  reference: value.transactionReference,
  amount: value.expectedAmount,
  currency: value.currency,
  status: value.status,
  providerTransactionId: value.providerTransactionId,
  verifiedAt: value.verifiedAt,
  processedAt: value.processedAt,
  createdAt: value.createdAt,
});
const safeBookingIncludes: Includeable[] = [
  {
    model: Guest,
    as: 'guest',
    attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
  },
  {
    model: Apartment,
    as: 'apartment',
    attributes: ['id', 'slug', 'name', 'displayLocation'],
  },
  {
    model: PaymentTransaction,
    as: 'paymentTransactions',
    attributes: [
      'id',
      'provider',
      'transactionReference',
      'providerTransactionId',
      'expectedAmount',
      'currency',
      'status',
      'verifiedAt',
      'processedAt',
      'createdAt',
    ],
    separate: true,
    order: [['createdAt', 'DESC']],
  },
  {
    model: BookingCancellation,
    as: 'cancellation',
    attributes: ['id', 'source', 'requestedAt', 'completedAt', 'deadlineAt'],
  },
  {
    model: BookingRefund,
    as: 'refund',
    attributes: [
      'id',
      'status',
      'amount',
      'currency',
      'policy',
      'provider',
      'providerReference',
      'providerRefundId',
      'failureReason',
      'attempts',
      'requestedAt',
      'lastAttemptAt',
      'processedAt',
    ],
  },
];

function serializeBooking(model: Model) {
  const value = plain(model);
  return {
    id: value.id,
    bookingReference: value.bookingReference,
    status: value.status,
    paymentStatus: value.paymentStatus,
    checkIn: value.checkIn,
    checkOut: value.checkOut,
    nights: value.nights,
    guestCount: value.guestCount,
    priceBreakdown: value.priceBreakdown,
    totalAmount: value.totalAmount,
    currency: value.currency,
    expiresAt: value.expiresAt,
    specialRequests: value.specialRequests,
    termsAcceptedAt: value.termsAcceptedAt,
    termsVersion: value.termsVersion,
    privacyNoticeAcknowledgedAt: value.privacyNoticeAcknowledgedAt,
    privacyNoticeVersion: value.privacyNoticeVersion,
    createdAt: value.createdAt,
    guest: value.guest,
    apartment: value.apartment,
    payments: ((value.paymentTransactions ?? []) as Row[]).map(safePayment),
    cancellation: value.cancellation ?? null,
    refund: value.refund ?? null,
  };
}

export async function listAdminBookings(query: Row) {
  const page = Number(query.page);
  const limit = Number(query.limit);
  const result = await Booking.findAndCountAll({
    where: bookingWhere(query),
    include: safeBookingIncludes,
    distinct: true,
    limit,
    offset: (page - 1) * limit,
    order: [['createdAt', 'DESC']],
  });
  return {
    items: result.rows.map(serializeBooking),
    pagination: {
      page,
      limit,
      total: result.count,
      totalPages: Math.ceil(result.count / limit),
    },
  };
}

export async function getAdminBooking(bookingId: string) {
  const model = await Booking.findByPk(bookingId, {
    include: safeBookingIncludes,
  });
  if (!model) throw notFound('Booking could not be found.');
  const statusEvents = await BookingStatusEvent.findAll({
    where: { bookingId },
    order: [['createdAt', 'ASC']],
  });
  const value = serializeBooking(model);
  return {
    ...value,
    statusEvents: statusEvents.map((event) => {
      const row = plain(event);
      return {
        previousStatus: row.previousStatus,
        nextStatus: row.nextStatus,
        source: row.source,
        createdAt: row.createdAt,
      };
    }),
  };
}

export async function transitionAdminBooking(
  bookingId: string,
  nextStatus: string,
  reason: string,
  admin: AdminContext,
) {
  try {
    await sequelize.transaction(async (transaction) => {
      await setBookingAuditContext(admin, transaction);
      const booking = await Booking.findByPk(bookingId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!booking) throw notFound('Booking could not be found.');
      const value = plain(booking);
      const allowed: Record<string, string[]> = {
        cancelled: ['pending', 'confirmed'],
        rejected: ['pending'],
        checked_in: ['confirmed'],
        completed: ['checked_in'],
      };
      if (!allowed[nextStatus]?.includes(String(value.status)))
        throw new AdminDashboardError(
          409,
          'BOOKING_TRANSITION_INVALID',
          'This booking cannot be moved to the requested state.',
        );
      if (
        nextStatus === 'checked_in' &&
        (value.paymentStatus !== 'paid' || value.status !== 'confirmed')
      )
        throw new AdminDashboardError(
          409,
          'BOOKING_NOT_PAID',
          'Only a confirmed, verified-paid booking can be checked in.',
        );
      if (
        nextStatus === 'rejected' &&
        ['paid', 'refund_pending', 'refunded'].includes(
          String(value.paymentStatus),
        )
      )
        throw new AdminDashboardError(
          409,
          'BOOKING_PAYMENT_REVIEW_REQUIRED',
          'This booking has payment activity and requires cancellation/refund review.',
        );
      await booking.update({ status: nextStatus }, { transaction });
      await audit(
        admin,
        `booking.${nextStatus}`,
        'booking',
        bookingId,
        {
          reason,
          bookingReference: value.bookingReference,
          previousStatus: value.status,
          nextStatus,
          paymentStatusUnchanged: value.paymentStatus,
        },
        transaction,
      );
    });
  } catch (error) {
    if (error instanceof ExclusionConstraintError)
      throw new AdminDashboardError(
        409,
        'DATES_UNAVAILABLE',
        'The reservation conflicts with current inventory.',
      );
    throw error;
  }
  return getAdminBooking(bookingId);
}

function dateInBookingZone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.BOOKING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const result = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${result.year}-${result.month}-${result.day}`;
}
function decimalToMinor(value: unknown) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return 0n;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}
function minorToDecimal(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export async function getAdminDashboardMetrics() {
  const today = dateInBookingZone();
  const [
    publishedApartments,
    totalBookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    upcomingCheckIns,
    upcomingCheckOuts,
    payments,
    gross,
    refunds,
  ] = await Promise.all([
    Apartment.count({ where: { status: 'published' } }),
    Booking.count(),
    Booking.count({ where: { status: 'pending' } }),
    Booking.count({ where: { status: 'confirmed' } }),
    Booking.count({ where: { status: 'cancelled' } }),
    Booking.count({
      where: { status: 'confirmed', checkIn: { [Op.gte]: today } },
    }),
    Booking.count({
      where: { status: 'confirmed', checkOut: { [Op.gte]: today } },
    }),
    PaymentTransaction.count({
      where: {
        status: { [Op.in]: ['succeeded', 'refund_pending', 'refunded'] },
        verifiedAt: { [Op.ne]: null },
      },
    }),
    PaymentTransaction.sum('expectedAmount', {
      where: {
        status: { [Op.in]: ['succeeded', 'refund_pending', 'refunded'] },
        verifiedAt: { [Op.ne]: null },
      },
    }),
    PaymentTransaction.sum('expectedAmount', {
      where: { status: 'refunded', verifiedAt: { [Op.ne]: null } },
    }),
  ]);
  const grossMinor = decimalToMinor(gross ?? '0');
  const refundMinor = decimalToMinor(refunds ?? '0');
  return {
    publishedApartments,
    totalBookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    verifiedPayments: payments,
    upcomingCheckIns,
    upcomingCheckOuts,
    revenue: {
      currency: env.PAYSTACK_CURRENCY,
      grossReceipts: minorToDecimal(grossMinor),
      completedRefunds: minorToDecimal(refundMinor),
      netReceipts: minorToDecimal(grossMinor - refundMinor),
      basis:
        'Verified Paystack transactions only; gross includes successful, refund-pending, and refunded charges; refunds are subtracted only after provider-confirmed refund completion. Manual-review payments are excluded.',
    },
  };
}

export async function listAdminPayments(query: Row) {
  const page = Number(query.page);
  const limit = Number(query.limit);
  const where = query.status ? { status: query.status } : {};
  const result = await PaymentTransaction.findAndCountAll({
    where,
    include: [
      {
        model: Booking,
        as: 'booking',
        attributes: [
          'id',
          'bookingReference',
          'status',
          'paymentStatus',
          'totalAmount',
          'currency',
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
      return { ...safePayment(value), booking: value.booking };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      totalPages: Math.ceil(result.count / limit),
    },
  };
}

export async function requestAdminRefund(
  bookingId: string,
  reason: string,
  admin: AdminContext,
) {
  if (!env.PAYSTACK_SECRET_KEY)
    throw new AdminDashboardError(
      503,
      'PAYMENTS_NOT_CONFIGURED',
      'Refund processing is not configured.',
    );
  const payment = await sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!booking) throw notFound('Booking could not be found.');
    const bookingValue = plain(booking);
    if (
      !['cancelled', 'expired', 'rejected'].includes(
        String(bookingValue.status),
      )
    )
      throw new AdminDashboardError(
        409,
        'REFUND_REQUIRES_CANCELLED_BOOKING',
        'Cancel the reservation before requesting a refund.',
      );
    const current = await PaymentTransaction.findOne({
      where: {
        bookingId,
        provider: 'paystack',
        status: 'succeeded',
        verifiedAt: { [Op.ne]: null },
      },
      order: [['createdAt', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current)
      throw new AdminDashboardError(
        409,
        'VERIFIED_PAYMENT_REQUIRED',
        'A verified, refundable Paystack payment was not found.',
      );
    const value = plain(current);
    await current.update(
      {
        status: 'refund_pending',
        processedAt: new Date(),
        providerMetadata: {
          ...(value.providerMetadata as Row),
          refundRequestStartedAt: new Date().toISOString(),
          refundRequestedBy: admin.id,
        },
      },
      { transaction },
    );
    await PaymentStateEvent.create(
      {
        paymentTransactionId: value.id,
        previousStatus: 'succeeded',
        nextStatus: 'refund_pending',
        source: 'admin_refund_request',
        metadata: { reason },
      },
      { transaction },
    );
    await booking.update({ paymentStatus: 'refund_pending' }, { transaction });
    await audit(
      admin,
      'payment.refund_requested',
      'payment_transaction',
      String(value.id),
      {
        bookingReference: bookingValue.bookingReference,
        paymentReference: value.transactionReference,
        amount: value.expectedAmount,
        currency: value.currency,
        reason,
      },
      transaction,
    );
    return {
      reference: String(value.transactionReference),
      id: String(value.id),
    };
  });
  try {
    await createPaystackClient(env.PAYSTACK_SECRET_KEY).refund(
      payment.reference,
    );
  } catch {
    throw new AdminDashboardError(
      502,
      'REFUND_PROVIDER_PENDING',
      'The refund request could not be confirmed. Its status remains pending; check Paystack before retrying.',
    );
  }
  return { status: 'refund_pending', reference: payment.reference };
}

export async function listAdminAuditEvents(query: Row) {
  const page = Number(query.page);
  const limit = Number(query.limit);
  const result = await AdminAuditEvent.findAndCountAll({
    include: [
      {
        model: AdminAccount,
        as: 'admin',
        attributes: ['id', 'email', 'displayName'],
      },
    ],
    limit,
    offset: (page - 1) * limit,
    order: [['createdAt', 'DESC']],
  });
  return {
    items: result.rows.map((model) => {
      const row = plain(model);
      return {
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
        administrator: row.admin
          ? {
              id: (row.admin as Row).id,
              email: (row.admin as Row).email,
              displayName: (row.admin as Row).displayName,
            }
          : null,
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
