import { Router } from 'express';

export const apiRouter = Router();
apiRouter.get('/', (_request, response) =>
  response.json({ name: 'apartment-booking-api', version: 1 }),
);
