import { QueryTypes, type QueryInterface, type Transaction } from 'sequelize';

type SeedApartment = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  nightlyPrice: number;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  displayLocation: string;
  locality: string;
  region: string;
  addressLine1: string;
  amenities: string[];
};

const id = (number: number) =>
  `a0000000-0000-4000-8000-${number.toString().padStart(12, '0')}`;

const apartmentRows: SeedApartment[] = [
  {
    id: id(1),
    slug: 'lekki-coast-studio',
    name: 'Lekki Coast Studio',
    shortDescription:
      'A compact, sunlit studio with a dedicated work corner. Settle in for a quiet stay close to Lekki Phase 1 cafés and shops.',
    fullDescription:
      'This thoughtfully arranged studio offers an open sleeping and living area, a practical kitchenette and a small work table. The fictional address is for demonstration only; confirm the exact property location before publishing.',
    nightlyPrice: 35000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Lekki Phase 1, Lagos',
    locality: 'Lekki Phase 1',
    region: 'Lagos',
    addressLine1: '12 Placeholder Crescent, Lekki Phase 1',
    amenities: ['wifi', 'air-conditioning', 'kitchen', 'security'],
  },
  {
    id: id(2),
    slug: 'lekki-garden-one-bedroom',
    name: 'Lekki Garden One Bedroom',
    shortDescription:
      'A calm serviced apartment with a separate bedroom and a leafy balcony. A convenient base for work or a relaxed city break.',
    fullDescription:
      'Enjoy a separate lounge, fitted kitchen and private balcony in this comfortable one-bedroom apartment. The address is fictional and should be replaced with verified property information.',
    nightlyPrice: 58000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Lekki Phase 1, Lagos',
    locality: 'Lekki Phase 1',
    region: 'Lagos',
    addressLine1: '8 Placeholder Avenue, Lekki Phase 1',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'kitchen',
    ],
  },
  {
    id: id(3),
    slug: 'lekki-family-three-bedroom',
    name: 'Lekki Family Three Bedroom',
    shortDescription:
      'A spacious family flat with three bedrooms and a shared dining area. Designed for groups who want room to gather and unwind.',
    fullDescription:
      'The apartment includes three bedrooms, a full kitchen and a dining table for shared meals. This listing uses a fictional address and placeholder image references.',
    nightlyPrice: 125000,
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    displayLocation: 'Lekki Phase 1, Lagos',
    locality: 'Lekki Phase 1',
    region: 'Lagos',
    addressLine1: '20 Placeholder Close, Lekki Phase 1',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(4),
    slug: 'lekki-skyline-penthouse',
    name: 'Lekki Skyline Penthouse',
    shortDescription:
      'A bright upper-floor penthouse with generous living space and a private terrace. Ideal for guests seeking extra comfort in Lekki.',
    fullDescription:
      'This premium penthouse features two bedrooms, a wide living room and a private terrace. All property details and the address are illustrative placeholders pending owner confirmation.',
    nightlyPrice: 225000,
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 4,
    displayLocation: 'Lekki Phase 1, Lagos',
    locality: 'Lekki Phase 1',
    region: 'Lagos',
    addressLine1: '5 Placeholder Heights, Lekki Phase 1',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
      'pool',
      'gym',
    ],
  },
  {
    id: id(5),
    slug: 'vi-business-studio',
    name: 'Victoria Island Business Studio',
    shortDescription:
      'A neatly furnished studio with a useful desk and fast-connectivity amenity. Stay within easy reach of Victoria Island offices and dining.',
    fullDescription:
      'A simple, well-planned studio with a compact kitchen and a dedicated work surface. Location and property information are fictional examples for development and must be verified.',
    nightlyPrice: 72000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Victoria Island, Lagos',
    locality: 'Victoria Island',
    region: 'Lagos',
    addressLine1: '14 Placeholder Road, Victoria Island',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(6),
    slug: 'vi-harbour-one-bedroom',
    name: 'Victoria Island Harbour One Bedroom',
    shortDescription:
      'A serviced one-bedroom apartment with a comfortable lounge and practical kitchen. Suited to short business visits and weekend stays.',
    fullDescription:
      'Separate sleeping and living areas make this apartment comfortable for a short or extended stay. The displayed address is made up and not a real booking location.',
    nightlyPrice: 98000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Victoria Island, Lagos',
    locality: 'Victoria Island',
    region: 'Lagos',
    addressLine1: '3 Placeholder Quay, Victoria Island',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
      'gym',
    ],
  },
  {
    id: id(7),
    slug: 'vi-family-residence',
    name: 'Victoria Island Family Residence',
    shortDescription:
      'A roomy three-bedroom home with a dining area for shared meals. Its layout gives families and small groups space to settle comfortably.',
    fullDescription:
      'This family-sized apartment pairs three bedrooms with a full kitchen and a large common area. The address and listing content are placeholders awaiting verified owner details.',
    nightlyPrice: 185000,
    bedrooms: 3,
    bathrooms: 3,
    maxGuests: 6,
    displayLocation: 'Victoria Island, Lagos',
    locality: 'Victoria Island',
    region: 'Lagos',
    addressLine1: '22 Placeholder Drive, Victoria Island',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
      'pool',
    ],
  },
  {
    id: id(9),
    slug: 'ikeja-transit-studio',
    name: 'Ikeja Transit Studio',
    shortDescription:
      'A convenient studio with a compact kitchenette and a restful sleeping area. A practical choice for a short visit to Ikeja.',
    fullDescription:
      'A tidy open-plan studio provides the essentials for a comfortable city stay. Its address is fictitious and included only to demonstrate the apartment catalogue.',
    nightlyPrice: 28000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Ikeja GRA, Lagos',
    locality: 'Ikeja GRA',
    region: 'Lagos',
    addressLine1: '7 Placeholder Street, Ikeja GRA',
    amenities: ['wifi', 'air-conditioning', 'security', 'kitchen'],
  },
  {
    id: id(10),
    slug: 'ikeja-serviced-one-bedroom',
    name: 'Ikeja Serviced One Bedroom',
    shortDescription:
      'A comfortable serviced apartment with a separate lounge and bedroom. Enjoy a straightforward base for business or family visits.',
    fullDescription:
      'This one-bedroom apartment includes a fitted kitchen, lounge and secure parking. The street address is invented and should be replaced before public use.',
    nightlyPrice: 52000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Ikeja GRA, Lagos',
    locality: 'Ikeja GRA',
    region: 'Lagos',
    addressLine1: '11 Placeholder Lane, Ikeja GRA',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(12),
    slug: 'yaba-creative-studio',
    name: 'Yaba Creative Studio',
    shortDescription:
      'An easygoing studio with a small work area and a compact kitchen. Explore Yaba from a simple and comfortable home base.',
    fullDescription:
      'This studio brings the sleeping, lounge and kitchenette areas together in an efficient layout. Its address is fictional placeholder information.',
    nightlyPrice: 25000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Yaba, Lagos',
    locality: 'Yaba',
    region: 'Lagos',
    addressLine1: '4 Placeholder Way, Yaba',
    amenities: ['wifi', 'air-conditioning', 'kitchen', 'security'],
  },
  {
    id: id(14),
    slug: 'maitama-residence-one-bedroom',
    name: 'Maitama Residence One Bedroom',
    shortDescription:
      'A refined serviced apartment with a separate bedroom and quiet lounge. Enjoy a convenient stay in central Maitama.',
    fullDescription:
      'This one-bedroom home offers a practical kitchen, lounge and reliable building security. The listing address is fictional and for seeding only.',
    nightlyPrice: 105000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Maitama, Abuja',
    locality: 'Maitama',
    region: 'Abuja',
    addressLine1: '6 Placeholder Boulevard, Maitama',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
      'gym',
    ],
  },
  {
    id: id(15),
    slug: 'maitama-family-three-bedroom',
    name: 'Maitama Family Three Bedroom',
    shortDescription:
      'A spacious three-bedroom flat with a comfortable family lounge. Settle in with room for shared meals and relaxed evenings.',
    fullDescription:
      'Three bedrooms, a fitted kitchen and a welcoming living area make this apartment suited to families. Its location and address are illustrative only.',
    nightlyPrice: 195000,
    bedrooms: 3,
    bathrooms: 3,
    maxGuests: 6,
    displayLocation: 'Maitama, Abuja',
    locality: 'Maitama',
    region: 'Abuja',
    addressLine1: '10 Placeholder Close, Maitama',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
      'pool',
      'gym',
    ],
  },
  {
    id: id(16),
    slug: 'wuse-two-city-studio',
    name: 'Wuse 2 City Studio',
    shortDescription:
      'A neat studio for guests who value a simple, central base. The open-plan layout includes a kitchenette and a place to work.',
    fullDescription:
      'A compact city studio designed for short stays, with a sleeping area, lounge chair and kitchenette. Fictional address provided for development use.',
    nightlyPrice: 42000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Wuse 2, Abuja',
    locality: 'Wuse 2',
    region: 'Abuja',
    addressLine1: '13 Placeholder Street, Wuse 2',
    amenities: ['wifi', 'air-conditioning', 'security', 'kitchen'],
  },
  {
    id: id(17),
    slug: 'wuse-two-serviced-apartment',
    name: 'Wuse 2 Serviced Apartment',
    shortDescription:
      'A well-proportioned one-bedroom apartment with a comfortable lounge. It offers a convenient setting for work trips or a city break.',
    fullDescription:
      'The one-bedroom arrangement includes a fitted kitchen, lounge and secure parking. All property data is sample content pending confirmation.',
    nightlyPrice: 68000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Wuse 2, Abuja',
    locality: 'Wuse 2',
    region: 'Abuja',
    addressLine1: '21 Placeholder Crescent, Wuse 2',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(19),
    slug: 'ph-gra-serviced-one-bedroom',
    name: 'Port Harcourt GRA Serviced One Bedroom',
    shortDescription:
      'A comfortable one-bedroom stay with a separate lounge and kitchen. Unwind between meetings or visits around GRA.',
    fullDescription:
      'This serviced apartment features a separate bedroom, a fitted kitchen and a calm living space. The address shown is a made-up placeholder.',
    nightlyPrice: 62000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'GRA, Port Harcourt',
    locality: 'GRA',
    region: 'Rivers',
    addressLine1: '2 Placeholder Close, GRA',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(20),
    slug: 'ph-gra-family-three-bedroom',
    name: 'Port Harcourt GRA Family Three Bedroom',
    shortDescription:
      'A generous family flat with three bedrooms and a shared dining space. Make yourself at home during a longer visit.',
    fullDescription:
      'This apartment has three bedrooms, two bathrooms and a full kitchen for everyday convenience. The property address is fictional sample content.',
    nightlyPrice: 112000,
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    displayLocation: 'GRA, Port Harcourt',
    locality: 'GRA',
    region: 'Rivers',
    addressLine1: '17 Placeholder Drive, GRA',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(21),
    slug: 'ph-gra-garden-penthouse',
    name: 'Port Harcourt GRA Garden Penthouse',
    shortDescription:
      'A polished two-bedroom penthouse with a private outdoor seating area. Enjoy extra space in a quiet GRA setting.',
    fullDescription:
      'The penthouse offers two bedrooms, a roomy lounge and a private terrace garden. This listing is illustrative and should be verified before publication.',
    nightlyPrice: 205000,
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 4,
    displayLocation: 'GRA, Port Harcourt',
    locality: 'GRA',
    region: 'Rivers',
    addressLine1: '30 Placeholder Gardens, GRA',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
      'pool',
      'gym',
    ],
  },
  {
    id: id(22),
    slug: 'ph-gra-comfort-studio',
    name: 'Port Harcourt GRA Comfort Studio',
    shortDescription:
      'A simple, well-kept studio with a kitchenette and a comfortable sleeping area. A budget-friendly option for a short GRA stay.',
    fullDescription:
      'This compact studio includes a practical kitchenette and a small sitting area. All content and address are fictional placeholders.',
    nightlyPrice: 32000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'GRA, Port Harcourt',
    locality: 'GRA',
    region: 'Rivers',
    addressLine1: '9 Placeholder Lane, GRA',
    amenities: ['wifi', 'air-conditioning', 'security', 'kitchen'],
  },
  {
    id: id(23),
    slug: 'ibadan-jericho-one-bedroom',
    name: 'Ibadan Jericho One Bedroom',
    shortDescription:
      'A relaxed serviced apartment with a separate bedroom and comfortable lounge. Enjoy an easy home base in Jericho.',
    fullDescription:
      'This one-bedroom apartment features a fitted kitchen and a quiet sitting area. The address is fictional sample data that must be replaced.',
    nightlyPrice: 45000,
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    displayLocation: 'Jericho, Ibadan',
    locality: 'Jericho',
    region: 'Oyo',
    addressLine1: '3 Placeholder Road, Jericho',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
  {
    id: id(24),
    slug: 'ibadan-bodija-family-apartment',
    name: 'Ibadan Bodija Family Apartment',
    shortDescription:
      'A family-friendly three-bedroom flat with an open lounge and dining area. Settle in with room for everyone to feel at ease.',
    fullDescription:
      'The apartment includes three bedrooms, a full kitchen and a shared dining space. Address and amenities are illustrative placeholders for development.',
    nightlyPrice: 76000,
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    displayLocation: 'Bodija, Ibadan',
    locality: 'Bodija',
    region: 'Oyo',
    addressLine1: '15 Placeholder Avenue, Bodija',
    amenities: [
      'wifi',
      'air-conditioning',
      'backup-power',
      'parking',
      'security',
      'kitchen',
    ],
  },
];

