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
    idempotencyKeyHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
      field: 'idempotency_key_hash',
    },
    accessTokenHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
      field: 'access_token_hash',
    },
    requestFingerprint: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'request_fingerprint',
    },
    specialRequests: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'special_requests',
    },
    termsAcceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'terms_accepted_at',
    },
    termsVersion: {
      type: DataTypes.STRING(40),
      allowNull: true,
      field: 'terms_version',
    },
    acceptedPolicySnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'accepted_policy_snapshot',
    },
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
    idempotencyKeyHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
      field: 'idempotency_key_hash',
    },
    authorizationUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'authorization_url',
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

export const PaymentWebhookEvent = sequelize.define(
  'PaymentWebhookEvent',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    eventHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'event_hash',
    },
    eventType: {
      type: DataTypes.STRING(80),
      allowNull: false,
      field: 'event_type',
    },
    transactionReference: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'transaction_reference',
    },
    processingStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'received',
      field: 'processing_status',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
  },
  {
    tableName: 'payment_webhook_events',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

export const PaymentStateEvent = sequelize.define(
  'PaymentStateEvent',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    paymentTransactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'payment_transaction_id',
    },
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
    source: { type: DataTypes.STRING(24), allowNull: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    tableName: 'payment_state_events',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
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

export const BookingCancellationToken = sequelize.define(
  'BookingCancellationToken',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'booking_id',
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'token_hash',
    },
    purpose: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'booking_cancellation',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    usedAt: { type: DataTypes.DATE, allowNull: true, field: 'used_at' },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'revoked_at',
    },
  },
  {
    tableName: 'booking_cancellation_tokens',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  },
);

export const BookingCancellation = sequelize.define(
  'BookingCancellation',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'booking_id',
    },
    tokenId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'token_id',
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'customer_link',
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'requested_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    deadlineAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'deadline_at',
    },
  },
  { tableName: 'booking_cancellations', underscored: true },
);

export const BookingRefund = sequelize.define(
  'BookingRefund',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'booking_id',
    },
    cancellationId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'cancellation_id',
    },
    paymentTransactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'payment_transaction_id',
    },
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'paystack',
    },
    providerReference: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: 'provider_reference',
    },
    providerRefundId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: true,
      field: 'provider_refund_id',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    policy: {
      type: DataTypes.STRING(48),
      allowNull: false,
      defaultValue: 'full_transaction_amount',
    },
    attempts: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    failureReason: {
      type: DataTypes.STRING(240),
      allowNull: true,
      field: 'failure_reason',
    },
    providerMetadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'provider_metadata',
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'requested_at',
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_attempt_at',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
  },
  { tableName: 'booking_refunds', underscored: true },
);

export const EmailNotification = sequelize.define(
  'EmailNotification',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'booking_id',
    },
    cancellationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cancellation_id',
    },
    deduplicationKey: {
      type: DataTypes.STRING(160),
      allowNull: true,
      unique: true,
      field: 'deduplication_key',
    },
    providerMessageId: {
      type: DataTypes.STRING(160),
      allowNull: true,
      field: 'provider_message_id',
    },
    type: { type: DataTypes.STRING(60), allowNull: false },
    recipient: { type: DataTypes.STRING(320), allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'queued',
    },
    attempts: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    lastError: {
      type: DataTypes.STRING(240),
      allowNull: true,
      field: 'last_error',
    },
    sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
  },
  { tableName: 'email_notifications', underscored: true },
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
