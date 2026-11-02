import Link from 'next/link';
import { ButtonLink } from './button-link';

const navigation = [
  { label: 'Home', href: '/#home' },
  { label: 'Book apartments', href: '/apartments' },
  { label: 'About us', href: '/#about' },
  { label: 'Contact us', href: '/#contact' },
];

export function SiteFooter() {
  return (
    <footer
      id="policies"
      className="bg-[#172d28] px-5 pb-7 pt-12 text-white sm:px-8 sm:pt-16 lg:px-12"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 border-b border-white/15 pb-12 md:grid-cols-[1.1fr_0.8fr_0.8fr] lg:gap-20">
          <div>
            <Link
              href="/#home"
              className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-lime text-forest">
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
              <span className="font-display text-2xl font-semibold tracking-[-0.04em]">
                staywell
              </span>
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
              href="#policies"
              className="underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
            >
              Privacy notice · coming soon
            </Link>
            <Link
              href="#policies"
              className="underline decoration-white/25 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime"
            >
              Terms of stay · coming soon
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
