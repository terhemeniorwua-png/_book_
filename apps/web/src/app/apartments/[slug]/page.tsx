import { notFound } from 'next/navigation';
import { ButtonLink } from '@/components/site/button-link';
import { ErrorMessage } from '@/components/site/error-message';
import { SectionHeading } from '@/components/site/section-heading';
import { displayPrice } from '@/components/site/apartment-card';
import { getApartment } from '@/lib/apartments';
import { ApartmentPhoto } from '@/components/site/apartment-photo';

function PolicyContent({ value }: { value: string | null }) {
  return value ? (
    <p className="text-sm leading-7 text-muted">{value}</p>
  ) : (
    <p className="text-sm leading-7 text-muted">
      This information has not been provided yet. Please contact the property
      before booking.
    </p>
  );
}

export default async function ApartmentDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getApartment(slug);
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <main id="main-content" className="section-wrap">
        <ErrorMessage title="Apartment details are temporarily unavailable">
          We could not load this listing. Please try again shortly.
        </ErrorMessage>
      </main>
    );
  }
  const apartment = result.apartment;
  const price = displayPrice(apartment.nightlyPrice, apartment.currency);
  const images = apartment.images.filter((image) => image.url);

  return (
    <main id="main-content" className="section-wrap min-h-[70vh]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
            {apartment.displayLocation}
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {apartment.name}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
            {apartment.shortDescription}
          </p>
        </div>

        <section
          aria-label="Apartment photo gallery"
          className="grid gap-3 md:grid-cols-[1.5fr_1fr]"
        >
          <div className="relative min-h-[280px] overflow-hidden rounded-[1.75rem] bg-sand md:min-h-[440px]">
            <ApartmentPhoto
              key={images[0]?.url ?? 'missing-cover'}
              src={images[0]?.url ?? null}
              alt={images[0]?.altText ?? apartment.name}
              priority
              sizes="(max-width: 768px) 100vw, 65vw"
              className="object-cover"
              fallbackLabel="Apartment photos unavailable"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {[images[1], images[2]].map((image, index) => (
              <div
                key={image?.id ?? `empty-${index}`}
                className="relative min-h-36 overflow-hidden rounded-[1.5rem] bg-sand md:min-h-0"
              >
                <ApartmentPhoto
                  key={image?.url ?? `missing-${index}`}
                  src={image?.url ?? null}
                  alt={image?.altText ?? `${apartment.name} interior`}
                  sizes="(max-width: 768px) 50vw, 35vw"
                  className="object-cover"
                  fallbackLabel="Photo coming soon"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
          <div className="space-y-10">
            <section>
              <SectionHeading
                eyebrow="About this apartment"
                title="Room to settle in."
                description={apartment.fullDescription}
              />
            </section>
            <section aria-labelledby="stay-facts">
              <h2 id="stay-facts" className="font-display text-2xl text-ink">
                At a glance
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white p-4">
                  <dt className="text-xs text-muted">Bedrooms</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {apartment.bedrooms}
                  </dd>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <dt className="text-xs text-muted">Bathrooms</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {apartment.bathrooms}
                  </dd>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <dt className="text-xs text-muted">Guests</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    Up to {apartment.maxGuests}
                  </dd>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <dt className="text-xs text-muted">Minimum stay</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {apartment.minStayNights}{' '}
                    {apartment.minStayNights === 1 ? 'night' : 'nights'}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="amenities-heading">
              <h2
                id="amenities-heading"
                className="font-display text-2xl text-ink"
              >
                Amenities
              </h2>
              {apartment.amenities.length ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {apartment.amenities.map((amenity) => (
                    <li
                      key={amenity.slug}
                      className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink"
                    >
                      {amenity.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Amenities have not been listed yet.
                </p>
              )}
            </section>

            <section aria-labelledby="pricing-heading">
              <h2
                id="pricing-heading"
                className="font-display text-2xl text-ink"
              >
                Pricing and additional charges
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                The listed rate is per night. Your booking total will depend on
                your dates and any applicable charges.
              </p>
              {apartment.pricing.additionalCharges.length ? (
                <ul className="mt-4 divide-y divide-ink/10 rounded-2xl bg-white px-4">
                  {apartment.pricing.additionalCharges.map((charge) => (
                    <li
                      key={`${charge.name}-${charge.calculationBasis}`}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span className="text-ink">
                        {charge.name}
                        {charge.required ? ' · required' : ' · optional'}
                      </span>
                      <span className="text-muted">
                        {displayPrice(charge.amount, charge.currency)} ·{' '}
                        {charge.calculationBasis.replaceAll('_', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  No additional charges are currently listed.
                </p>
              )}
              <p className="mt-3 text-xs text-muted">
                Minimum stay: {apartment.pricing.minimumStayNights} nights
                {apartment.pricing.maximumStayNights
                  ? ` · Maximum stay: ${apartment.pricing.maximumStayNights} nights`
                  : ''}
                .
              </p>
            </section>

            <section aria-labelledby="location-heading">
              <h2
                id="location-heading"
                className="font-display text-2xl text-ink"
              >
                Location
              </h2>
              <p className="mt-3 text-sm text-muted">
                {[
                  apartment.displayLocation,
                  apartment.locality,
                  apartment.region,
                  apartment.countryCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </section>

            <section aria-labelledby="policies-heading">
              <h2
                id="policies-heading"
                className="font-display text-2xl text-ink"
              >
                House rules and policies
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-5">
                  <h3 className="font-semibold text-ink">House rules</h3>
                  {apartment.houseRules.length ? (
                    <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-muted">
                      {apartment.houseRules.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      House rules have not been provided yet.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl bg-white p-5">
                  <h3 className="font-semibold text-ink">Check-in</h3>
                  <div className="mt-3">
                    <PolicyContent value={apartment.checkInPolicy} />
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-5">
                  <h3 className="font-semibold text-ink">Check-out</h3>
                  <div className="mt-3">
                    <PolicyContent value={apartment.checkOutPolicy} />
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-5">
                  <h3 className="font-semibold text-ink">Cancellation</h3>
                  <div className="mt-3">
                    <PolicyContent value={apartment.cancellationPolicy} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-3xl border border-ink/10 bg-white p-6 shadow-sm lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-terracotta">
              Nightly rate
            </p>
            <p className="mt-2 font-display text-3xl text-ink">
              {price ?? 'See listing'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {apartment.currency} per night
            </p>
            <div className="mt-5 border-t border-ink/10 pt-5 text-sm text-muted">
              Sleeps up to {apartment.maxGuests} · {apartment.bedrooms} bedrooms
              · {apartment.bathrooms} bathrooms
            </div>
            <ButtonLink
              href={`/booking?apartmentId=${encodeURIComponent(apartment.id)}&apartmentSlug=${encodeURIComponent(apartment.slug)}`}
              className="mt-6 w-full"
            >
              Book this apartment
            </ButtonLink>
            <p className="mt-3 text-center text-xs leading-5 text-muted">
              Booking dates and availability will be confirmed in the
              reservation flow.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
