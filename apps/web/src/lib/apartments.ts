import { z } from 'zod';

const amenitySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  iconKey: z.string().nullable().optional(),
});

const imageSchema = z.object({
  id: z.string().min(1),
  altText: z.string().min(1),
  position: z.number().int().nonnegative(),
  isCover: z.boolean(),
  url: z.string().url().nullable(),
});

const summarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  shortDescription: z.string(),
  nightlyPrice: z.union([z.string(), z.number()]),
  currency: z.string().length(3),
  bedrooms: z.number().int().nonnegative(),
  bathrooms: z.union([z.number(), z.string()]),
  maxGuests: z.number().int().positive(),
  displayLocation: z.string(),
  locality: z.string().nullable(),
  region: z.string().nullable(),
  countryCode: z.string().length(2),
  minStayNights: z.number().int().positive(),
  maxStayNights: z.number().int().positive().nullable(),
  coverImageUrl: z.string().url().nullable(),
  coverImageAlt: z.string().nullable(),
  amenities: z.array(amenitySchema),
});

const chargeSchema = z.object({
  name: z.string(),
  type: z.string(),
  calculationBasis: z.string(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().length(3),
  required: z.boolean(),
});

const detailSchema = summarySchema.extend({
  fullDescription: z.string(),
  images: z.array(imageSchema),
  pricing: z.object({
    nightlyPrice: z.union([z.string(), z.number()]),
    currency: z.string().length(3),
    minimumStayNights: z.number().int().positive(),
    maximumStayNights: z.number().int().positive().nullable(),
    additionalCharges: z.array(chargeSchema),
  }),
  houseRules: z.array(z.string()),
  checkInPolicy: z.string().nullable(),
  checkOutPolicy: z.string().nullable(),
  cancellationPolicy: z.string().nullable(),
});

const listingResponseSchema = z.object({
  items: z.array(summarySchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
  filters: z.object({ amenities: z.array(amenitySchema) }),
});

export type ApartmentSummary = z.infer<typeof summarySchema>;
export type ApartmentDetail = z.infer<typeof detailSchema>;
export type ApartmentAmenity = z.infer<typeof amenitySchema>;
export type ApartmentFilters = Record<string, string | string[] | undefined>;
export type ApartmentListResult = z.infer<typeof listingResponseSchema>;

const apartmentFilterSchema = z
  .object({
    minPrice: z
      .string()
      .regex(/^\d{1,10}(?:\.\d{1,2})?$/)
      .optional(),
    maxPrice: z
      .string()
      .regex(/^\d{1,10}(?:\.\d{1,2})?$/)
      .optional(),
    bedrooms: z
      .string()
      .regex(/^\d{1,2}$/)
      .optional(),
    guests: z
      .string()
      .regex(/^\d{1,2}$/)
      .optional(),
    location: z.string().trim().min(1).max(120).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    amenities: z
      .union([z.string().max(800), z.array(z.string().max(80)).max(10)])
      .optional(),
    page: z
      .string()
      .regex(/^\d{1,5}$/)
      .optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).optional(),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      Number(value.minPrice) <= Number(value.maxPrice),
  );

export function validateApartmentFilters(value: unknown) {
  return apartmentFilterSchema.safeParse(value);
}

export type FeaturedResult =
  | { status: 'success'; apartments: ApartmentSummary[] }
  | { status: 'empty' }
  | { status: 'unavailable' };

export function getApiBaseUrl() {
  return (
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:4000/api/v1'
  ).replace(/\/$/, '');
}

export function buildApartmentQuery(filters: ApartmentFilters) {
  const query = new URLSearchParams();
  for (const key of [
    'minPrice',
    'maxPrice',
    'bedrooms',
    'guests',
    'location',
    'q',
    'amenities',
    'page',
    'limit',
    'sort',
  ]) {
    const value = filters[key];
    if (Array.isArray(value) && key === 'amenities')
      query.set(key, value.join(','));
    else if (Array.isArray(value))
      value.forEach((item) => query.append(key, item));
    else if (typeof value === 'string' && value.trim())
      query.set(key, value.trim());
  }
  return query;
}

export async function getApartments(filters: ApartmentFilters = {}) {
  try {
    const query = buildApartmentQuery(filters);
    const response = await fetch(
      `${getApiBaseUrl()}/apartments${query.size ? `?${query}` : ''}`,
      {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return { status: 'unavailable' as const };
    const parsed = listingResponseSchema.safeParse(await response.json());
    return parsed.success
      ? { status: 'success' as const, data: parsed.data }
      : { status: 'unavailable' as const };
  } catch {
    return { status: 'unavailable' as const };
  }
}

export async function getApartment(slug: string) {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/apartments/${encodeURIComponent(slug)}`,
      {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status === 404) return { status: 'not-found' as const };
    if (!response.ok) return { status: 'unavailable' as const };
    const payload: unknown = await response.json();
    const item =
      payload && typeof payload === 'object'
        ? (payload as { item?: unknown }).item
        : undefined;
    const parsed = detailSchema.safeParse(item);
    return parsed.success
      ? { status: 'success' as const, apartment: parsed.data }
      : { status: 'unavailable' as const };
  } catch {
    return { status: 'unavailable' as const };
  }
}

export async function getFeaturedApartments(): Promise<FeaturedResult> {
  const result = await getApartments({ limit: '3' });
  if (result.status === 'unavailable') return result;
  return result.data.items.length
    ? { status: 'success', apartments: result.data.items.slice(0, 3) }
    : { status: 'empty' };
}
