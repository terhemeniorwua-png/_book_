import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

type GoogleIdentityErrorCode =
  | 'GOOGLE_SIGNIN_NOT_CONFIGURED'
  | 'GOOGLE_CREDENTIAL_INVALID'
  | 'GOOGLE_EMAIL_UNVERIFIED';

export class GoogleIdentityError extends Error {
  readonly code: GoogleIdentityErrorCode;
  readonly status: number;
  constructor(code: GoogleIdentityErrorCode, status: number, message: string) {
    super(message);
    this.name = 'GoogleIdentityError';
    this.code = code;
    this.status = status;
  }
}

let client: OAuth2Client | undefined;

export async function verifyGoogleCredential(credential: string) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new GoogleIdentityError(
      'GOOGLE_SIGNIN_NOT_CONFIGURED',
      503,
      'Google sign-in is not available right now.',
    );
  }
  client ??= new OAuth2Client(clientId);

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new GoogleIdentityError(
      'GOOGLE_CREDENTIAL_INVALID',
      401,
      'Google sign-in could not be verified. Please try again.',
    );
  }
  if (!payload?.email) {
    throw new GoogleIdentityError(
      'GOOGLE_CREDENTIAL_INVALID',
      401,
      'Google sign-in could not be verified. Please try again.',
    );
  }
  if (!payload.email_verified) {
    throw new GoogleIdentityError(
      'GOOGLE_EMAIL_UNVERIFIED',
      403,
      'Your Google email address is not verified.',
    );
  }
  const fullName = (
    payload.name ??
    [payload.given_name, payload.family_name].filter(Boolean).join(' ')
  )
    .trim()
    .slice(0, 160);
  return { fullName, email: payload.email.trim().toLowerCase() };
}
