import { Router } from 'express';
import Joi from 'joi';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  handlePaystackWebhook,
  initializePayment,
  paymentBookingParamsSchema,
  validatePaymentIdempotencyKey,
  verifyPaymentForBooking,
} from '../../services/paystack.js';

export const paymentsRouter = Router();
paymentsRouter.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});

paymentsRouter.post(
  '/bookings/:bookingReference/initialize',
  validateRequest({
    params: paymentBookingParamsSchema,
    body: Joi.object({}).unknown(false),
  }),
  async (request, response, next) => {
    try {
      const key = validatePaymentIdempotencyKey(request.get('Idempotency-Key'));
      const item = await initializePayment(
        String(request.params.bookingReference),
        request.get('Authorization') ?? '',
        key,
      );
      response.json({ item });
    } catch (error) {
      next(error);
    }
  },
);

paymentsRouter.post(
  '/verify',
  validateRequest({
    body: Joi.object({
      reference: Joi.string()
        .trim()
        .min(8)
        .max(120)
        .pattern(/^[A-Za-z0-9.=\-_]+$/)
        .required(),
      bookingReference: Joi.string()
        .pattern(/^AB-[A-F0-9]{14}$/)
        .required(),
    }).unknown(false),
  }),
  async (request, response, next) => {
    try {
      const result = await verifyPaymentForBooking(
        String(request.body.reference),
        String(request.body.bookingReference),
        request.get('Authorization') ?? '',
      );
      response.json({ item: result });
    } catch (error) {
      next(error);
    }
  },
);

paymentsRouter.post('/paystack/webhook', async (request, response, next) => {
  try {
    if (!Buffer.isBuffer(request.body)) {
      response.status(400).json({
        error: {
          code: 'INVALID_WEBHOOK',
          message: 'Webhook payload is invalid.',
        },
      });
      return;
    }
    const result = await handlePaystackWebhook(
      request.body,
      request.get('x-paystack-signature'),
    );
    response.status(200).json({ received: true, ...result });
  } catch (error) {
    next(error);
  }
});
