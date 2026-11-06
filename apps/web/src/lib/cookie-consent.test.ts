import { describe, expect, it } from 'vitest';
import {
  COOKIE_CONSENT_MAX_AGE_MS,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  DEFAULT_COOKIE_PREFERENCES,
  createCookieConsent,
  parseCookieConsent,
  readCookieConsent,
  writeCookieConsent,
} from './cookie-consent';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('cookie consent persistence', () => {
  it('defaults every optional category to off and keeps necessary enabled', () => {
    expect(DEFAULT_COOKIE_PREFERENCES).toEqual({
      strictlyNecessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    });
  });

  it('saves timestamped category choices with the current consent version', () => {
    const storage = memoryStorage();
    const now = Date.parse('2026-11-06T12:00:00.000Z');
    const consent = writeCookieConsent(
      storage,
      {
        strictlyNecessary: true,
        functional: true,
        analytics: false,
        marketing: true,
      },
      now,
    );

    expect(consent).toEqual({
      version: COOKIE_CONSENT_VERSION,
      savedAt: '2026-11-06T12:00:00.000Z',
      preferences: {
        strictlyNecessary: true,
        functional: true,
        analytics: false,
        marketing: true,
      },
    });
    expect(readCookieConsent(storage, now)).toEqual(consent);
    expect(storage.values.has(COOKIE_CONSENT_STORAGE_KEY)).toBe(true);
  });

  it('asks again for missing, invalid, stale-version, or expired consent', () => {
    const now = Date.parse('2026-11-06T12:00:00.000Z');
    expect(readCookieConsent(memoryStorage(), now)).toBeNull();
    expect(parseCookieConsent('{ malformed', now)).toBeNull();
    expect(
      parseCookieConsent(
        createCookieConsent(
          DEFAULT_COOKIE_PREFERENCES,
          now - COOKIE_CONSENT_MAX_AGE_MS,
        ),
        now,
      ),
    ).toBeNull();
    expect(
      parseCookieConsent(
        {
          ...createCookieConsent(DEFAULT_COOKIE_PREFERENCES, now),
          version: 'older-version',
        },
        now,
      ),
    ).toBeNull();
    expect(
      parseCookieConsent(
        {
          ...createCookieConsent(DEFAULT_COOKIE_PREFERENCES, now),
          preferences: {
            ...DEFAULT_COOKIE_PREFERENCES,
            strictlyNecessary: false as unknown as true,
          },
        },
        now,
      ),
    ).toBeNull();
  });
});
