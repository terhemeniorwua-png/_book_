import Link from 'next/link';
import { ApartmentCard } from '@/components/site/apartment-card';
import { ErrorMessage } from '@/components/site/error-message';
import { SectionHeading } from '@/components/site/section-heading';
import {
  getApartments,
  validateApartmentFilters,
  type ApartmentFilters,
} from '@/lib/apartments';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function selectedAmenities(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : (value?.split(',') ?? [])).filter(
    Boolean,
  );
}

function pageHref(filters: ApartmentFilters, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'page' || !value) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, value);
  }
  params.set('page', String(page));
  return `/apartments?${params.toString()}`;
}

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const checkedFilters = validateApartmentFilters(params);
  const filters: ApartmentFilters = checkedFilters.success
    ? {
        minPrice: first(params.minPrice),
        maxPrice: first(params.maxPrice),
        bedrooms: first(params.bedrooms),
        guests: first(params.guests),
        location: first(params.location),
        q: first(params.q),
        amenities: selectedAmenities(params.amenities),
        page: first(params.page) ?? '1',
        sort: first(params.sort) ?? 'newest',
      }
    : {};
  const result = checkedFilters.success
    ? await getApartments(filters)
    : { status: 'unavailable' as const };
  const selected = new Set(selectedAmenities(params.amenities));

  return (
    <main id="main-content" className="section-wrap min-h-[70vh]">
      <div className="mx-auto max-w-3xl text-center">
        <SectionHeading
          eyebrow="Explore the collection"
          title="Find a place that feels right."
          description="Browse published apartment listings and compare the details that matter for your stay."
          align="center"
        />
      </div>

      <form
        action="/apartments"
        method="get"
        className="mt-10 rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-2 text-sm font-medium text-ink">
            Search
            <input
              name="q"
              defaultValue={first(params.q)}
              maxLength={100}
              placeholder="Name or description"
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Location
            <input
              name="location"
              defaultValue={first(params.location)}
              maxLength={120}
              placeholder="Area or region"
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Minimum price per night
            <input
              type="number"
              name="minPrice"
              min="0"
              step="1"
              defaultValue={first(params.minPrice)}
              inputMode="decimal"
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Maximum price per night
            <input
              type="number"
              name="maxPrice"
              min="0"
              step="1"
              defaultValue={first(params.maxPrice)}
              inputMode="decimal"
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Bedrooms (at least)
            <input
              type="number"
              name="bedrooms"
              min="0"
              max="30"
              step="1"
              defaultValue={first(params.bedrooms)}
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Guests
            <input
              type="number"
              name="guests"
              min="1"
              max="50"
              step="1"
              defaultValue={first(params.guests)}
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Sort by
            <select
              name="sort"
              defaultValue={first(params.sort) ?? 'newest'}
              className="min-h-11 rounded-xl border border-ink/15 bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <option value="newest">Recently added</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
        {result.status === 'success' && result.data.filters.amenities.length ? (
          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-ink">Amenities</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.data.filters.amenities.map((amenity) => (
                <label
                  key={amenity.slug}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-ink/10 px-3 text-sm text-muted has-[:checked]:border-forest has-[:checked]:bg-forest/5 has-[:checked]:text-forest"
                >
                  <input
                    type="checkbox"
                    name="amenities"
                    value={amenity.slug}
                    defaultChecked={selected.has(amenity.slug)}
                    className="accent-forest"
                  />
                  {amenity.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            Search apartments
          </button>
          <Link
            href="/apartments"
            className="rounded px-2 py-2 text-sm font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
          >
            Clear filters
          </Link>
        </div>
      </form>

      <section aria-labelledby="apartment-results" className="mt-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">
              Available listings
            </p>
            <h2
              id="apartment-results"
              className="mt-2 font-display text-3xl text-ink"
            >
              Apartments for your stay
            </h2>
          </div>
          {result.status === 'success' ? (
            <p className="text-sm text-muted">
              {result.data.pagination.total}{' '}
              {result.data.pagination.total === 1 ? 'apartment' : 'apartments'}
            </p>
          ) : null}
        </div>
        {result.status === 'unavailable' ? (
          <ErrorMessage
            title={
              checkedFilters.success
                ? 'Apartments are temporarily unavailable'
                : 'Some filters need attention'
            }
          >
            {checkedFilters.success
              ? 'We could not load published listings. Please try again shortly.'
              : 'Review the filter values and try your search again.'}
          </ErrorMessage>
        ) : result.data.items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.items.map((apartment) => (
              <ApartmentCard key={apartment.id} apartment={apartment} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-forest/25 bg-white/70 px-6 py-12 text-center">
            <h3 className="font-display text-2xl text-ink">
              No apartments match these filters
            </h3>
            <p className="mt-2 text-sm text-muted">
              Adjust your search or clear filters to see all published
              apartments.
            </p>
            <Link
              href="/apartments"
              className="mt-5 inline-flex rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
            >
              Clear filters
            </Link>
          </div>
        )}
        {result.status === 'success' &&
        result.data.pagination.totalPages > 1 ? (
          <nav
            aria-label="Apartment result pages"
            className="mt-9 flex items-center justify-center gap-4"
          >
            {result.data.pagination.page > 1 ? (
              <Link
                href={pageHref(filters, result.data.pagination.page - 1)}
                className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                Previous
              </Link>
            ) : null}
            <span className="text-sm text-muted">
              Page {result.data.pagination.page} of{' '}
              {result.data.pagination.totalPages}
            </span>
            {result.data.pagination.page < result.data.pagination.totalPages ? (
              <Link
                href={pageHref(filters, result.data.pagination.page + 1)}
                className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
