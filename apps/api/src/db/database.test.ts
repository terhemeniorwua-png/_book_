import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';

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
    await migrator.down({ step: 7 });
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
    expect(models.Booking.associations.cancellation).toBeDefined();
    expect(models.Booking.associations.refund).toBeDefined();
    expect(models.BookingCancellation.associations.refund).toBeDefined();
    expect(models.BookingRefund.associations.payment).toBeDefined();
    expect(models.EmailNotification).toBeDefined();
    expect(
      models.Booking.rawAttributes.privacyNoticeAcknowledgedAt,
    ).toBeDefined();
    expect(models.Booking.rawAttributes.privacyNoticeVersion).toBeDefined();
    expect(
      models.EmailNotification.rawAttributes.deduplicationKey,
    ).toBeDefined();
    expect(
      models.EmailNotification.rawAttributes.providerMessageId,
    ).toBeDefined();
    expect(models.PaymentTransaction.associations.stateEvents).toBeDefined();
    expect(models.PaymentWebhookEvent).toBeDefined();
    expect(models.AdminAccount.associations.sessions).toBeDefined();
    expect(models.AdminAccount.associations.auditEvents).toBeDefined();
    await expect(models.AdminSession.build({}).validate()).rejects.toThrow();
    await expect(models.AdminAuditEvent.build({}).validate()).rejects.toThrow();
    await expect(models.Apartment.build({}).validate()).rejects.toThrow();

    const indexes = (await db
      .getQueryInterface()
      .showIndex('apartments', { transaction })) as Array<{ name: string }>;
    expect(
      indexes.some((index) => index.name === 'apartments_public_status_idx'),
    ).toBe(true);
    const paymentIndexes = (await db
      .getQueryInterface()
      .showIndex('payment_transactions', { transaction })) as Array<{
      name: string;
    }>;
    expect(
      paymentIndexes.some(
        (index) =>
          index.name ===
          'payment_transactions_one_active_attempt_per_booking_uq',
      ),
    ).toBe(true);
    const cancellationIndexes = (await db
      .getQueryInterface()
      .showIndex('booking_cancellation_tokens', { transaction })) as Array<{
      name: string;
      unique?: boolean;
    }>;
    expect(
      cancellationIndexes.some(
        (index) =>
          index.name === 'booking_cancellation_tokens_one_active_uq' &&
          index.unique,
      ),
    ).toBe(true);
    const refundIndexes = (await db
      .getQueryInterface()
      .showIndex('booking_refunds', { transaction })) as Array<{
      name: string;
    }>;
    expect(
      refundIndexes.some(
        (index) => index.name === 'booking_refunds_status_created_idx',
      ),
    ).toBe(true);
    const webhookIndexes = (await db
      .getQueryInterface()
      .showIndex('payment_webhook_events', { transaction })) as Array<{
      name: string;
      unique?: boolean;
      fields?: Array<{ attribute: string }>;
    }>;
    expect(
      webhookIndexes.some(
        (index) =>
          index.unique &&
          index.fields?.some(
            (field: { attribute: string }) => field.attribute === 'event_hash',
          ),
      ),
    ).toBe(true);
    const emailIndexes = (await db
      .getQueryInterface()
      .showIndex('email_notifications', { transaction })) as Array<{
      name: string;
      unique?: boolean;
    }>;
    expect(
      emailIndexes.some(
        (index) =>
          index.name === 'email_notifications_deduplication_key_uq' &&
          index.unique,
      ),
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

  it('creates administrator sessions and durable audit rows with indexed token hashes', async () => {
    const admin = await models.AdminAccount.create(
      {
        email: `session-${crypto.randomUUID()}@example.test`,
        passwordHash: 'test-only-placeholder-hash',
        displayName: 'Test operator',
        role: 'manager',
      },
      { transaction },
    );
    const session = await models.AdminSession.create(
      {
        adminAccountId: admin.get('id'),
        tokenHash: createHash('sha256')
          .update(crypto.randomUUID())
          .digest('hex'),
        csrfTokenHash: createHash('sha256')
          .update(crypto.randomUUID())
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
      },
      { transaction },
    );
    const audit = await models.AdminAuditEvent.create(
      {
        adminAccountId: admin.get('id'),
        action: 'test.apartment_update',
        targetType: 'apartment',
        targetId: crypto.randomUUID(),
        metadata: { changedFields: ['name'] },
      },
      { transaction },
    );
    expect(session.get('adminAccountId')).toBe(admin.get('id'));
    expect(audit.get('metadata')).toEqual({ changedFields: ['name'] });
    const indexes = (await db
      .getQueryInterface()
      .showIndex('admin_sessions', { transaction })) as Array<{
      name: string;
      unique?: boolean;
    }>;
    expect(
      indexes.some(
        (index) =>
          index.name === 'admin_sessions_token_hash_uq' && index.unique,
      ),
    ).toBe(true);
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

  it('serves only published apartments with validated filters and a safe public projection', async () => {
    const published = await makeApartment(
      models,
      transaction,
      'catalog-public',
    );
    const draft = await makeApartment(models, transaction, 'catalog-draft');
    await published.update(
      {
        status: 'published',
        addressLine1: 'Private street 99',
        displayLocation: 'Central District',
        nightlyPrice: '250.00',
        houseRules: ['No smoking'],
        checkInPolicy: 'After 15:00',
      },
      { transaction },
    );
    await draft.update({ status: 'draft' }, { transaction });
    const wifi = await models.Amenity.create(
      { slug: `wifi-${crypto.randomUUID()}`, name: 'Wi-Fi' },
      { transaction },
    );
    await models.ApartmentAmenity.create(
      {
        apartmentId: published.get('id') as string,
        amenityId: wifi.get('id') as string,
      },
      { transaction },
    );
    await models.ApartmentCharge.create(
      {
        apartmentId: published.get('id') as string,
        name: 'Cleaning fee',
        chargeType: 'fee',
        calculationBasis: 'flat',
        amount: '75.00',
        currency: 'NGN',
        isRequired: true,
        isActive: true,
      },
      { transaction },
    );
    await transaction.commit();
    transaction = await db.transaction();

    const { createApp } = await import('../app.js');
    const { validateEnvironment } = await import('../config/env.js');
    const catalogApp = createApp();
    try {
      const listing = await request(catalogApp).get(
        '/api/v1/apartments?minPrice=200&guests=2',
      );
      expect(listing.status).toBe(200);
      expect(
        listing.body.items.map((item: { slug: string }) => item.slug),
      ).toContain(published.get('slug'));
      expect(
        listing.body.items.map((item: { slug: string }) => item.slug),
      ).not.toContain(draft.get('slug'));
      const filteredByAmenity = await request(catalogApp).get(
        `/api/v1/apartments?amenities=${wifi.get('slug')}`,
      );
      expect(filteredByAmenity.status).toBe(200);
      expect(
        filteredByAmenity.body.items.map((item: { slug: string }) => item.slug),
      ).toContain(published.get('slug'));
      const publicRow = listing.body.items.find(
        (item: { slug: string }) => item.slug === published.get('slug'),
      );
      expect(publicRow.addressLine1).toBeUndefined();
      expect(publicRow.objectKey).toBeUndefined();

      const details = await request(catalogApp).get(
        `/api/v1/apartments/${published.get('slug')}`,
      );
      expect(details.status).toBe(200);
      expect(details.body.item.houseRules).toEqual(['No smoking']);
      expect(details.body.item.checkInPolicy).toBe('After 15:00');
      expect(details.body.item.pricing.additionalCharges).toEqual([
        expect.objectContaining({
          name: 'Cleaning fee',
          calculationBasis: 'flat',
          amount: '75.00',
          required: true,
        }),
      ]);
      expect(details.body.item.addressLine1).toBeUndefined();

      expect(
        (
          await request(catalogApp).get(
            `/api/v1/apartments/${draft.get('slug')}`,
          )
        ).status,
      ).toBe(404);
      expect(
        (await request(catalogApp).get('/api/v1/apartments?page=0')).status,
      ).toBe(400);
      expect(
        (
          await request(catalogApp).get(
            '/api/v1/apartments?minPrice=300&maxPrice=100',
          )
        ).status,
      ).toBe(400);

      const limitedApp = createApp(
        validateEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: 'postgres://test:unused@localhost/test',
          RATE_LIMIT_MAX: '300',
          RATE_LIMIT_APARTMENT_MAX: '1',
        }),
      );
      expect((await request(limitedApp).get('/api/v1/apartments')).status).toBe(
        200,
      );
      expect((await request(limitedApp).get('/api/v1/apartments')).status).toBe(
        429,
      );
    } finally {
      await models.Apartment.destroy({
        where: { id: [published.get('id'), draft.get('id')] },
        force: true,
        transaction,
      });
      await models.Amenity.destroy({
        where: { id: wifi.get('id') },
        transaction,
      });
      await transaction.commit();
      transaction = await db.transaction();
    }
  });

  it('creates a priced pending reservation once and protects checkout with its access token', async () => {
    const apartment = await makeApartment(models, transaction, 'checkout');
    await apartment.update(
      { status: 'published', nightlyPrice: '200.00', maxGuests: 3 },
      { transaction },
    );
    await models.ApartmentCharge.create(
      {
        apartmentId: apartment.get('id') as string,
        name: 'Nightly service fee',
        chargeType: 'fee',
        calculationBasis: 'per_night',
        amount: '10.00',
        currency: 'NGN',
        isRequired: true,
        isActive: true,
      },
      { transaction },
    );
    await transaction.commit();
    transaction = await db.transaction();

    const { createApp } = await import('../app.js');
    const bookingApp = createApp();
    const idempotencyKey = '1'.repeat(64);
    const accessToken = '2'.repeat(64);
    const payload = {
      apartmentId: apartment.get('id'),
      checkIn: '2030-08-01',
      checkOut: '2030-08-03',
      guestCount: 2,
      fullName: '  Ada   Guest  ',
      email: 'ADA.GUEST@EXAMPLE.TEST',
      phone: '08031234567',
      specialRequests: 'A quiet room, please.',
      acceptedTerms: true,
      acceptedTermsVersion: 'booking-terms-v1',
      acceptedPrivacyNotice: true,
      privacyNoticeVersion: 'privacy-notice-v1',
    };

    try {
      const headers = {
        'Idempotency-Key': idempotencyKey,
        Authorization: `Bearer ${accessToken}`,
      };
      const submissions = await Promise.all([
        request(bookingApp).post('/api/v1/bookings').set(headers).send(payload),
        request(bookingApp).post('/api/v1/bookings').set(headers).send(payload),
      ]);
      expect(submissions.map((submission) => submission.status).sort()).toEqual(
        [200, 201],
      );
      const created = submissions.find(
        (submission) => submission.status === 201,
      )!;
      const repeated = submissions.find(
        (submission) => submission.status === 200,
      )!;
      expect(repeated.body.bookingReference).toBe(
        created.body.bookingReference,
      );
      expect(created.body.totalAmount).toBe('420.00');
      expect(created.body.priceBreakdown.charges[0].lineTotal).toBe('20.00');
      expect(JSON.stringify(created.body)).not.toContain('ADA.GUEST');
      expect(JSON.stringify(created.body)).not.toContain('08031234567');

      const duplicates = await models.Booking.count({
        where: {
          idempotencyKeyHash: createHash('sha256')
            .update(idempotencyKey)
            .digest('hex'),
        },
        transaction,
      });
      const guests = await models.Guest.count({ transaction });
      expect(duplicates).toBe(1);
      expect(guests).toBe(1);
      const storedBooking = await models.Booking.findOne({
        where: {
          idempotencyKeyHash: createHash('sha256')
            .update(idempotencyKey)
            .digest('hex'),
        },
        transaction,
      });
      const storedGuest = storedBooking
        ? await models.Guest.findByPk(storedBooking.get('guestId') as string, {
            transaction,
          })
        : null;
      expect(storedGuest?.get('email')).toBe('ada.guest@example.test');
      expect(storedGuest?.get('phone')).toBe('+2348031234567');
      expect(storedBooking?.get('termsVersion')).toBe('booking-terms-v1');
      expect(storedBooking?.get('termsAcceptedAt')).toBeTruthy();
      expect(storedBooking?.get('privacyNoticeVersion')).toBe(
        'privacy-notice-v1',
      );
      expect(storedBooking?.get('privacyNoticeAcknowledgedAt')).toBeTruthy();
      expect(storedBooking?.get('acceptedPolicySnapshot')).toEqual({
        checkInPolicy: null,
        checkOutPolicy: null,
        cancellationPolicy: null,
        houseRules: [],
        timeZone: 'Africa/Lagos',
        checkInTime: '14:00',
      });

      const reference = created.body.bookingReference as string;
      expect(
        (
          await request(bookingApp).get(
            `/api/v1/bookings/${reference}/checkout`,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(bookingApp)
            .get(`/api/v1/bookings/${reference}/checkout`)
            .set('Authorization', `Bearer ${'3'.repeat(64)}`)
        ).status,
      ).toBe(404);
      const checkout = await request(bookingApp)
        .get(`/api/v1/bookings/${reference}/checkout`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(checkout.status).toBe(200);
      expect(checkout.body.item.totalAmount).toBe('420.00');
      expect(checkout.body.item.apartment.id).toBe(apartment.get('id'));
      expect(JSON.stringify(checkout.body)).not.toContain(
        'ada.guest@example.test',
      );

      const conflict = await request(bookingApp)
        .post('/api/v1/bookings')
        .set(headers)
        .send({ ...payload, fullName: 'A different guest' });
      expect(conflict.status).toBe(409);
      expect(
        (
          await request(bookingApp)
            .post('/api/v1/bookings')
            .set(headers)
            .send({ ...payload, fullName: undefined })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(bookingApp)
            .post('/api/v1/bookings')
            .set(headers)
            .send({ ...payload, acceptedTerms: false })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(bookingApp)
            .post('/api/v1/bookings')
            .set(headers)
            .send({ ...payload, acceptedPrivacyNotice: false })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(bookingApp)
            .post('/api/v1/bookings')
            .set(headers)
            .send({
              ...payload,
              acceptedTermsVersion: 'newer-unaccepted-version',
            })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(bookingApp)
            .post('/api/v1/bookings')
            .set(headers)
            .send({ ...payload, email: 'nope' })
        ).status,
      ).toBe(400);
      const invalidPhone = await request(bookingApp)
        .post('/api/v1/bookings')
        .set(headers)
        .send({ ...payload, phone: '0000000' });
      expect(invalidPhone.status).toBe(400);
      expect(invalidPhone.body.error.message).toContain('valid phone number');
    } finally {
      const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
      const booking = await models.Booking.findOne({
        where: { idempotencyKeyHash: keyHash },
        transaction,
      });
      if (booking) {
        const guestId = booking.get('guestId') as string;
        await booking.destroy({ force: true, transaction });
        await models.Guest.destroy({
          where: { id: guestId },
          force: true,
          transaction,
        });
      }
      await models.Apartment.destroy({
        where: { id: apartment.get('id') },
        force: true,
        transaction,
      });
      await transaction.commit();
      transaction = await db.transaction();
    }
  });

  it('serves private-free availability and server-priced quotes, expires stale holds, and enforces booking rules', async () => {
    const apartment = await makeApartment(models, transaction, 'availability');
    await apartment.update(
      {
        status: 'published',
        nightlyPrice: '200.00',
        maxGuests: 3,
        minStayNights: 2,
        maxStayNights: 8,
        checkInPolicy: 'Check-in after 15:00',
        checkOutPolicy: 'Check-out before 11:00',
      },
      { transaction },
    );
    await models.ApartmentCharge.create(
      {
        apartmentId: apartment.get('id') as string,
        name: 'Nightly service fee',
        chargeType: 'fee',
        calculationBasis: 'per_night',
        amount: '10.00',
        currency: 'NGN',
        isRequired: true,
        isActive: true,
      },
      { transaction },
    );
    const privateGuest = await makeGuest(
      models,
      transaction,
      'availability-private',
    );
    const draftApartment = await makeApartment(
      models,
      transaction,
      'availability-draft',
    );
    const expired = await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      privateGuest.get('id') as string,
      '2035-10-01',
      '2035-10-03',
      { expiresAt: new Date(Date.now() - 60_000) },
    );
    await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      privateGuest.get('id') as string,
      '2035-10-05',
      '2035-10-08',
    );
    const confirmed = await makeBooking(
      models,
      transaction,
      apartment.get('id') as string,
      privateGuest.get('id') as string,
      '2035-10-12',
      '2035-10-14',
    );
    await confirmed.update({ status: 'confirmed' }, { transaction });
    await models.AvailabilityBlock.create(
      {
        apartmentId: apartment.get('id') as string,
        startDate: '2035-10-20',
        endDate: '2035-10-22',
        reason: 'Maintenance details must remain private',
      },
      { transaction },
    );
    await transaction.commit();
    transaction = await db.transaction();

    const { createApp } = await import('../app.js');
    const availabilityApp = createApp();
    const apartmentId = apartment.get('id') as string;
    const url = `/api/v1/apartments/${apartmentId}`;
    try {
      const availability = await request(availabilityApp).get(
        `${url}/availability?from=2035-10-01&to=2035-10-25`,
      );
      expect(availability.status).toBe(200);
      expect(availability.body.unavailableRanges).toEqual([
        { startDate: '2035-10-05', endDate: '2035-10-08' },
        { startDate: '2035-10-12', endDate: '2035-10-14' },
        { startDate: '2035-10-20', endDate: '2035-10-22' },
      ]);
      expect(JSON.stringify(availability.body)).not.toContain(
        'availability-private',
      );
      expect(JSON.stringify(availability.body)).not.toContain('AB-');
      await expired.reload();
      expect(expired.get('status')).toBe('expired');
      expect(
        (
          await request(availabilityApp).get(
            `/api/v1/apartments/${draftApartment.get('id')}/availability?from=2035-10-01&to=2035-10-03`,
          )
        ).status,
      ).toBe(404);

      const adjacentQuote = await request(availabilityApp).get(
        `${url}/quote?checkIn=2035-10-08&checkOut=2035-10-10&guestCount=2`,
      );
      expect(adjacentQuote.status).toBe(200);
      expect(adjacentQuote.body.totalAmount).toBe('420.00');
      expect(adjacentQuote.body.nights).toBe(2);
      expect(adjacentQuote.body.apartment.checkInPolicy).toBe(
        'Check-in after 15:00',
      );
      expect(adjacentQuote.body.apartment.checkOutPolicy).toBe(
        'Check-out before 11:00',
      );

      expect(
        (
          await request(availabilityApp).get(
            `${url}/quote?checkIn=2035-10-07&checkOut=2035-10-09&guestCount=2`,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request(availabilityApp).get(
            `${url}/quote?checkIn=2035-10-08&checkOut=2035-10-10&guestCount=4`,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(availabilityApp).get(
            `${url}/quote?checkIn=2020-01-01&checkOut=2020-01-03&guestCount=1`,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(availabilityApp).get(
            `${url}/quote?checkIn=2035-10-10&checkOut=2035-10-09&guestCount=1`,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(availabilityApp).get(
            `${url}/availability?from=2035-02-30&to=2035-03-05`,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(availabilityApp).get(
            `/api/v1/apartments/${crypto.randomUUID()}/availability?from=2035-10-01&to=2035-10-03`,
          )
        ).status,
      ).toBe(404);
    } finally {
      const bookingRows = await models.Booking.findAll({
        where: { apartmentId },
        attributes: ['guestId'],
        transaction,
      });
      await models.Booking.destroy({
        where: { apartmentId },
        force: true,
        transaction,
      });
      await models.Guest.destroy({
        where: { id: bookingRows.map((booking) => booking.get('guestId')) },
        force: true,
        transaction,
      });
      await models.Apartment.destroy({
        where: { id: apartmentId },
        force: true,
        transaction,
      });
      await models.Apartment.destroy({
        where: { id: draftApartment.get('id') },
        force: true,
        transaction,
      });
      await transaction.commit();
      transaction = await db.transaction();
    }
  });

  it('prevents concurrent API bookings, rejects client prices, and rolls back a losing guest insert', async () => {
    const apartment = await makeApartment(
      models,
      transaction,
      'api-concurrency',
    );
    await apartment.update({ status: 'published' }, { transaction });
    const apartmentId = apartment.get('id') as string;
    await transaction.commit();
    transaction = await db.transaction();

    const { createApp } = await import('../app.js');
    const bookingApp = createApp();
    const basePayload = {
      apartmentId,
      checkIn: '2035-12-01',
      checkOut: '2035-12-04',
      guestCount: 1,
      email: 'race@example.test',
      phone: '08031234567',
      acceptedTerms: true,
      acceptedTermsVersion: 'booking-terms-v1',
      acceptedPrivacyNotice: true,
      privacyNoticeVersion: 'privacy-notice-v1',
    };
    const makeHeaders = (suffix: string) => ({
      'Idempotency-Key': suffix.repeat(64),
      Authorization: `Bearer ${suffix.repeat(64)}`,
    });
    try {
      const rejectedClientPrice = await request(bookingApp)
        .post('/api/v1/bookings')
        .set(makeHeaders('a'))
        .send({ ...basePayload, fullName: 'Guest A', price: 1 });
      expect(rejectedClientPrice.status).toBe(400);

      const results = await Promise.all([
        request(bookingApp)
          .post('/api/v1/bookings')
          .set(makeHeaders('b'))
          .send({ ...basePayload, fullName: 'Guest B' }),
        request(bookingApp)
          .post('/api/v1/bookings')
          .set(makeHeaders('c'))
          .send({ ...basePayload, fullName: 'Guest C' }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(
        await models.Booking.count({ where: { apartmentId }, transaction }),
      ).toBe(1);
      expect(await models.Guest.count({ transaction })).toBe(1);
    } finally {
      const bookingRows = await models.Booking.findAll({
        where: { apartmentId },
        attributes: ['guestId'],
        transaction,
      });
      await models.Booking.destroy({
        where: { apartmentId },
        force: true,
        transaction,
      });
      await models.Guest.destroy({
        where: { id: bookingRows.map((booking) => booking.get('guestId')) },
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

  it('cancels a paid booking through a token, records an independent refund, and releases inventory', async () => {
    const apartment = await makeApartment(models, transaction, 'cancel');
    await apartment.update(
      {
        status: 'published',
        timezone: 'Africa/Lagos',
        checkInTime: '14:00:00',
      },
      { transaction },
    );
    const guest = await makeGuest(models, transaction, 'cancel');
    const booking = await models.Booking.create(
      {
        apartmentId: apartment.get('id') as string,
        guestId: guest.get('id') as string,
        checkIn: '2030-08-01',
        checkOut: '2030-08-03',
        guestCount: 2,
        nights: 2,
        priceBreakdown: {},
        totalAmount: '200.00',
        currency: 'NGN',
        status: 'confirmed',
        paymentStatus: 'paid',
        acceptedPolicySnapshot: {
          timeZone: 'Africa/Lagos',
          checkInTime: '14:00',
        },
      },
      { transaction },
    );
    const payment = await models.PaymentTransaction.create(
      {
        bookingId: booking.get('id') as string,
        provider: 'paystack',
        transactionReference: `cancel-${crypto.randomUUID()}`,
        expectedAmount: '200.00',
        currency: 'NGN',
        status: 'succeeded',
        verifiedAt: new Date('2030-07-01T00:00:00.000Z'),
      },
      { transaction },
    );
    const { createCancellationToken } = await import(
      '../services/cancellation-tokens.js'
    );
    const token = (
      await createCancellationToken(
        booking.get('id') as string,
        new Date('2030-08-01T13:00:00.000Z'),
        transaction,
      )
    ).token;
    await transaction.commit();
    transaction = await db.transaction();

    const bookingId = String(booking.get('id'));
    try {
      const { confirmCancellation, getCancellationRequest } = await import(
        '../services/booking-cancellation.js'
      );
      const now = new Date('2030-07-01T00:00:00.000Z');
      const summary = await getCancellationRequest(token, now);
      expect(summary.eligible).toBe(true);
      expect(summary.bookingStatus).toBe('confirmed');
      expect(
        (await models.Booking.findByPk(bookingId, { transaction }))?.get(
          'status',
        ),
      ).toBe('confirmed');

      const client = {
        initialize: async () => {
          throw new Error('not used');
        },
        verify: async () => {
          throw new Error('not used');
        },
        refund: async () => ({
          id: 'refund_test_success',
          status: 'processed',
          amount: 20000,
          currency: 'NGN',
        }),
      };
      const result = await confirmCancellation(token, { now, client });
      expect(result).toMatchObject({
        bookingStatus: 'cancelled',
        refundStatus: 'successful',
      });

      const cancelled = await models.Booking.findByPk(bookingId, {
        transaction,
      });
      expect(cancelled?.get('status')).toBe('cancelled');
      expect(cancelled?.get('paymentStatus')).toBe('refunded');
      expect(
        (
          await models.PaymentTransaction.findByPk(
            payment.get('id') as string,
            {
              transaction,
            },
          )
        )?.get('status'),
      ).toBe('refunded');
      const refund = await models.BookingRefund.findOne({
        where: { bookingId },
        transaction,
      });
      expect(refund?.get('status')).toBe('successful');
      expect(refund?.get('providerRefundId')).toBe('refund_test_success');
      expect(refund?.get('policy')).toBe('full_transaction_amount');
      expect(
        await models.InventoryClaim.count({
          where: { bookingId },
          transaction,
        }),
      ).toBe(0);

      await expect(
        confirmCancellation(token, { now, client }),
      ).rejects.toMatchObject({ code: 'CANCELLATION_ALREADY_PROCESSED' });
      const after = await getCancellationRequest(token, now);
      expect(after.alreadyCancelled).toBe(true);
      expect(after.bookingStatus).toBe('cancelled');
    } finally {
      await models.EmailNotification.destroy({
        where: { bookingId },
        force: true,
        transaction,
      });
      await models.BookingRefund.destroy({
        where: { bookingId },
        force: true,
        transaction,
      });
      await models.BookingCancellation.destroy({
        where: { bookingId },
        force: true,
        transaction,
      });
      await models.BookingCancellationToken.destroy({
        where: { bookingId },
        transaction,
      });
      await models.BookingStatusEvent.destroy({
        where: { bookingId },
        force: true,
        transaction,
      });
      await models.PaymentStateEvent.destroy({
        where: { paymentTransactionId: payment.get('id') as string },
        force: true,
        transaction,
      });
      await models.PaymentTransaction.destroy({
        where: { bookingId },
        force: true,
        transaction,
      });
      await models.Booking.destroy({
        where: { id: bookingId },
        force: true,
        transaction,
      });
      await models.Guest.destroy({
        where: { id: guest.get('id') as string },
        force: true,
        transaction,
      });
      await models.Apartment.destroy({
        where: { id: apartment.get('id') as string },
        force: true,
        transaction,
      });
      await transaction.commit();
      transaction = await db.transaction();
    }
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
