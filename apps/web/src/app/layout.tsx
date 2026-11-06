import type { Metadata } from 'next';
import { SiteChrome } from '@/components/site/site-chrome';
import { CookieConsentManager } from '@/components/site/cookie-consent-manager';
import './globals.css';

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) }
    : {}),
  title: {
    default: 'Staywell — Apartment stays, made thoughtful',
    template: '%s | Staywell',
  },
  description:
    'Find an apartment stay that gives you room to feel at home. Discover clear details as listings become available.',
  openGraph: {
    title: 'Staywell — Apartment stays, made thoughtful',
    description: 'Find an apartment stay that gives you room to feel at home.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <CookieConsentManager>
          <SiteChrome position="header" />
          {children}
          <SiteChrome position="footer" />
        </CookieConsentManager>
      </body>
    </html>
  );
}
