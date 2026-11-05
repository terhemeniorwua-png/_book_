import { DataTypes } from 'sequelize';
import { sequelize } from '../client.js';

export const AdminAccount = sequelize.define(
  'AdminAccount',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: { type: DataTypes.STRING(320), allowNull: false },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    displayName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'display_name',
    },
    role: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'manager',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at',
    },
  },
  { tableName: 'admin_accounts', underscored: true, paranoid: true },
);

export const AdminSession = sequelize.define(
  'AdminSession',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    adminAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'admin_account_id',
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'token_hash',
    },
    csrfTokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'csrf_token_hash',
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'last_seen_at',
    },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  { tableName: 'admin_sessions', underscored: true, timestamps: false },
);

export const AdminAuditEvent = sequelize.define(
  'AdminAuditEvent',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    adminAccountId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_account_id',
    },
    action: { type: DataTypes.STRING(80), allowNull: false },
    targetType: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: 'target_type',
    },
    targetId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'target_id',
    },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    tableName: 'admin_audit_events',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

export const Apartment = sequelize.define(
  'Apartment',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    slug: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(180), allowNull: false },
    shortDescription: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'short_description',
    },
    fullDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'full_description',
    },
    nightlyPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'nightly_price',
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'NGN',
    },
    bedrooms: { type: DataTypes.SMALLINT, allowNull: false },
    bathrooms: { type: DataTypes.DECIMAL(3, 1), allowNull: false },
    maxGuests: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'max_guests',
    },
    displayLocation: {
      type: DataTypes.STRING(180),
      allowNull: false,
      field: 'display_location',
    },
    addressLine1: {
      type: DataTypes.STRING(220),
      allowNull: true,
      field: 'address_line1',
    },
    locality: { type: DataTypes.STRING(120), allowNull: true },
    region: { type: DataTypes.STRING(120), allowNull: true },
    countryCode: {
      type: DataTypes.STRING(2),
      allowNull: false,
      field: 'country_code',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
    },
    minStayNights: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
      field: 'min_stay_nights',
    },
    maxStayNights: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      field: 'max_stay_nights',
    },
    houseRules: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'house_rules',
    },
    checkInPolicy: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'check_in_policy',
    },
    checkOutPolicy: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'check_out_policy',
    },
    cancellationPolicy: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'cancellation_policy',
    },
    timezone: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    checkInTime: {
      type: DataTypes.TIME,
      allowNull: true,
      defaultValue: '14:00:00',
      field: 'check_in_time',
    },
    checkOutTime: {
      type: DataTypes.TIME,
      allowNull: true,
      field: 'check_out_time',
    },
  },
  {
    tableName: 'apartments',
    underscored: true,
    paranoid: true,
    scopes: { public: { where: { status: 'published' } } },
  },
);

export const Amenity = sequelize.define(
  'Amenity',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    iconKey: { type: DataTypes.STRING(80), allowNull: true, field: 'icon_key' },
  },
  {
    tableName: 'amenities',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

export const ApartmentAmenity = sequelize.define(
  'ApartmentAmenity',
  {
    apartmentId: {
      type: DataTypes.UUID,
      primaryKey: true,
      field: 'apartment_id',
    },
    amenityId: { type: DataTypes.UUID, primaryKey: true, field: 'amenity_id' },
  },
  { tableName: 'apartment_amenities', underscored: true, timestamps: false },
);

export const ApartmentImage = sequelize.define(
  'ApartmentImage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    apartmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'apartment_id',
    },
    objectKey: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      field: 'object_key',
    },
    altText: {
      type: DataTypes.STRING(300),
      allowNull: false,
      field: 'alt_text',
    },
    position: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    isCover: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_cover',
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_published',
    },
  },
  { tableName: 'apartment_images', underscored: true, paranoid: true },
);

export const ApartmentCharge = sequelize.define(
  'ApartmentCharge',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    apartmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'apartment_id',
    },
    name: { type: DataTypes.STRING(120), allowNull: false },
    chargeType: {
      type: DataTypes.STRING(24),
      allowNull: false,
      field: 'charge_type',
    },
    calculationBasis: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'calculation_basis',
    },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    isRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_required',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    validFrom: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'valid_from',
    },
    validUntil: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'valid_until',
    },
  },
  { tableName: 'apartment_charges', underscored: true, paranoid: true },
);

export const AvailabilityBlock = sequelize.define(
  'AvailabilityBlock',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    apartmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'apartment_id',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'start_date',
    },
    endDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'end_date' },
    reason: { type: DataTypes.STRING(240), allowNull: false },
    createdByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_admin_id',
    },
  },
  { tableName: 'availability_blocks', underscored: true, paranoid: true },
);

export const Guest = sequelize.define(
  'Guest',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name',
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'last_name',
    },
    email: { type: DataTypes.STRING(320), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: true },
  },
  { tableName: 'guests', underscored: true, paranoid: true },
);
