export function ErrorMessage({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <div
      role="status"
      className="rounded-3xl border border-terracotta/25 bg-white px-6 py-8 text-center"
    >
      <p className="font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        {children}
      </p>
    </div>
  );
}
