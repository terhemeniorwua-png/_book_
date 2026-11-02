export function LoadingIndicator({
  label = 'Loading apartments',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-3xl bg-white p-3 shadow-sm"
        >
          <div className="aspect-[4/3] animate-pulse rounded-2xl bg-sand-dark/50" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-sand-dark/60" />
            <div className="h-3 w-full animate-pulse rounded bg-sand-dark/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
