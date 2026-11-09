'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apartments';

export type GoogleProfile = { fullName: string; email: string };

type GoogleId = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
};
type GoogleWindow = Window & { google?: { accounts: { id: GoogleId } } };

const SCRIPT_ID = 'google-identity-services';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as GoogleWindow).google?.accounts) return resolve();
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('load')));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('load'));
    document.head.appendChild(script);
  });
}

export function GoogleContinueButton({
  onProfile,
}: {
  onProfile: (profile: GoogleProfile) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onProfile);
  const [error, setError] = useState('');

  useEffect(() => {
    callback.current = onProfile;
  }, [onProfile]);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const google = (window as GoogleWindow).google;
        if (cancelled || !google || !container.current) return;
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            setError('');
            try {
              const response = await fetch(
                `${getApiBaseUrl()}/auth/google/profile`,
                {
                  method: 'POST',
                  headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify({ credential }),
                },
              );
              const body = (await response.json()) as {
                item?: GoogleProfile;
                error?: { message?: string };
              };
              if (!response.ok || !body.item) {
                setError(
                  body.error?.message ?? 'Google sign-in failed. Try again.',
                );
                return;
              }
              callback.current(body.item);
            } catch {
              setError('Could not reach the service. Try again.');
            }
          },
        });
        google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        });
      })
      .catch(() => setError('Google sign-in could not be loaded.'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID) return null;
  return (
    <div>
      <div ref={container} />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
