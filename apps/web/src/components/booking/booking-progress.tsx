const steps = ['Dates', 'Guest Information', 'Payment', 'Confirmation'];

export function BookingProgress({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Booking progress" className="mx-auto max-w-4xl">
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((label, index) => {
          const step = index + 1;
          const complete = step < current;
          const active = step === current;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className="min-w-0"
            >
              <div
                className={`flex items-center gap-2 border-t-2 pt-3 ${active || complete ? 'border-forest text-forest' : 'border-ink/10 text-muted'}`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${complete ? 'bg-forest text-white' : active ? 'bg-lime text-forest' : 'bg-sand text-muted'}`}
                  aria-hidden="true"
                >
                  {complete ? '✓' : step}
                </span>
                <span
                  className={`text-[11px] leading-tight sm:text-sm ${active ? 'font-semibold' : ''}`}
                >
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
