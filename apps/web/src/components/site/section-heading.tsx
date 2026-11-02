type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  light?: boolean;
  align?: 'left' | 'center';
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  light = false,
  align = 'left',
}: SectionHeadingProps) {
  return (
    <div
      className={`${align === 'center' ? 'mx-auto text-center' : ''} max-w-2xl`}
    >
      <p
        className={`mb-4 text-xs font-bold uppercase tracking-[0.2em] ${light ? 'text-lime' : 'text-terracotta'}`}
      >
        {eyebrow}
      </p>
      <h2
        className={`font-display text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl ${light ? 'text-white' : 'text-ink'}`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-5 max-w-xl text-base leading-7 ${light ? 'text-white/70' : 'text-muted'}`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