const amenityRows = [
  ['wifi', 'Wi-Fi', 'wifi'],
  ['air-conditioning', 'Air conditioning', 'air-conditioning'],
  ['backup-power', '24/7 power backup', 'power'],
  ['parking', 'Parking', 'parking'],
  ['security', 'Security', 'security'],
  ['kitchen', 'Kitchen', 'kitchen'],
  ['pool', 'Swimming pool', 'pool'],
  ['gym', 'Gym', 'fitness'],
].map(([slug, name, iconKey], index) => ({
  id: id(100 + index),
  slug,
  name,
  icon_key: iconKey,
}));

const createdAt = new Date('2026-11-02T00:00:00.000Z');
const blockRows = [
  {
    id: id(201),
    apartment_id: id(3),
    start_date: '2027-02-10',
    end_date: '2027-02-13',
    reason: 'SEEDER PLACEHOLDER: maintenance test block',
  },
  {
    id: id(202),
    apartment_id: id(6),
    start_date: '2027-03-04',
    end_date: '2027-03-07',
    reason: 'SEEDER PLACEHOLDER: owner-use test block',
  },
  {
    id: id(203),
    apartment_id: id(15),
    start_date: '2027-04-18',
    end_date: '2027-04-21',
    reason: 'SEEDER PLACEHOLDER: maintenance test block',
  },
  {
    id: id(204),
    apartment_id: id(21),
    start_date: '2027-05-08',
    end_date: '2027-05-11',
    reason: 'SEEDER PLACEHOLDER: owner-use test block',
  },
].map((block) => ({
  ...block,
  created_by_admin_id: null,
  created_at: createdAt,
  updated_at: createdAt,
  deleted_at: null,
}));

