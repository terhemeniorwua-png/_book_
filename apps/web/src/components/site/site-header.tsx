'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from './button-link';

const links = [
  { label: 'Home', href: '/#home', section: 'home' },
  { label: 'Book apartments', href: '/apartments', section: 'apartments' },
  { label: 'About us', href: '/#about', section: 'about' },
  { label: 'Contact us', href: '/#contact', section: 'contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pathname !== '/') {
      setActiveSection(pathname.startsWith('/apartments') ? 'apartments' : '');
      return;
    }

    const sections = ['home', 'about', 'contact']
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: '-18% 0px -65% 0px', threshold: [0, 0.15, 0.35, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [menuOpen]);

  function isActive(section: string) {
    if (section === 'apartments') return pathname.startsWith('/apartments');
    return pathname === '/' && activeSection === section;
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-ink/[0.07] bg-canvas/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link
          href="/#home"
          className="group flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          aria-label="Staywell home"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-forest text-lime">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
            >
              <path
                d="M4 19V8.8L12 4l8 4.8V19M8 19v-6h8v6M9 9.5h.01M15 9.5h.01"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="leading-none">
            <span className="block font-display text-xl font-semibold tracking-[-0.04em] text-ink">
              staywell
            </span>
            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.22em] text-muted">
              Apartment stays
            </span>
          </span>
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {links.map((link) => {
            const active = isActive(link.section);
            return (
              <Link
                key={link.label}
                href={link.href}
                aria-current={
                  active
                    ? link.section === 'apartments' || link.section === 'home'
                      ? 'page'
                      : 'location'
                    : undefined
                }
                className={`rounded-full px-4 py-2.5 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${active ? 'bg-white text-forest shadow-sm' : 'text-muted hover:bg-white/70 hover:text-ink'}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:block">
          <ButtonLink href="/apartments" className="min-h-11 px-5 py-2.5">
            Book now
          </ButtonLink>
        </div>

        <button
          ref={menuButton}
          type="button"
          aria-label={
            menuOpen ? 'Close navigation menu' : 'Open navigation menu'
          }
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-11 items-center justify-center rounded-full border border-ink/10 text-ink transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral lg:hidden"
        >
          {menuOpen ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
            >
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
            >
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full border-b border-ink/10 bg-canvas px-5 pb-6 pt-3 shadow-xl lg:hidden"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) closeMenu();
          }}
        >
          <div className="mx-auto grid max-w-[1440px] gap-1 sm:px-3">
            {links.map((link) => {
              const active = isActive(link.section);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={
                    active
                      ? link.section === 'apartments' || link.section === 'home'
                        ? 'page'
                        : 'location'
                      : undefined
                  }
                  className={`rounded-xl px-4 py-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${active ? 'bg-white text-forest' : 'text-ink hover:bg-white'}`}
                >
                  {link.label}
                </Link>
              );
            })}
            <ButtonLink href="/apartments" className="mt-3 w-full">
              Book now
            </ButtonLink>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
