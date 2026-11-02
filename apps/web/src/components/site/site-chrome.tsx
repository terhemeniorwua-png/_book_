'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export function SiteChrome({ position }: { position: 'header' | 'footer' }) {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;
  return position === 'header' ? <SiteHeader /> : <SiteFooter />;
}
