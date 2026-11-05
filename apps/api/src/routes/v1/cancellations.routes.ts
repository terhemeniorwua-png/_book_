import { Router } from 'express';
import Joi from 'joi';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  confirmCancellation,
  getCancellationRequest,
  readCancellationTokenHeader,
} from '../../services/booking-cancellation.js';

export const cancellationsRouter = Router();
cancellationsRouter.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});

cancellationsRouter.get('/request', async (request, response, next) => {
  try {
    const token = readCancellationTokenHeader(
      request.get('x-cancellation-token'),
    );
    response.json({ item: await getCancellationRequest(token) });
  } catch (error) {
    next(error);
  }
});

cancellationsRouter.post(
  '/confirm',
  validateRequest({ body: Joi.object({}).unknown(false) }),
  async (request, response, next) => {
    try {
      const token = readCancellationTokenHeader(
        request.get('x-cancellation-token'),
      );
      response.json({ item: await confirmCancellation(token) });
    } catch (error) {
      next(error);
    }
  },
);
