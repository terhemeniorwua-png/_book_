export const COOKIE_CONSENT_STORAGE_KEY = 'staywell.cookie-consent';
export const COOKIE_CONSENT_VERSION = 'cookie-preferences-v1';
export const COOKIE_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export type CookiePreferences = {
  strictlyNecessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type SavedCookieConsent = {
  version: typeof COOKIE_CONSENT_VERSION;
  savedAt: string;
  preferences: CookiePreferences;
};

export const DEFAULT_COOKIE_PREFERENCES: CookiePreferences = {
  strictlyNecessary: true,
  functional: false,
  analytics: false,
  marketing: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseCookieConsent(
  value: unknown,
  now = Date.now(),
): SavedCookieConsent | null {
  if (!isRecord(value) || value.version !== COOKIE_CONSENT_VERSION) return null;
  if (typeof value.savedAt !== 'string') return null;
  const savedAtMs = Date.parse(value.savedAt);
  if (
    !Number.isFinite(savedAtMs) ||
    savedAtMs > now + 5 * 60 * 1000 ||
    now - savedAtMs >= COOKIE_CONSENT_MAX_AGE_MS
  )
    return null;

  const preferences = value.preferences;
  if (
    !isRecord(preferences) ||
    preferences.strictlyNecessary !== true ||
    typeof preferences.functional !== 'boolean' ||
    typeof preferences.analytics !== 'boolean' ||
    typeof preferences.marketing !== 'boolean'
  )
    return null;

  return {
    version: COOKIE_CONSENT_VERSION,
    savedAt: new Date(savedAtMs).toISOString(),
    preferences: {
      strictlyNecessary: true,
      functional: preferences.functional,
      analytics: preferences.analytics,
      marketing: preferences.marketing,
    },
  };
}

export function readCookieConsent(
  storage: Pick<Storage, 'getItem'>,
  now = Date.now(),
) {
  try {
    const raw = storage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    return parseCookieConsent(JSON.parse(raw) as unknown, now);
  } catch {
    return null;
  }
}

export function createCookieConsent(
  preferences: CookiePreferences,
  now = Date.now(),
): SavedCookieConsent {
  return {
    version: COOKIE_CONSENT_VERSION,
    savedAt: new Date(now).toISOString(),
    preferences: { ...preferences, strictlyNecessary: true },
  };
}

export function writeCookieConsent(
  storage: Pick<Storage, 'setItem'>,
  preferences: CookiePreferences,
  now = Date.now(),
) {
  const consent = createCookieConsent(preferences, now);
  storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  return consent;
}