const seedImageRows = apartmentRows.map((apartment, index) => ({
  id: id(300 + index),
  apartment_id: apartment.id,
  object_key: `PLACEHOLDER_REPLACE_WITH_UPLOADED_IMAGE/${apartment.slug}/cover.jpg`,
  alt_text: `Placeholder image for ${apartment.name}; replace with an approved property photograph`,
  position: 0,
  is_cover: true,
  // Placeholder object keys are intentionally excluded from public results until real files are uploaded.
  is_published: false,
  created_at: createdAt,
  updated_at: createdAt,
  deleted_at: null,
}));

const apartmentRecords = apartmentRows.map((apartment) => ({
  id: apartment.id,
  slug: apartment.slug,
  name: apartment.name,
  short_description: apartment.shortDescription,
  full_description: apartment.fullDescription,
  nightly_price: apartment.nightlyPrice,
  currency: 'NGN',
  bedrooms: apartment.bedrooms,
  bathrooms: apartment.bathrooms,
  max_guests: apartment.maxGuests,
  display_location: apartment.displayLocation,
  address_line1: apartment.addressLine1,
  locality: apartment.locality,
  region: apartment.region,
  country_code: 'NG',
  status: 'published',
  min_stay_nights: 1,
  max_stay_nights: 30,
  house_rules: JSON.stringify([
    'Fictional sample listing: confirm property rules with the owner.',
  ]),
  check_in_policy:
    'Placeholder policy: confirm check-in details with the property owner.',
  check_out_policy:
    'Placeholder policy: confirm check-out details with the property owner.',
  cancellation_policy:
    'Placeholder policy: confirm cancellation terms before booking.',
  created_at: createdAt,
  updated_at: createdAt,
  deleted_at: null,
}));

