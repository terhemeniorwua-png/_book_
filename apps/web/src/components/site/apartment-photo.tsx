'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ApartmentPhoto({
  src,
  alt,
  sizes,
  priority = false,
  className = '',
  fallbackLabel = 'Apartment photo unavailable',
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex size-full min-h-36 items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#e8ddc7,transparent_42%),linear-gradient(145deg,#ded8c9,#b8c3b0)] ${className}`}
      >
        <span className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-forest">
          {fallbackLabel}
        </span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
