import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'light' | 'outline';
  className?: string;
  ariaLabel?: string;
} & Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'>;

const variants = {
  primary: 'bg-forest text-white hover:bg-forest-dark active:bg-forest-dark',
  light: 'bg-white text-forest hover:bg-[#e8d7b5] active:bg-[#e8d7b5]',
  outline: 'border border-ink/20 text-ink hover:border-forest hover:bg-white',
};

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  className = '',
  ariaLabel,
  target,
  rel,
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      target={target}
      rel={rel}
      className={`inline-flex min-h-12 items-center justify-center gap-3 rounded-xl px-6 py-3 text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest active:translate-y-px ${variants[variant]} ${className}`}
    >
      <span>{children}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="size-4"
      >
        <path
          d="M4.5 10h10m-4-4 4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
