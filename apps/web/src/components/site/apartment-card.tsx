import Link from 'next/link';
import type { ApartmentSummary } from '@/lib/apartments';
import { ButtonLink } from './button-link';
import { ApartmentPhoto } from './apartment-photo';

export function displayPrice(value: string | number, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`;
  }
}

export function ApartmentCard({ apartment }: { apartment: ApartmentSummary }) {
  const price = displayPrice(apartment.nightlyPrice, apartment.currency);
  return (
    <article className="group overflow-hidden rounded-[1.75rem] bg-white p-3 shadow-[0_12px_40px_rgba(26,37,32,0.055)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(26,37,32,0.12)]">
      <Link
        href={`/apartments/${encodeURIComponent(apartment.slug)}`}
        className="block rounded-[1.25rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
        aria-label={`View details for ${apartment.name}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-sand">
          <ApartmentPhoto
            src={apartment.coverImageUrl}
            alt={apartment.coverImageAlt || apartment.name}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
            className="object-cover transition duration-500 group-hover:scale-[1.035]"
          />
        </div>
        <div className="px-2 pb-1 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl leading-tight text-ink">
                {apartment.name}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {apartment.displayLocation}
              </p>
            </div>
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ink/10 text-forest transition group-hover:border-forest group-hover:bg-forest group-hover:text-white"
            >
              ↗
            </span>
          </div>
        </div>
      </Link>
      <p className="mt-3 line-clamp-2 min-h-12 px-2 text-sm leading-6 text-muted">
        {apartment.shortDescription}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/10 px-2 pt-4 text-xs font-medium text-muted">
        <span>
          {apartment.bedrooms}{' '}
          {apartment.bedrooms === 1 ? 'bedroom' : 'bedrooms'}
        </span>
        <span>{apartment.bathrooms} bathrooms</span>
        <span>Up to {apartment.maxGuests} guests</span>
      </div>
      {apartment.amenities.length ? (
        <ul
          aria-label="Key amenities"
          className="mt-3 flex flex-wrap gap-2 px-2"
        >
          {apartment.amenities.slice(0, 4).map((amenity) => (
            <li
              key={amenity.slug}
              className="rounded-full bg-sand px-3 py-1.5 text-xs text-forest"
            >
              {amenity.name}
            </li>
          ))}
          {apartment.amenities.length > 4 ? (
            <li className="px-1 py-1.5 text-xs text-muted">
              +{apartment.amenities.length - 4}
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className="mt-4 flex items-baseline gap-1.5 px-2 text-ink">
        {price ? (
          <>
            <span className="font-semibold">{price}</span>
            <span className="text-sm text-muted">/ night</span>
          </>
        ) : (
          <span className="text-sm text-muted">Price details in listing</span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 px-1 pb-1">
        <ButtonLink
          href={`/apartments/${encodeURIComponent(apartment.slug)}`}
          variant="outline"
          className="min-h-10 px-3 py-2 text-xs"
        >
          View details
        </ButtonLink>
        <ButtonLink
          href={`/booking?apartmentId=${encodeURIComponent(apartment.id)}&apartmentSlug=${encodeURIComponent(apartment.slug)}`}
          className="min-h-10 px-3 py-2 text-xs"
        >
          Start booking
        </ButtonLink>
      </div>
    </article>
  );
}
