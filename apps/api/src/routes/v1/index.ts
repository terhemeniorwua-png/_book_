import { Router } from 'express';
import { apartmentsRouter } from './apartments.routes.js';
import { bookingsRouter } from './bookings.routes.js';
import { paymentsRouter } from './payments.routes.js';
import { adminRouter } from './admin.routes.js';
import { cancellationsRouter } from './cancellations.routes.js';
import { authRouter } from './auth.routes.js';

export const apiRouter = Router();
apiRouter.get('/', (_request, response) =>
  response.json({ name: 'apartment-booking-api', version: 1 }),
);
apiRouter.use('/apartments', apartmentsRouter);
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/cancellations', cancellationsRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
