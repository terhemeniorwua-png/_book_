import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Joi from 'joi';
import {
  Model,
  Op,
  type IncludeOptions,
  type Order,
  type WhereOptions,
} from 'sequelize';
import { env } from '../config/env.js';
import {
  Amenity,
  Apartment,
  ApartmentCharge,
  ApartmentImage,
} from '../db/models/index.js';

const s3 = env.S3_BUCKET
  ? new S3Client({
      region: env.S3_REGION ?? 'us-east-1',
      ...(env.S3_ENDPOINT
        ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    })
  : undefined;

const apartmentAttributes = [
  'id',
  'slug',
  'name',
  'shortDescription',
  'fullDescription',
  'nightlyPrice',
  'currency',
  'bedrooms',
  'bathrooms',
  'maxGuests',
  'displayLocation',
  'locality',
  'region',
  'countryCode',
  'minStayNights',
  'maxStayNights',
  'houseRules',
  'checkInPolicy',
  'checkOutPolicy',
  'cancellationPolicy',
  'createdAt',
] as const;

function isSeededStockPhoto(objectKey: string) {
  return objectKey.startsWith('https://images.unsplash.com/');
}

function amenitiesInclude(slugs: string[] = []): IncludeOptions {
  return {
    model: Amenity,
    as: 'amenities',
    attributes: ['slug', 'name', 'iconKey'],
    through: { attributes: [] },
    ...(slugs.length
      ? { where: { slug: { [Op.in]: slugs } }, required: true }
      : {}),
  };
}

const imagesInclude: IncludeOptions = {
  model: ApartmentImage,
  as: 'images',
  attributes: ['id', 'objectKey', 'altText', 'position', 'isCover'],
  where: { isPublished: true },
  required: false,
  separate: true,
  order: [
    ['isCover', 'DESC'],
    ['position', 'ASC'],
    ['createdAt', 'ASC'],
  ] as Order,
};

function chargesInclude(): IncludeOptions {
  const today = new Date().toISOString().slice(0, 10);
  return {
    model: ApartmentCharge,
    as: 'charges',
    attributes: [
      'name',
      'chargeType',
      'calculationBasis',
      'amount',
      'currency',
      'isRequired',
    ],
    where: {
      isActive: true,
      [Op.and]: [
        { [Op.or]: [{ validFrom: null }, { validFrom: { [Op.lte]: today } }] },
        { [Op.or]: [{ validUntil: null }, { validUntil: { [Op.gt]: today } }] },
      ],
    },
    required: false,
  };
}

type CatalogFilters = {
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  guests?: number;
  location?: string;
  q?: string;
  amenities?: string;
  page: number;
  limit: number;
  sort: 'newest' | 'price_asc' | 'price_desc' | 'name';
};

function whereFor(filters: CatalogFilters): WhereOptions {
  const clauses: WhereOptions[] = [];
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    clauses.push({
      nightlyPrice: {
        ...(filters.minPrice !== undefined
          ? { [Op.gte]: filters.minPrice }
          : {}),
        ...(filters.maxPrice !== undefined
          ? { [Op.lte]: filters.maxPrice }
          : {}),
      },
    });
  }
  if (filters.bedrooms !== undefined)
    clauses.push({ bedrooms: { [Op.gte]: filters.bedrooms } });
  if (filters.guests !== undefined)
    clauses.push({ maxGuests: { [Op.gte]: filters.guests } });
  if (filters.location) {
    const term = `%${filters.location.replace(/[\\%_]/g, '\\$&')}%`;
    clauses.push({
      [Op.or]: [
        { displayLocation: { [Op.iLike]: term } },
        { locality: { [Op.iLike]: term } },
        { region: { [Op.iLike]: term } },
      ],
    });
  }
  if (filters.q) {
    const term = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    const searchConditions = [
      { name: { [Op.iLike]: term } },
      { shortDescription: { [Op.iLike]: term } },
      { displayLocation: { [Op.iLike]: term } },
    ];
    clauses.push({ [Op.or]: searchConditions });
  }
  return clauses.length ? { [Op.and]: clauses } : {};
}

function orderFor(sort: CatalogFilters['sort']): Order {
  if (sort === 'price_asc')
    return [
      ['nightlyPrice', 'ASC'],
      ['id', 'ASC'],
    ];
  if (sort === 'price_desc')
    return [
      ['nightlyPrice', 'DESC'],
      ['id', 'ASC'],
    ];
  if (sort === 'name')
    return [
      ['name', 'ASC'],
      ['id', 'ASC'],
    ];
  return [
    ['createdAt', 'DESC'],
    ['id', 'ASC'],
  ];
}

export async function signApartmentImage(objectKey: string): Promise<string | null> {
  // Seeded stock photography is served directly; the URL fragment is ignored by HTTP.
  if (isSeededStockPhoto(objectKey)) return objectKey;
  if (!s3 || !env.S3_BUCKET) return null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }),
    { expiresIn: 300 },
  );
}

