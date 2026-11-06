import Link from 'next/link';
import { ButtonLink } from './button-link';
import { StaywellLogo } from './staywell-logo';
import { CookieSettingsButton } from './cookie-consent-manager';

const navigation = [
  { label: 'Home', href: '/#home' },
  { label: 'Apartments', href: '/apartments' },
  { label: 'About us', href: '/#about' },
  { label: 'Contact us', href: '/#contact' },
];

export function SiteFooter() {
  return (
    <footer
      id="policies"
      className="bg-[#102b24] px-5 pb-7 pt-12 text-white sm:px-8 sm:pt-16 lg:px-12"
    >
      <div className="mx-auto max-w-[1320px]">
        <div className="grid gap-12 border-b border-white/15 pb-12 md:grid-cols-[1.1fr_0.8fr_0.8fr] lg:gap-20">
          <div>
            <Link
              href="/#home"
              className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
            >
              <StaywellLogo inverse compact />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/60">
              A more thoughtful way to find your next apartment stay.
            </p>
            <div className="mt-7">
              <ButtonLink href="/apartments" variant="light">
                Explore apartments
              </ButtonLink>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-lime">
              Explore
            </h2>
            <nav aria-label="Footer navigation" className="mt-5 grid gap-3">
              {navigation.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="w-fit rounded-sm text-sm text-white/70 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-lime">
              Get in touch
            </h2>
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/70">
              Property contact details will be added here when confirmed by the
              owner.
            </p>
            <p className="mt-4 text-xs text-white/70">
              Location information coming soon
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5 py-6 text-xs text-white/70 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} Staywell. Property details are being
            confirmed.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/terms-and-privacy#privacy-notice"
              className="underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
            >
              Privacy Notice
            </Link>
            <Link
              href="/terms-and-privacy#terms-and-conditions"
              className="underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
            >
              Terms &amp; Conditions
            </Link>
            <CookieSettingsButton className="rounded-sm underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime" />
          </div>
        </div>
      </div>
    </footer>
  );
}
