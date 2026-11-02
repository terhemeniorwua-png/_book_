type StaywellLogoProps = {
  inverse?: boolean;
  compact?: boolean;
};

export function StaywellLogo({
  inverse = false,
  compact = false,
}: StaywellLogoProps) {
  return (
    <span className="inline-flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${inverse ? 'bg-white text-[#183c32]' : 'bg-[#183c32] text-[#f6f1e8]'}`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5">
          <path
            d="M5 20V10.5a7 7 0 0 1 14 0V20M9 20v-7h6v7M3 20h18"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="leading-none">
        <span
          className={`block font-display text-xl font-semibold tracking-[-0.035em] ${inverse ? 'text-white' : 'text-ink'}`}
        >
          Staywell
        </span>
        {!compact ? (
          <span
            className={`mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em] ${inverse ? 'text-white/65' : 'text-muted'}`}
          >
            Your Stay, Your Comfort.
          </span>
        ) : null}
      </span>
    </span>
  );
}
