import { createHash, randomBytes } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { BookingCancellationToken } from '../db/models/index.js';

export const CANCELLATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const CANCELLATION_TOKEN_PURPOSE = 'booking_cancellation';

export function hashCancellationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function isValidCancellationTokenShape(
  token: string | undefined,
): token is string {
  return typeof token === 'string' && CANCELLATION_TOKEN_PATTERN.test(token);
}

export function generateCancellationToken() {
  return randomBytes(32).toString('base64url');
}

export async function createCancellationToken(
  bookingId: string,
  expiresAt: Date,
  transaction?: Transaction,
) {
  const now = new Date();
  await BookingCancellationToken.update(
    { revokedAt: now },
    {
      where: {
        bookingId,
        purpose: CANCELLATION_TOKEN_PURPOSE,
        usedAt: null,
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      },
      transaction,
    },
  );
  const token = generateCancellationToken();
  const row = await BookingCancellationToken.create(
    {
      bookingId,
      tokenHash: hashCancellationToken(token),
      purpose: CANCELLATION_TOKEN_PURPOSE,
      expiresAt,
    },
    { transaction },
  );
  return { token, row };
}

export function findCancellationToken(token: string) {
  if (!isValidCancellationTokenShape(token)) return null;
  return BookingCancellationToken.findOne({
    where: {
      tokenHash: hashCancellationToken(token),
      purpose: CANCELLATION_TOKEN_PURPOSE,
    },
  });
}
