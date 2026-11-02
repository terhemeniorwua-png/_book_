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

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.createTable('bookings', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    booking_reference: {
      type: DataTypes.STRING(24),
      allowNull: false,
      unique: true,
    },
    apartment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'apartments', key: 'id' },
      onDelete: 'RESTRICT',
    },
    guest_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'guests', key: 'id' },
      onDelete: 'RESTRICT',
    },
    check_in: { type: DataTypes.DATEONLY, allowNull: false },
    check_out: { type: DataTypes.DATEONLY, allowNull: false },
    guest_count: { type: DataTypes.SMALLINT, allowNull: false },
    nights: { type: DataTypes.SMALLINT, allowNull: false },
    price_breakdown: { type: DataTypes.JSONB, allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    payment_status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'unpaid',
    },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    ...timestamps,
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['check_out', 'check_in'],
    type: 'check',
    name: 'bookings_dates_ck',
    where: queryInterface.sequelize.where(
      queryInterface.sequelize.col('check_out'),
      { [Op.gt]: queryInterface.sequelize.col('check_in') },
    ),
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['guest_count'],
    type: 'check',
    name: 'bookings_guest_count_ck',
    where: { guest_count: { [Op.gt]: 0 } },
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['nights'],
    type: 'check',
    name: 'bookings_nights_ck',
    where: { nights: { [Op.gt]: 0 } },
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['total_amount'],
    type: 'check',
    name: 'bookings_total_amount_ck',
    where: { total_amount: { [Op.gte]: 0 } },
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['status'],
    type: 'check',
    name: 'bookings_status_ck',
    where: {
      status: [
        'pending',
        'confirmed',
        'checked_in',
        'completed',
        'cancelled',
        'expired',
        'rejected',
      ],
    },
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['payment_status'],
    type: 'check',
    name: 'bookings_payment_status_ck',
    where: {
      payment_status: [
        'unpaid',
        'pending',
        'paid',
        'failed',
        'partially_refunded',
        'refunded',
      ],
    },
  });
  await queryInterface.addConstraint('bookings', {
    fields: ['status', 'expires_at'],
    type: 'check',
    name: 'bookings_pending_expiration_ck',
    where: queryInterface.sequelize.or(
      queryInterface.sequelize.where(queryInterface.sequelize.col('status'), {
        [Op.ne]: 'pending',
      }),
      queryInterface.sequelize.where(
        queryInterface.sequelize.col('expires_at'),
        { [Op.ne]: null },
      ),
    ),
  });
  await queryInterface.addIndex('bookings', ['guest_id', 'created_at'], {
    name: 'bookings_guest_created_idx',
  });
  await queryInterface.addIndex(
    'bookings',
    ['apartment_id', 'status', 'check_in', 'check_out'],
    { name: 'bookings_apartment_status_dates_idx' },
  );
  await queryInterface.addIndex('bookings', ['expires_at'], {
    where: { status: 'pending' },
    name: 'bookings_pending_expiration_idx',
  });

  await queryInterface.createTable('payment_transactions', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'RESTRICT',
    },
    provider: { type: DataTypes.STRING(32), allowNull: false },
    transaction_reference: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    provider_transaction_id: {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: true,
    },
    expected_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'initiated',
    },
    provider_metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    processed_at: { type: DataTypes.DATE, allowNull: true },
    ...timestamps,
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  });
  await queryInterface.addConstraint('payment_transactions', {
    fields: ['expected_amount'],
    type: 'check',
    name: 'payment_transactions_amount_ck',
    where: { expected_amount: { [Op.gte]: 0 } },
  });
  await queryInterface.addConstraint('payment_transactions', {
    fields: ['status'],
    type: 'check',
    name: 'payment_transactions_status_ck',
    where: {
      status: [
        'initiated',
        'pending',
        'succeeded',
        'failed',
        'cancelled',
        'refunded',
      ],
    },
  });
  await queryInterface.addIndex(
    'payment_transactions',
    ['booking_id', 'created_at'],
    { name: 'payment_transactions_booking_created_idx' },
  );
  await queryInterface.addIndex(
    'payment_transactions',
    ['provider', 'status', 'created_at'],
    { name: 'payment_transactions_provider_status_idx' },
  );

  await queryInterface.createTable('booking_status_events', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'CASCADE',
    },
    previous_status: { type: DataTypes.STRING(20), allowNull: true },
    next_status: { type: DataTypes.STRING(20), allowNull: false },
    actor_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_accounts', key: 'id' },
      onDelete: 'SET NULL',
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'system',
    },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  await queryInterface.addIndex(
    'booking_status_events',
    ['booking_id', 'created_at'],
    { name: 'booking_status_events_booking_created_idx' },
  );

  await queryInterface.createTable('apartment_inventory_claims', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    apartment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'apartments', key: 'id' },
      onDelete: 'CASCADE',
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      references: { model: 'bookings', key: 'id' },
      onDelete: 'CASCADE',
    },
    availability_block_id: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      references: { model: 'availability_blocks', key: 'id' },
      onDelete: 'CASCADE',
    },
    stay_dates: { type: DataTypes.RANGE(DataTypes.DATEONLY), allowNull: false },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  await queryInterface.addConstraint('apartment_inventory_claims', {
    fields: ['booking_id', 'availability_block_id'],
    type: 'check',
    name: 'inventory_claim_exactly_one_source_ck',
    where: queryInterface.sequelize.or(
      queryInterface.sequelize.and({
        booking_id: { [Op.ne]: null },
        availability_block_id: null,
      }),
      queryInterface.sequelize.and({
        booking_id: null,
        availability_block_id: { [Op.ne]: null },
      }),
    ),
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.dropTable('apartment_inventory_claims');
  await queryInterface.dropTable('booking_status_events');
  await queryInterface.dropTable('payment_transactions');
  await queryInterface.dropTable('bookings');
}
