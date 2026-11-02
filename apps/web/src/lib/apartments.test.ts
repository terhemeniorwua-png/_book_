import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildApartmentQuery,
  getApartment,
  getApartments,
  validateApartmentFilters,
  type ApartmentFilters,
} from './apartments';

const summary = {
  id: 'apartment-1',
  slug: 'garden-suite',
  name: 'Garden suite',
  shortDescription: 'A quiet apartment.',
  nightlyPrice: '250.00',
  currency: 'NGN',
  bedrooms: 2,
  bathrooms: '1.5',
  maxGuests: 4,
  displayLocation: 'Central District',
  locality: null,
  region: null,
  countryCode: 'NG',
  minStayNights: 1,
  maxStayNights: null,
  coverImageUrl: null,
  coverImageAlt: null,
  amenities: [{ slug: 'wifi', name: 'Wi-Fi', iconKey: null }],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('apartment API client', () => {
  it('builds query strings from supported discovery filters', () => {
    const filters: ApartmentFilters = {
      minPrice: '100',
      maxPrice: '500',
      bedrooms: '2',
      guests: '3',
      location: 'Lagos',
      amenities: ['wifi', 'pool'],
      page: '2',
      sort: 'price_asc',
    };
    const query = buildApartmentQuery(filters);
    expect(query.get('amenities')).toBe('wifi,pool');
    expect(query.get('page')).toBe('2');
    expect(query.has('untrusted')).toBe(false);
  });

  it('validates discovery filters before fetching', () => {
    expect(
      validateApartmentFilters({ minPrice: '400', maxPrice: '250' }).success,
    ).toBe(false);
    expect(
      validateApartmentFilters({
        bedrooms: '2',
        guests: '4',
        location: 'Lagos',
      }).success,
    ).toBe(true);
    expect(validateApartmentFilters({ admin: 'true' }).success).toBe(true);
  });

  it('parses the paginated public listing response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [summary],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
          filters: { amenities: [{ slug: 'wifi', name: 'Wi-Fi' }] },
        }),
      ),
    );
    const result = await getApartments({ guests: '3' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.items[0].slug).toBe('garden-suite');
      expect(result.data.pagination.total).toBe(1);
    }
  });

  it('rejects malformed API data and handles API failures without inventing listings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ items: [{ name: 'broken' }] })),
    );
    expect((await getApartments()).status).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    expect((await getApartments()).status).toBe('unavailable');
  });

  it('distinguishes unknown apartments and encodes requested slugs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal('fetch', fetchMock);
    expect((await getApartment('missing/property')).status).toBe('not-found');
    expect(fetchMock.mock.calls[0][0]).toContain('missing%2Fproperty');
  });
});