async function serializeApartment(apartment: Model, detail: boolean) {
  const value = apartment.get({ plain: true }) as Record<string, unknown>;
  const images = (value.images ?? []) as Array<Record<string, unknown>>;
  const amenities = (value.amenities ?? []) as Array<Record<string, unknown>>;
  const charges = (value.charges ?? []) as Array<Record<string, unknown>>;
  const publishedImages = await Promise.all(
    images.map(async (image) => ({
      id: image.id,
      altText: image.altText,
      position: image.position,
      isCover: image.isCover,
      url: await signApartmentImage(String(image.objectKey)),
    })),
  );
  const cover =
    publishedImages.find((image) => image.isCover) ??
    publishedImages[0] ??
    null;
  const result = {
    id: value.id,
    slug: value.slug,
    name: value.name,
    shortDescription: value.shortDescription,
    nightlyPrice: value.nightlyPrice,
    currency: value.currency,
    bedrooms: value.bedrooms,
    bathrooms: value.bathrooms,
    maxGuests: value.maxGuests,
    displayLocation: value.displayLocation,
    locality: value.locality,
    region: value.region,
    countryCode: value.countryCode,
    minStayNights: value.minStayNights,
    maxStayNights: value.maxStayNights,
    coverImageUrl: cover?.url ?? null,
    coverImageAlt: cover?.altText ?? null,
    amenities: amenities.map((amenity: Record<string, unknown>) => ({
      slug: amenity.slug,
      name: amenity.name,
      iconKey: amenity.iconKey,
    })),
  };
  if (!detail) return result;
  return {
    ...result,
    fullDescription: value.fullDescription,
    images: publishedImages,
    pricing: {
      nightlyPrice: value.nightlyPrice,
      currency: value.currency,
      minimumStayNights: value.minStayNights,
      maximumStayNights: value.maxStayNights,
      additionalCharges: charges.map((charge: Record<string, unknown>) => ({
        name: charge.name,
        type: charge.chargeType,
        calculationBasis: charge.calculationBasis,
        amount: charge.amount,
        currency: charge.currency,
        required: charge.isRequired,
      })),
    },
    houseRules: value.houseRules,
    checkInPolicy: value.checkInPolicy,
    checkOutPolicy: value.checkOutPolicy,
    cancellationPolicy: value.cancellationPolicy,
  };
}

export async function listPublicApartments(filters: CatalogFilters) {
  const amenitySlugs =
    filters.amenities
      ?.split(',')
      .map((slug) => slug.trim())
      .filter(Boolean) ?? [];
  const include = [amenitiesInclude(amenitySlugs), imagesInclude];

  const result = await Apartment.scope('public').findAndCountAll({
    attributes: [...apartmentAttributes],
    where: whereFor(filters),
    include,
    distinct: true,
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit,
    order: orderFor(filters.sort),
  });
  const items = await Promise.all(
    result.rows.map((row) => serializeApartment(row, false)),
  );
  const amenityRows = await Amenity.findAll({
    attributes: ['slug', 'name'],
    include: [
      {
        model: Apartment.scope('public'),
        as: 'apartments',
        attributes: [],
        required: true,
        through: { attributes: [] },
      },
    ],
    order: [['name', 'ASC']],
  });
  const total = result.count as number;
  return {
    items,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
    filters: {
      amenities: amenityRows.map((row) => ({
        slug: row.get('slug'),
        name: row.get('name'),
      })),
    },
  };
}

export async function getPublicApartment(slug: string) {
  const apartment = await Apartment.scope('public').findOne({
    where: { slug },
    attributes: [...apartmentAttributes],
    include: [amenitiesInclude(), imagesInclude, chargesInclude()],
  });
  return apartment ? serializeApartment(apartment, true) : null;
}

export const apartmentListQuerySchema = Joi.object({
  minPrice: Joi.number().min(0).max(1_000_000_000),
  maxPrice: Joi.number().min(0).max(1_000_000_000),
  bedrooms: Joi.number().integer().min(0).max(30),
  guests: Joi.number().integer().min(1).max(50),
  location: Joi.string().trim().min(1).max(120),
  q: Joi.string().trim().min(1).max(100),
  amenities: Joi.string()
    .trim()
    .max(800)
    .pattern(/^[a-z0-9-]+(?:,[a-z0-9-]+){0,9}$/i),
  page: Joi.number().integer().min(1).max(100_000).default(1),
  limit: Joi.number().integer().min(1).max(24).default(12),
  sort: Joi.string()
    .valid('newest', 'price_asc', 'price_desc', 'name')
    .default('newest'),
})
  .custom((value, helpers) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    )
      return helpers.error('any.invalid');
    return value;
  })
  .unknown(false);

export const apartmentSlugParamsSchema = Joi.object({
  slug: Joi.string()
    .trim()
    .min(1)
    .max(160)
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
    .required(),
}).unknown(false);
