import express, { Router } from 'express';
import Joi from 'joi';
import {
  requireAdmin,
  requireAdminCsrf,
  requireAdminRole,
  loginAdministrator,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  currentAdminSession,
  revokeAdminSession,
  adminLoginSchema,
} from '../../middleware/admin-auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  createApartmentSchema,
  updateApartmentSchema,
  apartmentIdParamsSchema,
  imageParamsSchema,
  imageUploadQuerySchema,
  amenitySchema,
  availabilityBlockSchema,
  bookingListQuerySchema,
  bookingIdParamsSchema,
  bookingStatusSchema,
  refundSchema,
  paymentListQuerySchema,
  auditQuerySchema,
  getAdminDashboardMetrics,
  listAdminApartments,
  getAdminApartment,
  createAdminApartment,
  updateAdminApartment,
  archiveAdminApartment,
  listAdminAmenities,
  createAdminAmenity,
  uploadAdminApartmentImage,
  updateAdminApartmentImage,
  deleteAdminApartmentImage,
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  listAdminCalendar,
  listAdminBookings,
  getAdminBooking,
  transitionAdminBooking,
  listAdminPayments,
  requestAdminRefund,
  listAdminAuditEvents,
} from '../../services/admin-dashboard.js';

export const adminRouter = Router();
adminRouter.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});
const emptyObject = Joi.object({}).unknown(false);
const calendarDate = Joi.string()
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
const calendarQuery = Joi.object({
  from: calendarDate.required(),
  to: calendarDate.required(),
  apartmentId: Joi.string().uuid(),
})
  .custom((value, helpers) =>
    value.from >= value.to ? helpers.error('any.invalid') : value,
  )
  .unknown(false);
const blockParams = Joi.object({
  blockId: Joi.string().uuid().required(),
}).unknown(false);

