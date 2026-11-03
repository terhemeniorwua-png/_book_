import argon2 from 'argon2';
import Joi from 'joi';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { Op, Sequelize } from 'sequelize';
import { env } from '../config/env.js';
import { sequelize } from '../db/client.js';
import {
  AdminAccount,
  AdminAuditEvent,
  AdminSession,
} from '../db/models/index.js';

const SESSION_COOKIE = 'admin_session';
const CSRF_COOKIE = 'admin_csrf';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const dummyHash = argon2.hash(randomBytes(32), {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
});

export class AdminAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export const adminLoginSchema = Joi.object({
  email: Joi.string()
    .trim()
    .email({ tlds: { allow: false } })
    .max(320)
    .required(),
  password: Joi.string().min(14).max(128).required(),
}).unknown(false);

function cookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return undefined;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/admin',
    maxAge: SESSION_TTL_MS,
  };
}

function safeAdmin(value: Record<string, unknown>) {
  return {
    id: value.id,
    email: value.email,
    displayName: value.displayName,
    role: value.role,
  };
}

export async function loginAdministrator(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const account = await AdminAccount.findOne({
    where: Sequelize.where(
      Sequelize.fn('lower', Sequelize.col('email')),
      normalizedEmail,
    ),
  });
  const accountValue = account?.get({ plain: true }) as
    | Record<string, unknown>
    | undefined;
  const hash =
    typeof accountValue?.passwordHash === 'string'
      ? accountValue.passwordHash
      : await dummyHash;
  let passwordMatches = false;
  try {
    passwordMatches = await argon2.verify(hash, password);
  } catch {
    passwordMatches = false;
  }
  if (!accountValue || !accountValue.isActive || !passwordMatches) {
    throw new AdminAuthError(
      401,
      'ADMIN_LOGIN_FAILED',
      'Email or password is incorrect.',
    );
  }

  const sessionToken = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sequelize.transaction(async (transaction) => {
    const now = new Date();
    await AdminSession.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lte]: now } },
          { revokedAt: { [Op.ne]: null } },
        ],
      },
      transaction,
    });
    await AdminSession.create(
      {
        adminAccountId: accountValue.id,
        tokenHash: sha256(sessionToken),
        csrfTokenHash: sha256(csrfToken),
        expiresAt,
        lastSeenAt: now,
      },
      { transaction },
    );
    await account!.update({ lastLoginAt: now }, { transaction });
    await AdminAuditEvent.create(
      {
        adminAccountId: accountValue.id,
        action: 'admin.login',
        targetType: 'admin_account',
        targetId: String(accountValue.id),
        metadata: {},
      },
      { transaction },
    );
  });
  return { sessionToken, csrfToken, expiresAt, admin: safeAdmin(accountValue) };
}

export function setAdminSessionCookie(
  response: import('express').Response,
  token: string,
  csrfToken: string,
) {
  response.cookie(SESSION_COOKIE, token, cookieOptions());
  response.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieOptions(),
    httpOnly: false,
  });
  response.setHeader('Cache-Control', 'no-store');
}

export function clearAdminSessionCookie(response: import('express').Response) {
  response.clearCookie(SESSION_COOKIE, {
    ...cookieOptions(),
    maxAge: undefined,
  });
  response.clearCookie(CSRF_COOKIE, {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: undefined,
  });
}

export function csrfCookieToken(cookieHeader: string | undefined) {
  return cookieValue(cookieHeader, CSRF_COOKIE);
}

export const requireAdmin: RequestHandler = async (request, response, next) => {
  try {
    const token = cookieValue(request.headers.cookie, SESSION_COOKIE);
    if (!token || !/^[a-f0-9]{64}$/i.test(token))
      throw new AdminAuthError(
        401,
        'ADMIN_AUTH_REQUIRED',
        'Administrator authentication is required.',
      );
    const session = await AdminSession.findOne({
      where: {
        tokenHash: sha256(token),
        revokedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      include: [
        {
          model: AdminAccount,
          as: 'admin',
          where: { isActive: true },
          required: true,
        },
      ],
    });
    if (!session)
      throw new AdminAuthError(
        401,
        'ADMIN_AUTH_REQUIRED',
        'Administrator authentication is required.',
      );
    const value = session.get({ plain: true }) as Record<string, unknown> & {
      admin: Record<string, unknown>;
    };
    response.locals.admin = safeAdmin(value.admin);
    response.locals.adminSessionId = value.id;
    response.locals.adminCsrfTokenHash = value.csrfTokenHash;
    const lastSeenAt = Date.parse(String(value.lastSeenAt));
    if (!Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > 5 * 60_000) {
      await session.update({ lastSeenAt: new Date() });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdminCsrf: RequestHandler = (request, _response, next) => {
  try {
    const token = request.get('X-CSRF-Token') ?? '';
    const cookieToken = csrfCookieToken(request.headers.cookie) ?? '';
    const expectedHash = String(_response.locals.adminCsrfTokenHash ?? '');
    const actual = Buffer.from(sha256(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    const cookieBytes = Buffer.from(cookieToken);
    const headerBytes = Buffer.from(token);
    if (
      !/^[a-f0-9]{64}$/i.test(token) ||
      cookieBytes.length !== headerBytes.length ||
      !timingSafeEqual(cookieBytes, headerBytes) ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new AdminAuthError(
        403,
        'ADMIN_CSRF_INVALID',
        'Request security token is invalid. Refresh the dashboard and try again.',
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};

export async function currentAdminSession(
  request: import('express').Request,
  response: import('express').Response,
) {
  const sessionId = String(response.locals.adminSessionId);
  const currentToken = csrfCookieToken(request.headers.cookie);
  const expectedHash = String(response.locals.adminCsrfTokenHash ?? '');
  const actualHash = Buffer.from(sha256(currentToken ?? ''), 'hex');
  const storedHash = Buffer.from(expectedHash, 'hex');
  if (
    !currentToken ||
    !/^[a-f0-9]{64}$/i.test(currentToken) ||
    actualHash.length !== storedHash.length ||
    !timingSafeEqual(actualHash, storedHash)
  )
    throw new AdminAuthError(
      403,
      'ADMIN_CSRF_UNAVAILABLE',
      'Administrator security token is missing. Sign in again.',
    );
  response.setHeader('Cache-Control', 'no-store');
  return {
    csrfToken: currentToken,
    admin: response.locals.admin,
    expiresAt: (await AdminSession.findByPk(sessionId))?.get('expiresAt'),
  };
}

export function requireAdminRole(...roles: string[]): RequestHandler {
  return (_request, response, next) => {
    const admin = response.locals.admin as Record<string, unknown> | undefined;
    if (!admin || !roles.includes(String(admin.role))) {
      next(
        new AdminAuthError(
          403,
          'ADMIN_FORBIDDEN',
          'This administrator is not authorized to perform this action.',
        ),
      );
      return;
    }
    next();
  };
}

export async function revokeAdminSession(sessionId: string, adminId: string) {
  await sequelize.transaction(async (transaction) => {
    const session = await AdminSession.findByPk(sessionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!session || String(session.get('adminAccountId')) !== adminId) return;
    await session.update({ revokedAt: new Date() }, { transaction });
    await AdminAuditEvent.create(
      {
        adminAccountId: adminId,
        action: 'admin.logout',
        targetType: 'admin_session',
        targetId: sessionId,
        metadata: {},
      },
      { transaction },
    );
  });
}
