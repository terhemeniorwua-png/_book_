'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_COOKIE_PREFERENCES,
  readCookieConsent,
  writeCookieConsent,
  type CookiePreferences,
  type SavedCookieConsent,
} from '@/lib/cookie-consent';

const CookiePreferencesContext = createContext<CookiePreferences>(
  DEFAULT_COOKIE_PREFERENCES,
);

export function useCookiePreferences() {
  return useContext(CookiePreferencesContext);
}

function SettingsButton({ className }: { className: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() =>
        window.dispatchEvent(new Event('staywell:open-cookie-settings'))
      }
    >
      Cookie Settings
    </button>
  );
}

export { SettingsButton as CookieSettingsButton };

function CategoryToggle({
  id,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/10 py-4 last:border-0">
      <div className="min-w-0">
        <label htmlFor={id} className="font-semibold text-ink">
          {title}
        </label>
        <p
          id={`${id}-description`}
          className="mt-1 text-sm leading-6 text-muted"
        >
          {description}
        </p>
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-description`}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 size-5 shrink-0 accent-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest disabled:cursor-not-allowed"
      />
    </div>
  );
}

export function CookieConsentManager({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [saved, setSaved] = useState<SavedCookieConsent | null>(null);
  const [open, setOpen] = useState(pathname !== '/terms-and-privacy');
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<CookiePreferences>(
    DEFAULT_COOKIE_PREFERENCES,
  );
  const [storageError, setStorageError] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    const existing = readCookieConsent(window.localStorage);
    if (existing) {
      setSaved(existing);
      setDraft(existing.preferences);
      setOpen(false);
    }

    const openSettings = () => {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setDraft(savedRef.current?.preferences ?? DEFAULT_COOKIE_PREFERENCES);
      setStorageError(false);
      setCustomizing(true);
      setOpen(true);
    };
    window.addEventListener('staywell:open-cookie-settings', openSettings);
    return () =>
      window.removeEventListener('staywell:open-cookie-settings', openSettings);
  }, []);

  useEffect(() => {
    setOpen(saved ? false : pathname !== '/terms-and-privacy');
  }, [pathname, saved]);

  useEffect(() => {
    const pageElement = pageRef.current;
    if (!open) {
      pageElement?.removeAttribute('inert');
      return;
    }
    pageElement?.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstActionRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      pageElement?.removeAttribute('inert');
    };
  }, [open, customizing]);

  const save = useCallback((preferences: CookiePreferences) => {
    try {
      const consent = writeCookieConsent(window.localStorage, preferences);
      setSaved(consent);
      setDraft(consent.preferences);
      setStorageError(false);
      setOpen(false);
      setCustomizing(false);
      window.dispatchEvent(
        new CustomEvent('staywell:cookie-consent-changed', {
          detail: consent.preferences,
        }),
      );
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    } catch {
      setStorageError(true);
    }
  }, []);

  const acceptAll = () =>
    save({
      strictlyNecessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    });

  const rejectOptional = () => save(DEFAULT_COOKIE_PREFERENCES);

  const preferences = saved?.preferences ?? DEFAULT_COOKIE_PREFERENCES;

  return (
    <CookiePreferencesContext.Provider value={preferences}>
      <div
        ref={pageRef}
        data-cookie-page-content
        aria-hidden={open ? true : undefined}
        inert={open ? true : undefined}
      >
        {children}
      </div>
      {open ? (
        <div className="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center overflow-y-auto bg-[#102b24]/75 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-description"
            className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-[#F6F1E8] shadow-2xl sm:max-h-[calc(100dvh-4rem)]"
          >
            <div className="shrink-0 bg-forest px-5 py-5 text-white sm:px-8 sm:py-7">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8D7B5]">
                Staywell privacy choices
              </p>
              <h1
                id="cookie-consent-title"
                className="mt-2 font-display text-2xl leading-tight sm:text-3xl"
              >
                Your Privacy Matters to Staywell
              </h1>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
              <p
                id="cookie-consent-description"
                className="text-sm leading-6 text-ink/85 sm:text-base sm:leading-7"
              >
                Staywell uses cookies and similar technologies to help our
                website work properly, remember your preferences, understand how
                visitors use our platform, and improve your booking experience.
                You can accept all cookies, reject non-essential cookies, or
                customize your preferences.
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                Only essential administrator sign-in cookies are currently in
                use. Staywell has no optional analytics or marketing trackers at
                this time. You can review our{' '}
                <Link
                  href="/terms-and-privacy#privacy-notice"
                  onClick={() => setOpen(false)}
                  className="font-semibold text-forest underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Privacy Notice
                </Link>{' '}
                and{' '}
                <Link
                  href="/terms-and-privacy#cookie-policy"
                  onClick={() => setOpen(false)}
                  className="font-semibold text-forest underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Cookie Policy
                </Link>{' '}
                before choosing.
              </p>

              {!customizing ? (
                <ul className="mt-4 grid gap-2 text-xs leading-5 text-ink/80 sm:grid-cols-2 sm:text-sm">
                  <li className="rounded-xl bg-white px-3 py-2">
                    <strong className="text-forest">Necessary:</strong> secure
                    sign-in and essential functions; always on.
                  </li>
                  <li className="rounded-xl bg-white px-3 py-2">
                    <strong className="text-forest">Functional:</strong>{' '}
                    optional convenience preferences; none currently set.
                  </li>
                  <li className="rounded-xl bg-white px-3 py-2">
                    <strong className="text-forest">Analytics:</strong> measure
                    visits; no analytics service is connected.
                  </li>
                  <li className="rounded-xl bg-white px-3 py-2">
                    <strong className="text-forest">Marketing:</strong>{' '}
                    advertising measurement; no marketing tracker is connected.
                  </li>
                </ul>
              ) : null}

              {customizing ? (
                <div className="mt-5 rounded-2xl border border-ink/10 bg-white px-4 sm:px-5">
                  <CategoryToggle
                    id="cookie-necessary"
                    title="Strictly Necessary Cookies"
                    description="Required for security and essential sign-in/session functions. Always on."
                    checked
                    disabled
                    onChange={() => undefined}
                  />
                  <CategoryToggle
                    id="cookie-functional"
                    title="Functional Cookies"
                    description="Remember optional preferences and convenience settings. No functional cookie is currently set by Staywell."
                    checked={draft.functional}
                    onChange={(functional) =>
                      setDraft((value) => ({ ...value, functional }))
                    }
                  />
                  <CategoryToggle
                    id="cookie-analytics"
                    title="Analytics Cookies"
                    description="Would measure how visitors use the website. No analytics provider or script is currently integrated."
                    checked={draft.analytics}
                    onChange={(analytics) =>
                      setDraft((value) => ({ ...value, analytics }))
                    }
                  />
                  <CategoryToggle
                    id="cookie-marketing"
                    title="Marketing Cookies"
                    description="Would support advertising or cross-service measurement if Staywell adds that functionality. None is currently integrated."
                    checked={draft.marketing}
                    onChange={(marketing) =>
                      setDraft((value) => ({ ...value, marketing }))
                    }
                  />
                </div>
              ) : null}

              {storageError ? (
                <p
                  role="alert"
                  className="mt-4 text-sm font-medium text-terracotta"
                >
                  We could not save your cookie preferences in this browser.
                  Please enable local storage and try again.
                </p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-ink/10 bg-white px-5 py-4 sm:px-8 sm:py-5">
              {customizing ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    ref={firstActionRef}
                    type="button"
                    onClick={() => save(draft)}
                    className="min-h-12 rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest"
                  >
                    Save My Preferences
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="min-h-12 rounded-xl border border-forest px-4 py-3 text-sm font-semibold text-forest hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest"
                  >
                    Accept All
                  </button>
                  <button
                    type="button"
                    onClick={rejectOptional}
                    className="min-h-12 rounded-xl border border-ink/20 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest"
                  >
                    Reject Non-Essential
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    ref={firstActionRef}
                    type="button"
                    onClick={rejectOptional}
                    className="min-h-12 rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest"
                  >
                    Reject Non-Essential
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="min-h-12 rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest"
                  >
                    Accept All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(
                        saved?.preferences ?? DEFAULT_COOKIE_PREFERENCES,
                      );
                      setCustomizing(true);
                    }}
                    className="min-h-12 rounded-xl border border-ink/20 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-forest"
                  >
                    Customize Cookies
                  </button>
                </div>
              )}
              <p className="mt-3 text-center text-xs leading-5 text-muted">
                Your choice is stored on this device for 180 days. Change it at
                any time using Cookie Settings.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </CookiePreferencesContext.Provider>
  );
}
