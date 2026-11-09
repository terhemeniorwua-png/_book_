import { Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  BookingFlowError,
  bookingReferenceParamsSchema,
  createBooking,
  createBookingBodySchema,
  getBookingCheckout,
  guestDetailsBodySchema,
  saveGuestDetails,
  validateBookingAccessHeader,
  validateBookingAttemptHeaders,
} from '../../services/booking-checkout.js';

export const bookingsRouter = Router();

bookingsRouter.post(
  '/',
  validateRequest({ body: createBookingBodySchema }),
  async (request, response, next) => {
    try {
      const attempt = validateBookingAttemptHeaders(
        request.get('Idempotency-Key'),
        request.get('Authorization'),
      );
      const result = await createBooking(
        request.body as Parameters<typeof createBooking>[0],
        attempt,
      );
      const status = result.replayed ? 200 : 201;
      response.status(status).json({ ...result, replayed: undefined });
    } catch (error) {
      next(error);
    }
  },
);

bookingsRouter.get(
  '/:bookingReference/checkout',
  validateRequest({ params: bookingReferenceParamsSchema }),
  async (request, response, next) => {
    try {
      const accessToken = validateBookingAccessHeader(
        request.get('Authorization'),
      );
      const checkout = await getBookingCheckout(
        String(request.params.bookingReference),
        accessToken,
      );
      if (!checkout) {
        response.status(404).json({
          error: {
            code: 'BOOKING_NOT_FOUND',
            message: 'Booking could not be found',
          },
        });
        return;
      }
      if (
        checkout.status === 'expired' ||
        (checkout.status === 'pending' &&
          typeof checkout.expiresAt === 'string' &&
          Date.parse(checkout.expiresAt) <= Date.now())
      ) {
        response.status(410).json({
          error: {
            code: 'BOOKING_EXPIRED',
            message: 'This booking hold has expired',
          },
        });
        return;
      }
      response.json({ item: checkout });
    } catch (error) {
      if (error instanceof BookingFlowError && error.status === 404) {
        response.status(404).json({
          error: {
            code: 'BOOKING_NOT_FOUND',
            message: 'Booking could not be found',
          },
        });
        return;
      }
      next(error);
    }
  },
);

bookingsRouter.post(
  '/:bookingReference/guest-details',
  validateRequest({
    params: bookingReferenceParamsSchema,
    body: guestDetailsBodySchema,
  }),
  async (request, response, next) => {
    try {
      const accessToken = validateBookingAccessHeader(
        request.get('Authorization'),
      );
      await saveGuestDetails(
        String(request.params.bookingReference),
        accessToken,
        request.body as Parameters<typeof saveGuestDetails>[2],
      );
      response.json({ item: { guestDetailsComplete: true } });
    } catch (error) {
      next(error);
    }
  },
);
