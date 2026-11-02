import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import './globals.css';

export const metadata: Metadata = {
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
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