adminRouter.post(
  '/auth/login',
  validateRequest({ body: adminLoginSchema }),
  async (request, response, next) => {
    try {
      const result = await loginAdministrator(
        request.body.email,
        request.body.password,
      );
      setAdminSessionCookie(response, result.sessionToken, result.csrfToken);
      response.status(200).json({
        item: {
          admin: result.admin,
          csrfToken: result.csrfToken,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.use(requireAdmin);
adminRouter.get('/auth/session', async (request, response, next) => {
  try {
    response.json({ item: await currentAdminSession(request, response) });
  } catch (error) {
    next(error);
  }
});
adminRouter.post(
  '/auth/logout',
  requireAdminCsrf,
  async (_request, response, next) => {
    try {
      await revokeAdminSession(
        String(response.locals.adminSessionId),
        String((response.locals.admin as Record<string, unknown>).id),
      );
      clearAdminSessionCookie(response);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.use(requireAdminCsrf);
adminRouter.get('/dashboard', async (_request, response, next) => {
  try {
    response.json({ item: await getAdminDashboardMetrics() });
  } catch (error) {
    next(error);
  }
});
adminRouter.get('/apartments', async (_request, response, next) => {
  try {
    response.json({ items: await listAdminApartments() });
  } catch (error) {
    next(error);
  }
});
adminRouter.post(
  '/apartments',
  validateRequest({ body: createApartmentSchema }),
  async (request, response, next) => {
    try {
      response.status(201).json({
        item: await createAdminApartment(
          request.body,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get(
  '/apartments/:apartmentId',
  validateRequest({ params: apartmentIdParamsSchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await getAdminApartment(String(request.params.apartmentId)),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.patch(
  '/apartments/:apartmentId',
  validateRequest({
    params: apartmentIdParamsSchema,
    body: updateApartmentSchema,
  }),
  async (request, response, next) => {
    try {
      response.json({
        item: await updateAdminApartment(
          String(request.params.apartmentId),
          request.body,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.delete(
  '/apartments/:apartmentId',
  validateRequest({ params: apartmentIdParamsSchema, body: emptyObject }),
  async (request, response, next) => {
    try {
      response.json({
        item: await archiveAdminApartment(
          String(request.params.apartmentId),
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get('/amenities', async (_request, response, next) => {
  try {
    response.json({ items: await listAdminAmenities() });
  } catch (error) {
    next(error);
  }
});
adminRouter.post(
  '/amenities',
  validateRequest({ body: amenitySchema }),
  async (request, response, next) => {
    try {
      response.status(201).json({
        item: await createAdminAmenity(
          request.body,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.post(
  '/apartments/:apartmentId/images',
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    limit: '8mb',
  }),
  validateRequest({
    params: apartmentIdParamsSchema,
    query: imageUploadQuerySchema,
  }),
  async (request, response, next) => {
    try {
      const item = await uploadAdminApartmentImage(
        String(request.params.apartmentId),
        Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
        request.get('content-type')?.split(';')[0]?.trim() ?? '',
        request.query as Record<string, unknown>,
        response.locals.admin as { id: string; role: string },
      );
      response.status(201).json({ item });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.patch(
  '/apartments/:apartmentId/images/:imageId',
  validateRequest({
    params: imageParamsSchema,
    body: Joi.object({
      altText: Joi.string().trim().min(3).max(300),
      position: Joi.number().integer().min(0).max(100),
      isCover: Joi.boolean(),
      isPublished: Joi.boolean(),
    })
      .min(1)
      .unknown(false),
  }),
  async (request, response, next) => {
    try {
      response.json({
        item: await updateAdminApartmentImage(
          String(request.params.apartmentId),
          String(request.params.imageId),
          request.body,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.delete(
  '/apartments/:apartmentId/images/:imageId',
  validateRequest({ params: imageParamsSchema, body: emptyObject }),
  async (request, response, next) => {
    try {
      await deleteAdminApartmentImage(
        String(request.params.apartmentId),
        String(request.params.imageId),
        response.locals.admin as { id: string; role: string },
      );
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get(
  '/availability/calendar',
  validateRequest({ query: calendarQuery }),
  async (request, response, next) => {
    try {
      response.json({
        item: await listAdminCalendar(request.query as Record<string, unknown>),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.post(
  '/availability/blocks',
  validateRequest({ body: availabilityBlockSchema }),
  async (request, response, next) => {
    try {
      response.status(201).json({
        item: await createAvailabilityBlock(
          request.body,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.delete(
  '/availability/blocks/:blockId',
  validateRequest({ params: blockParams, body: emptyObject }),
  async (request, response, next) => {
    try {
      await deleteAvailabilityBlock(
        String(request.params.blockId),
        response.locals.admin as { id: string; role: string },
      );
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get(
  '/bookings',
  validateRequest({ query: bookingListQuerySchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await listAdminBookings(request.query as Record<string, unknown>),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get(
  '/bookings/:bookingId',
  validateRequest({ params: bookingIdParamsSchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await getAdminBooking(String(request.params.bookingId)),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.patch(
  '/bookings/:bookingId/status',
  validateRequest({ params: bookingIdParamsSchema, body: bookingStatusSchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await transitionAdminBooking(
          String(request.params.bookingId),
          request.body.status,
          request.body.reason,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.post(
  '/bookings/:bookingId/refund',
  requireAdminRole('superadmin'),
  validateRequest({ params: bookingIdParamsSchema, body: refundSchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await requestAdminRefund(
          String(request.params.bookingId),
          request.body.reason,
          response.locals.admin as { id: string; role: string },
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get(
  '/payments',
  validateRequest({ query: paymentListQuerySchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await listAdminPayments(request.query as Record<string, unknown>),
      });
    } catch (error) {
      next(error);
    }
  },
);
adminRouter.get(
  '/audit',
  validateRequest({ query: auditQuerySchema }),
  async (request, response, next) => {
    try {
      response.json({
        item: await listAdminAuditEvents(
          request.query as Record<string, unknown>,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