async function insertIgnoringDuplicates(
  queryInterface: QueryInterface,
  table: string,
  rows: object[],
  transaction: Transaction,
) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const replacements = Object.fromEntries(
      columns.map((column) => [
        column,
        (row as Record<string, unknown>)[column],
      ]),
    );
    const values = columns.map((column) => `:${column}`).join(', ');
    const names = columns.map((column) => `"${column}"`).join(', ');
    await queryInterface.sequelize.query(
      `INSERT INTO "${table}" (${names}) VALUES (${values}) ON CONFLICT DO NOTHING`,
      { replacements, transaction },
    );
  }
}

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await insertIgnoringDuplicates(
      queryInterface,
      'amenities',
      amenityRows.map((amenity) => ({ ...amenity, created_at: createdAt })),
      transaction,
    );
    await insertIgnoringDuplicates(
      queryInterface,
      'apartments',
      apartmentRecords,
      transaction,
    );
    const existingApartmentIds = new Set(
      (
        (await queryInterface.sequelize.query<{ id: string }>(
          'SELECT id FROM apartments WHERE id IN (:ids)',
          {
            replacements: {
              ids: apartmentRows.map((apartment) => apartment.id),
            },
            transaction,
            type: QueryTypes.SELECT,
          },
        )) as Array<{ id: string }>
      ).map((row) => row.id),
    );
    const apartmentImages = seedImageRows.filter((image) =>
      existingApartmentIds.has(image.apartment_id),
    );
    await insertIgnoringDuplicates(
      queryInterface,
      'apartment_images',
      apartmentImages,
      transaction,
    );
    await insertIgnoringDuplicates(
      queryInterface,
      'availability_blocks',
      blockRows.filter((block) => existingApartmentIds.has(block.apartment_id)),
      transaction,
    );

    const amenityIds = (await queryInterface.sequelize.query<{
      id: string;
      slug: string;
    }>('SELECT id, slug FROM amenities WHERE slug IN (:slugs)', {
      replacements: { slugs: amenityRows.map((amenity) => amenity.slug) },
      transaction,
      type: QueryTypes.SELECT,
    })) as Array<{ id: string; slug: string }>;
    const amenityIdBySlug = new Map(
      amenityIds.map((amenity) => [amenity.slug, amenity.id]),
    );
    const links = apartmentRows
      .filter((apartment) => existingApartmentIds.has(apartment.id))
      .flatMap((apartment) =>
        apartment.amenities.map((slug) => ({
          apartment_id: apartment.id,
          amenity_id: amenityIdBySlug.get(slug)!,
        })),
      );
    await insertIgnoringDuplicates(
      queryInterface,
      'apartment_amenities',
      links,
      transaction,
    );
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const apartmentIds = apartmentRows.map((apartment) => apartment.id);
    const amenityIds = amenityRows.map((amenity) => amenity.id);
    await queryInterface.bulkDelete(
      'availability_blocks',
      { id: blockRows.map((block) => block.id) },
      { transaction },
    );
    await queryInterface.bulkDelete(
      'apartment_amenities',
      { apartment_id: apartmentIds },
      { transaction },
    );
    await queryInterface.bulkDelete(
      'apartment_images',
      { id: seedImageRows.map((image) => image.id) },
      { transaction },
    );
    await queryInterface.bulkDelete(
      'apartments',
      { id: apartmentIds },
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DELETE FROM amenities AS amenity
       WHERE amenity.id IN (:ids)
         AND NOT EXISTS (
           SELECT 1 FROM apartment_amenities AS link
           WHERE link.amenity_id = amenity.id
         )`,
      { replacements: { ids: amenityIds }, transaction },
    );
  });
}

export const seedRecordCount = apartmentRows.length;
export const seededApartmentIds = apartmentRows.map(
  (apartment) => apartment.id,
);
