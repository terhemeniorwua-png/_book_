import { Router } from 'express';
import Joi from 'joi';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  GoogleIdentityError,
  verifyGoogleCredential,
} from '../../services/google-identity.js';

export const authRouter = Router();

const googleBodySchema = Joi.object({
  credential: Joi.string().min(20).max(4096).required(),
});

// Verifies a Google ID token and returns only the profile needed to prefill
// a guest booking form. No account or session is created.
authRouter.post(
  '/google/profile',
  validateRequest({ body: googleBodySchema }),
  async (request, response, next) => {
    try {
      const profile = await verifyGoogleCredential(
        (request.body as { credential: string }).credential,
      );
      response.set('Cache-Control', 'no-store').json({ item: profile });
    } catch (error) {
      if (error instanceof GoogleIdentityError) {
        response
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
        return;
      }
      next(error);
    }
  },
);
