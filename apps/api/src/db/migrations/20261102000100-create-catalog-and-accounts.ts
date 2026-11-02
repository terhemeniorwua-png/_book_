import { DataTypes, Op, type QueryInterface } from 'sequelize';

const timestamps = {
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
};
const softDelete = { deleted_at: { type: DataTypes.DATE, allowNull: true } };

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.createTable('admin_accounts', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    email: { type: DataTypes.STRING(320), allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    display_name: { type: DataTypes.STRING(120), allowNull: false },
    role: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'manager',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.sequelize.query(
    'CREATE UNIQUE INDEX admin_accounts_email_lower_uq ON admin_accounts (lower(email))',
  );
  await queryInterface.addConstraint('admin_accounts', {
    fields: ['role'],
    type: 'check',
    name: 'admin_accounts_role_ck',
    where: { role: ['superadmin', 'manager'] },
  });

  await queryInterface.createTable('apartments', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(180), allowNull: false },
    short_description: { type: DataTypes.STRING(500), allowNull: false },
    full_description: { type: DataTypes.TEXT, allowNull: false },
    nightly_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'NGN',
    },
    bedrooms: { type: DataTypes.SMALLINT, allowNull: false },
    bathrooms: { type: DataTypes.DECIMAL(3, 1), allowNull: false },
    max_guests: { type: DataTypes.SMALLINT, allowNull: false },
    display_location: { type: DataTypes.STRING(180), allowNull: false },
    address_line1: { type: DataTypes.STRING(220), allowNull: true },
    locality: { type: DataTypes.STRING(120), allowNull: true },
    region: { type: DataTypes.STRING(120), allowNull: true },
    country_code: { type: DataTypes.STRING(2), allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    min_stay_nights: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
    },
    max_stay_nights: { type: DataTypes.SMALLINT, allowNull: true },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['nightly_price'],
    type: 'check',
    name: 'apartments_nightly_price_ck',
    where: { nightly_price: { [Op.gte]: 0 } },
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['bedrooms'],
    type: 'check',
    name: 'apartments_bedrooms_ck',
    where: { bedrooms: { [Op.gte]: 0 } },
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['bathrooms'],
    type: 'check',
    name: 'apartments_bathrooms_ck',
    where: { bathrooms: { [Op.gt]: 0 } },
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['max_guests'],
    type: 'check',
    name: 'apartments_max_guests_ck',
    where: { max_guests: { [Op.gt]: 0 } },
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['currency'],
    type: 'check',
    name: 'apartments_currency_ck',
    where: queryInterface.sequelize.where(
      queryInterface.sequelize.col('currency'),
      ' ~ ',
      '^[A-Z]{3}$',
    ),
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['status'],
    type: 'check',
    name: 'apartments_status_ck',
    where: { status: ['draft', 'published', 'archived'] },
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['min_stay_nights'],
    type: 'check',
    name: 'apartments_min_stay_ck',
    where: { min_stay_nights: { [Op.gt]: 0 } },
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['max_stay_nights', 'min_stay_nights'],
    type: 'check',
    name: 'apartments_stay_range_ck',
    where: queryInterface.sequelize.or(
      { max_stay_nights: null },
      queryInterface.sequelize.where(
        queryInterface.sequelize.col('max_stay_nights'),
        { [Op.gte]: queryInterface.sequelize.col('min_stay_nights') },
      ),
    ),
  });
  await queryInterface.addIndex('apartments', ['status', 'deleted_at'], {
    name: 'apartments_public_status_idx',
  });

  await queryInterface.createTable('amenities', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    icon_key: { type: DataTypes.STRING(80), allowNull: true },
    created_at: timestamps.created_at,
  });
  await queryInterface.createTable('apartment_amenities', {
    apartment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'apartments', key: 'id' },
      onDelete: 'CASCADE',
    },
    amenity_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'amenities', key: 'id' },
      onDelete: 'CASCADE',
    },
  });
  await queryInterface.addConstraint('apartment_amenities', {
    fields: ['apartment_id', 'amenity_id'],
    type: 'primary key',
    name: 'apartment_amenities_pk',
  });

  await queryInterface.createTable('apartment_images', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    apartment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'apartments', key: 'id' },
      onDelete: 'CASCADE',
    },
    object_key: { type: DataTypes.STRING(500), allowNull: false, unique: true },
    alt_text: { type: DataTypes.STRING(300), allowNull: false },
    position: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    is_cover: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_published: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.addIndex(
    'apartment_images',
    ['apartment_id', 'position'],
    { name: 'apartment_images_apartment_position_idx' },
  );
  await queryInterface.addIndex('apartment_images', ['apartment_id'], {
    unique: true,
    where: { is_cover: true, deleted_at: null },
    name: 'apartment_images_single_cover_uq',
  });

  await queryInterface.createTable('apartment_charges', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    apartment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'apartments', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING(120), allowNull: false },
    charge_type: { type: DataTypes.STRING(24), allowNull: false },
    calculation_basis: { type: DataTypes.STRING(32), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    is_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    valid_from: { type: DataTypes.DATEONLY, allowNull: true },
    valid_until: { type: DataTypes.DATEONLY, allowNull: true },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.addConstraint('apartment_charges', {
    fields: ['charge_type'],
    type: 'check',
    name: 'apartment_charges_type_ck',
    where: { charge_type: ['fee', 'tax', 'supplement'] },
  });
  await queryInterface.addConstraint('apartment_charges', {
    fields: ['calculation_basis'],
    type: 'check',
    name: 'apartment_charges_basis_ck',
    where: {
      calculation_basis: [
        'flat',
        'per_night',
        'per_guest',
        'per_guest_per_night',
        'percentage',
      ],
    },
  });
  await queryInterface.addConstraint('apartment_charges', {
    fields: ['amount'],
    type: 'check',
    name: 'apartment_charges_amount_ck',
    where: { amount: { [Op.gte]: 0 } },
  });
  await queryInterface.addConstraint('apartment_charges', {
    fields: ['valid_until', 'valid_from'],
    type: 'check',
    name: 'apartment_charges_dates_ck',
    where: queryInterface.sequelize.or(
      { valid_until: null },
      queryInterface.sequelize.where(
        queryInterface.sequelize.col('valid_until'),
        { [Op.gt]: queryInterface.sequelize.col('valid_from') },
      ),
    ),
  });

  await queryInterface.createTable('availability_blocks', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    apartment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'apartments', key: 'id' },
      onDelete: 'CASCADE',
    },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(240), allowNull: false },
    created_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_accounts', key: 'id' },
      onDelete: 'SET NULL',
    },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.addConstraint('availability_blocks', {
    fields: ['end_date', 'start_date'],
    type: 'check',
    name: 'availability_blocks_dates_ck',
    where: queryInterface.sequelize.where(
      queryInterface.sequelize.col('end_date'),
      { [Op.gt]: queryInterface.sequelize.col('start_date') },
    ),
  });
  await queryInterface.addIndex(
    'availability_blocks',
    ['apartment_id', 'start_date', 'end_date'],
    { name: 'availability_blocks_apartment_dates_idx' },
  );

  await queryInterface.createTable('guests', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    first_name: { type: DataTypes.STRING(100), allowNull: false },
    last_name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(320), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.sequelize.query(
    'CREATE INDEX guests_email_lower_idx ON guests (lower(email))',
  );

  await queryInterface.createTable('contact_inquiries', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(160), allowNull: false },
    email: { type: DataTypes.STRING(320), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'new',
    },
    ...timestamps,
    ...softDelete,
  });
  await queryInterface.addConstraint('contact_inquiries', {
    fields: ['status'],
    type: 'check',
    name: 'contact_inquiries_status_ck',
    where: { status: ['new', 'in_progress', 'closed'] },
  });
  await queryInterface.addIndex('contact_inquiries', ['status', 'created_at'], {
    name: 'contact_inquiries_status_created_idx',
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  for (const table of [
    'contact_inquiries',
    'guests',
    'availability_blocks',
    'apartment_charges',
    'apartment_images',
    'apartment_amenities',
    'amenities',
    'apartments',
    'admin_accounts',
  ]) {
    await queryInterface.dropTable(table);
  }
}
