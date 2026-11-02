import { Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  apartmentListQuerySchema,
  apartmentSlugParamsSchema,
  getPublicApartment,
  listPublicApartments,
} from '../../services/apartment-catalog.js';
import {
  apartmentQuoteParamsSchema,
  apartmentQuoteQuerySchema,
  availabilityParamsSchema,
  availabilityQuerySchema,
  getApartmentAvailability,
  getApartmentQuote,
} from '../../services/booking-checkout.js';

export const apartmentsRouter = Router();

apartmentsRouter.get(
  '/',
  validateRequest({ query: apartmentListQuerySchema }),
  async (request, response, next) => {
    try {
      const query = request.query as unknown as Parameters<
        typeof listPublicApartments
      >[0];
      response.json(await listPublicApartments(query));
    } catch (error) {
      next(error);
    }
  },
);

apartmentsRouter.get(
  '/:apartmentId/availability',
  validateRequest({
    params: availabilityParamsSchema,
    query: availabilityQuerySchema,
  }),
  async (request, response, next) => {
    try {
      const query = request.query as { from: string; to: string };
      response.json(
        await getApartmentAvailability(
          String(request.params.apartmentId),
          query.from,
          query.to,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

apartmentsRouter.get(
  '/:apartmentId/quote',
  validateRequest({
    params: apartmentQuoteParamsSchema,
    query: apartmentQuoteQuerySchema,
  }),
  async (request, response, next) => {
    try {
      const query = request.query as unknown as {
        checkIn: string;
        checkOut: string;
        guestCount: number;
      };
      response.json(
        await getApartmentQuote(
          String(request.params.apartmentId),
          query.checkIn,
          query.checkOut,
          query.guestCount,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

apartmentsRouter.get(
  '/:slug',
  validateRequest({ params: apartmentSlugParamsSchema }),
  async (request, response, next) => {
    try {
      const apartment = await getPublicApartment(String(request.params.slug));
      if (!apartment) {
        response.status(404).json({
          error: {
            code: 'APARTMENT_NOT_FOUND',
            message: 'Apartment not found',
          },
        });
        return;
      }
      response.json({ item: apartment });
    } catch (error) {
      next(error);
    }
  },
);
