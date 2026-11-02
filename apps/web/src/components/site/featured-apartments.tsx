import { getFeaturedApartments } from '@/lib/apartments';
import { ApartmentCard } from './apartment-card';
import { ButtonLink } from './button-link';
import { ErrorMessage } from './error-message';
import { LoadingIndicator } from './loading-indicator';
import { SectionHeading } from './section-heading';

export function FeaturedApartmentsLoading() {
  return <LoadingIndicator label="Loading featured apartments" />;
}

export async function FeaturedApartments() {
  const result = await getFeaturedApartments();

  return (
    <section id="apartments" className="section-wrap scroll-mt-28">
      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <SectionHeading
          eyebrow="A place to begin"
          title="Find Your Perfect Stay"
          description="Explore the apartments available for your next trip. Each listing includes its own details, rates, and amenities."
        />
        <ButtonLink
          href="/apartments"
          variant="outline"
          className="self-start md:self-auto"
        >
          Explore apartments
        </ButtonLink>
      </div>

      {result.status === 'success' ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.apartments.map((apartment) => (
            <ApartmentCard key={apartment.id} apartment={apartment} />
          ))}
        </div>
      ) : result.status === 'empty' ? (
        <div className="mt-10">
          <ErrorMessage title="No featured apartments yet">
            Published apartment listings will appear here when they are ready.
          </ErrorMessage>
        </div>
      ) : process.env.NODE_ENV === 'development' ? (
        <div className="mt-10 rounded-3xl border border-dashed border-forest/25 bg-white/70 px-6 py-10 text-center">
          <span className="inline-flex rounded-full bg-lime/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-forest">
            Development preview
          </span>
          <p className="mt-4 font-display text-2xl text-ink">
            Live apartment inventory is not connected yet.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
            No sample listings are shown. Connect the versioned apartments API
            to display published stays here.
          </p>
        </div>
      ) : (
        <div className="mt-10">
          <ErrorMessage title="Apartments are temporarily unavailable">
            We could not load published apartments. Please try again soon.
          </ErrorMessage>
        </div>
      )}
    </section>
  );
}
