import { DataTypes } from 'sequelize';
import { randomBytes } from 'node:crypto';
import { sequelize } from '../client.js';

export const Booking = sequelize.define(
  'Booking',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingReference: {
      type: DataTypes.STRING(24),
      allowNull: false,
      unique: true,
      field: 'booking_reference',
      defaultValue: () => `AB-${randomBytes(7).toString('hex').toUpperCase()}`,
    },
    apartmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'apartment_id',
    },
    guestId: { type: DataTypes.UUID, allowNull: false, field: 'guest_id' },
    checkIn: { type: DataTypes.DATEONLY, allowNull: false, field: 'check_in' },
    checkOut: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'check_out',
    },
    guestCount: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'guest_count',
    },
    nights: { type: DataTypes.SMALLINT, allowNull: false },
    priceBreakdown: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'price_breakdown',
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'total_amount',
    },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    paymentStatus: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'unpaid',
      field: 'payment_status',
    },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
  },
  { tableName: 'bookings', underscored: true, paranoid: true },
);

export const PaymentTransaction = sequelize.define(
  'PaymentTransaction',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingId: { type: DataTypes.UUID, allowNull: false, field: 'booking_id' },
    provider: { type: DataTypes.STRING(32), allowNull: false },
    transactionReference: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
      field: 'transaction_reference',
    },
    providerTransactionId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: true,
      field: 'provider_transaction_id',
    },
    expectedAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'expected_amount',
    },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'initiated',
    },
    providerMetadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'provider_metadata',
    },
    verifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'verified_at' },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
  },
  { tableName: 'payment_transactions', underscored: true, paranoid: true },
);

export const BookingStatusEvent = sequelize.define(
  'BookingStatusEvent',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingId: { type: DataTypes.UUID, allowNull: false, field: 'booking_id' },
    previousStatus: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'previous_status',
    },
    nextStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'next_status',
    },
    actorAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'actor_admin_id',
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'system',
    },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    tableName: 'booking_status_events',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

export const InventoryClaim = sequelize.define(
  'InventoryClaim',
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
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      field: 'booking_id',
    },
    availabilityBlockId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      field: 'availability_block_id',
    },
    stayDates: {
      type: DataTypes.RANGE(DataTypes.DATEONLY),
      allowNull: false,
      field: 'stay_dates',
    },
  },
  {
    tableName: 'apartment_inventory_claims',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

export const ContactInquiry = sequelize.define(
  'ContactInquiry',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING(160), allowNull: false },
    email: { type: DataTypes.STRING(320), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'new',
    },
  },
  { tableName: 'contact_inquiries', underscored: true, paranoid: true },
);
