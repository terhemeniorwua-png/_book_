import { z } from 'zod';

const validDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

export const staySelectionSchema = z
  .object({
    checkIn: z.string().refine(validDateOnly, 'Choose a valid check-in date.'),
    checkOut: z
      .string()
      .refine(validDateOnly, 'Choose a valid check-out date.'),
    guestCount: z.number().int().min(1).max(50),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: 'Check-out must be after check-in.',
    path: ['checkOut'],
  });

export const guestInformationSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.').max(160),
  email: z.string().trim().email('Enter a valid email address.').max(320),
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(32),
  specialRequests: z.string().trim().max(500).optional().default(''),
  acceptedTerms: z.literal(true, {
    error: 'Accept the booking terms to continue.',
  }),
});

export const bookingCreationSchema = z.object({
  bookingReference: z.string().regex(/^AB-[A-F0-9]{14}$/),
  status: z.string(),
  paymentStatus: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guestCount: z.number(),
  nights: z.number(),
  currency: z.string().length(3),
  totalAmount: z.string(),
  priceBreakdown: z.record(z.string(), z.unknown()),
  expiresAt: z.string(),
  accessToken: z.string().regex(/^[a-f0-9]{64}$/i),
  replayed: z.boolean().optional(),
});

const moneySchema = z.union([z.string(), z.number()]);
const priceBreakdownSchema = z.object({
  nightly: z.object({
    unitAmount: moneySchema,
    quantity: z.number(),
    lineTotal: moneySchema,
  }),
  charges: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      calculationBasis: z.string(),
      unitAmount: moneySchema,
      quantity: z.union([z.number(), z.string()]),
      lineTotal: moneySchema,
      currency: z.string(),
      required: z.boolean(),
    }),
  ),
  discounts: z
    .array(
      z.object({
        name: z.string().optional(),
        amount: moneySchema.optional(),
      }),
    )
    .catch([]),
  discountTotal: moneySchema,
  subtotal: moneySchema,
  total: moneySchema,
});

const bookingRulesSchema = z.object({
  minStayNights: z.number(),
  maxStayNights: z.number(),
  maxGuests: z.number(),
  checkInPolicy: z.string().nullable(),
  checkOutPolicy: z.string().nullable(),
});

const apartmentAvailabilitySchema = z.object({
  apartment: z.object({
    id: z.string().uuid(),
    name: z.string(),
    nightlyPrice: moneySchema,
    currency: z.string().length(3),
    ...bookingRulesSchema.shape,
  }),
  from: z.string(),
  to: z.string(),
  unavailableRanges: z.array(
    z.object({ startDate: z.string(), endDate: z.string() }),
  ),
});

const apartmentQuoteSchema = z.object({
  apartment: z.object({
    id: z.string().uuid(),
    name: z.string(),
    ...bookingRulesSchema.shape,
  }),
  checkIn: z.string(),
  checkOut: z.string(),
  guestCount: z.number(),
  nights: z.number(),
  nightlyPrice: moneySchema,
  currency: z.string().length(3),
  priceBreakdown: priceBreakdownSchema,
  totalAmount: moneySchema,
});

const checkoutSchema = z.object({
  bookingReference: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guestCount: z.number(),
  nights: z.number(),
  currency: z.string().length(3),
  totalAmount: moneySchema,
  expiresAt: z.string().nullable(),
  priceBreakdown: priceBreakdownSchema,
  apartment: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    displayLocation: z.string(),
    cancellationPolicy: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    imageAlt: z.string().nullable(),
  }),
  paymentTerms: z.string(),
});

export const paymentInitializationSchema = z.object({
  authorizationUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).hostname === 'checkout.paystack.com'),
  reference: z.string().min(8),
  currency: z.string().length(3),
});

export const paymentVerificationSchema = z.object({
  status: z.string(),
  bookingStatus: z.string(),
});

export type StaySelection = z.infer<typeof staySelectionSchema>;
export type GuestInformation = z.infer<typeof guestInformationSchema>;
export type BookingCheckout = z.infer<typeof checkoutSchema>;
export type ApartmentAvailability = z.infer<typeof apartmentAvailabilitySchema>;
export type ApartmentQuote = z.infer<typeof apartmentQuoteSchema>;

export function parseApartmentAvailability(value: unknown) {
  return apartmentAvailabilitySchema.safeParse(value);
}

export function parseApartmentQuote(value: unknown) {
  return apartmentQuoteSchema.safeParse(value);
}

export function parseBookingCreation(value: unknown) {
  return bookingCreationSchema.safeParse(value);
}

export function parseBookingCheckout(value: unknown) {
  return checkoutSchema.safeParse(value);
}

export function parsePaymentInitialization(value: unknown) {
  return paymentInitializationSchema.safeParse(value);
}

export function parsePaymentVerification(value: unknown) {
  return paymentVerificationSchema.safeParse(value);
}

export function createSecretHex() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
