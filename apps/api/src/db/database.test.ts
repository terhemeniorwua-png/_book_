import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.skipIf(!enabled)('PostgreSQL schema and inventory integrity', () => {
  let db: import('sequelize').Sequelize;
  let models: typeof import('./models/index.js');
  let transaction: import('sequelize').Transaction;

  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl)
      throw new Error(
        'TEST_DATABASE_URL is required for database integration tests.',
      );
    process.env.NODE_ENV = 'test';
    const { Sequelize } = await import('sequelize');
    db = new Sequelize(testUrl, { logging: false });
    const { createMigrator } = await import('./migrate.js');
    const migrator = createMigrator(db);
    await migrator.up();
    await migrator.down({ step: 3 });
    await migrator.up();
    models = await import('./models/index.js');
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    transaction = await db.transaction();
  });

  afterEach(async () => {
    if (transaction) await transaction.rollback();
  });

  it('loads associations, required attributes, uniqueness, and indexes from migrations', async () => {
    expect(models.Apartment.associations.amenities).toBeDefined();
    expect(models.Booking.associations.guest).toBeDefined();
    expect(models.Booking.associations.paymentTransactions).toBeDefined();
    await expect(models.Apartment.build({}).validate()).rejects.toThrow();

    const indexes = (await db
      .getQueryInterface()
      .showIndex('apartments', { transaction })) as Array<{ name: string }>;
    expect(
      indexes.some((index) => index.name === 'apartments_public_status_idx'),
    ).toBe(true);
    const slug = `unique-${crypto.randomUUID()}`;
    const apartmentData = {
      slug,
      name: 'Unique test apartment',
      shortDescription: 'Short description',
      fullDescription: 'Full description',
      nightlyPrice: '100.00',
      currency: 'NGN',
      bedrooms: 1,
      bathrooms: '1.0',
      maxGuests: 2,
      displayLocation: 'Lagos',
      countryCode: 'NG',
      status: 'draft',
      minStayNights: 1,
    };
    await models.Apartment.create(apartmentData, { transaction });
    await expect(
      models.Apartment.create(apartmentData, { transaction }),
    ).rejects.toThrow();
  });

  it('enforces case-insensitive administrator email uniqueness', async () => {
    const email = `Admin-${crypto.randomUUID()}@example.test`;
    const attributes = {
      email,
      passwordHash: 'test-only-placeholder-hash',
      displayName: 'Test administrator',
      role: 'manager',
    };
    await models.AdminAccount.create(attributes, { transaction });
    await expect(
      models.AdminAccount.create(
        { ...attributes, email: email.toUpperCase() },
        { transaction },
      ),
    ).rejects.toThrow();
  });

  it('limits public apartment queries to published listings', async () => {
    const draft = await makeApartment(models, transaction);
    const published = await makeApartment(models, transaction, 'published');
    await published.update({ status: 'published' }, { transaction });
    const visible = await models.Apartment.scope('public').findAll({
      attributes: ['slug'],
      transaction,
    });
    const visibleSlugs = visible.map((apartment) => apartment.get('slug'));
    expect(visibleSlugs).toContain(published.get('slug'));
    expect(visibleSlugs).not.toContain(draft.get('slug'));
  });

  it('rejects overlapping reservations', async () => {
    const apartment = await makeApartment(models, transaction);
    const guestA = await makeGuest(models, transaction, 'a');
    const guestB = await makeGuest(models, transaction, 'b');
    await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      guestA.get('id') as string,
      '2035-06-01',
      '2035-06-04',
    );
    await expect(
      makeBooking(
        models,
        transaction,
        apartment.get('id') as string,
        guestB.get('id') as string,
        '2035-06-03',
        '2035-06-06',
      ),
    ).rejects.toThrow();
  });

  it('permits checkout and check-in on the same date', async () => {
    const apartment = await makeApartment(models, transaction);
    const guestA = await makeGuest(models, transaction, 'adjacent-a');
    const guestB = await makeGuest(models, transaction, 'adjacent-b');
    await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      guestA.get('id') as string,
      '2035-06-01',
      '2035-06-04',
    );
    await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      guestB.get('id') as string,
      '2035-06-04',
      '2035-06-06',
    );
  });

  it('allows only one of two concurrent overlapping reservation transactions', async () => {
    const apartment = await makeApartment(models, transaction);
    const guestA = await makeGuest(models, transaction, 'concurrent-a');
    const guestB = await makeGuest(models, transaction, 'concurrent-b');
    const apartmentId = apartment.get('id') as string;
    const guestAId = guestA.get('id') as string;
    const guestBId = guestB.get('id') as string;
    await transaction.commit();
    transaction = await db.transaction();

    try {
      const results = await Promise.allSettled([
        db.transaction((tx) =>
          makeBooking(
            models,
            tx,
            apartmentId,
            guestAId,
            '2035-09-01',
            '2035-09-05',
          ),
        ),
        db.transaction((tx) =>
          makeBooking(
            models,
            tx,
            apartmentId,
            guestBId,
            '2035-09-01',
            '2035-09-05',
          ),
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
    } finally {
      await models.Booking.destroy({
        where: { apartmentId },
        force: true,
        transaction,
      });
      await models.Guest.destroy({
        where: { id: [guestAId, guestBId] },
        force: true,
        transaction,
      });
      await models.Apartment.destroy({
        where: { id: apartmentId },
        force: true,
        transaction,
      });
      await transaction.commit();
      transaction = await db.transaction();
    }
  });

  it('releases expired pending holds before accepting a replacement claim', async () => {
    const apartment = await makeApartment(models, transaction);
    const guestA = await makeGuest(models, transaction, 'expired');
    const guestB = await makeGuest(models, transaction, 'replacement');
    const stale = await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      guestA.get('id') as string,
      '2035-07-01',
      '2035-07-04',
      {
        expiresAt: new Date(Date.now() - 60_000),
      },
    );
    await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      guestB.get('id') as string,
      '2035-07-01',
      '2035-07-04',
    );
    await stale.reload({ transaction });
    expect(stale.get('status')).toBe('expired');
  });

  it('uses the same exclusion constraint for manual availability blocks', async () => {
    const apartment = await makeApartment(models, transaction);
    const guest = await makeGuest(models, transaction, 'blocked');
    await models.AvailabilityBlock.create(
      {
        apartmentId: apartment.get('id') as string,
        startDate: '2035-08-01',
        endDate: '2035-08-03',
        reason: 'Maintenance',
      },
      { transaction },
    );
    await expect(
      makeBooking(
        models,
        transaction,
        apartment.get('id') as string,
        guest.get('id') as string,
        '2035-08-02',
        '2035-08-04',
      ),
    ).rejects.toThrow();
  });
});

async function makeApartment(
  models: typeof import('./models/index.js'),
  transaction: import('sequelize').Transaction,
  suffix = '',
) {
  return models.Apartment.create(
    {
      slug: `db-test-${suffix}-${crypto.randomUUID()}`,
      name: 'Test apartment',
      shortDescription: 'Short',
      fullDescription: 'Full',
      nightlyPrice: '100.00',
      currency: 'NGN',
      bedrooms: 1,
      bathrooms: '1.0',
      maxGuests: 2,
      displayLocation: 'Lagos',
      countryCode: 'NG',
      status: 'draft',
      minStayNights: 1,
    },
    { transaction },
  );
}

async function makeGuest(
  models: typeof import('./models/index.js'),
  transaction: import('sequelize').Transaction,
  label: string,
) {
  return models.Guest.create(
    {
      firstName: 'Test',
      lastName: label,
      email: `${label}-${crypto.randomUUID()}@example.test`,
    },
    { transaction },
  );
}

async function makeBooking(
  models: typeof import('./models/index.js'),
  transaction: import('sequelize').Transaction,
  apartmentId: string,
  guestId: string,
  checkIn: string,
  checkOut: string,
  options: { expiresAt?: Date } = {},
) {
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000;
  return models.Booking.create(
    {
      apartmentId,
      guestId,
      checkIn,
      checkOut,
      guestCount: 1,
      nights,
      priceBreakdown: {
        nightly: [],
        charges: [],
        subtotal: '100.00',
        total: '100.00',
      },
      totalAmount: '100.00',
      currency: 'NGN',
      status: 'pending',
      paymentStatus: 'unpaid',
      expiresAt: options.expiresAt ?? new Date(Date.now() + 15 * 60_000),
    },
    { transaction },
  );
}
