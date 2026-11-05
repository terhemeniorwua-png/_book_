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
  await queryInterface.sequelize.transaction(async (transaction) => {
    // The scheduled check-in time is needed to enforce the 24-hour notice
    // rule. Existing apartments fall back to 14:00 in the configured booking
    // timezone until an administrator sets a property-specific value.
    await queryInterface.addColumn(
      'apartments',
      'timezone',
      { type: DataTypes.STRING(80), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'apartments',
      'check_in_time',
      {
        type: DataTypes.TIME,
        allowNull: true,
        defaultValue: '14:00:00',
      },
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE apartments
         ADD CONSTRAINT apartments_check_in_time_ck
         CHECK (check_in_time IS NULL OR check_in_time >= TIME '00:00' AND check_in_time < TIME '24:00')`,
      { transaction },
    );

    await queryInterface.removeConstraint('bookings', 'bookings_status_ck', {
      transaction,
    });
    await queryInterface.addConstraint('bookings', {
      fields: ['status'],
      type: 'check',
      name: 'bookings_status_ck',
      where: {
        status: [
          'pending',
          'confirmed',
          'cancellation_requested',
          'checked_in',
          'completed',
          'cancelled',
          'expired',
          'rejected',
        ],
      },
      transaction,
    });
    await queryInterface.addIndex('bookings', ['status', 'updated_at'], {
      name: 'bookings_status_updated_idx',
      transaction,
    });

    await queryInterface.createTable(
      'booking_cancellation_tokens',
      {
        id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
        booking_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: 'bookings', key: 'id' },
          onDelete: 'CASCADE',
        },
        token_hash: {
          type: DataTypes.STRING(64),
          allowNull: false,
          unique: true,
        },
        purpose: {
          type: DataTypes.STRING(40),
          allowNull: false,
          defaultValue: 'booking_cancellation',
        },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        used_at: { type: DataTypes.DATE, allowNull: true },
        revoked_at: { type: DataTypes.DATE, allowNull: true },
        created_at: timestamps.created_at,
      },
      { transaction },
    );
    await queryInterface.addConstraint('booking_cancellation_tokens', {
      fields: ['purpose'],
      type: 'check',
      name: 'booking_cancellation_tokens_purpose_ck',
      where: { purpose: ['booking_cancellation'] },
      transaction,
    });
    await queryInterface.addIndex(
      'booking_cancellation_tokens',
      ['booking_id', 'purpose', 'expires_at'],
      {
        name: 'booking_cancellation_tokens_booking_purpose_idx',
        transaction,
      },
    );
    await queryInterface.addIndex(
      'booking_cancellation_tokens',
      ['booking_id', 'purpose'],
      {
        unique: true,
        where: { used_at: null, revoked_at: null },
        name: 'booking_cancellation_tokens_one_active_uq',
        transaction,
      },
    );

    await queryInterface.createTable(
      'booking_cancellations',
      {
        id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
        booking_id: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          references: { model: 'bookings', key: 'id' },
          onDelete: 'RESTRICT',
        },
        token_id: {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: 'booking_cancellation_tokens', key: 'id' },
          onDelete: 'SET NULL',
        },
        source: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: 'customer_link',
        },
        requested_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        completed_at: { type: DataTypes.DATE, allowNull: true },
        deadline_at: { type: DataTypes.DATE, allowNull: false },
        ...timestamps,
      },
      { transaction },
    );
    await queryInterface.addConstraint('booking_cancellations', {
      fields: ['source'],
      type: 'check',
      name: 'booking_cancellations_source_ck',
      where: { source: ['customer_link', 'admin', 'system'] },
      transaction,
    });
    await queryInterface.addIndex('booking_cancellations', ['requested_at'], {
      name: 'booking_cancellations_requested_idx',
      transaction,
    });

    await queryInterface.createTable(
      'booking_refunds',
      {
        id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
        booking_id: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          references: { model: 'bookings', key: 'id' },
          onDelete: 'RESTRICT',
        },
        cancellation_id: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          references: { model: 'booking_cancellations', key: 'id' },
          onDelete: 'RESTRICT',
        },
        payment_transaction_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: 'payment_transactions', key: 'id' },
          onDelete: 'RESTRICT',
        },
        provider: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: 'paystack',
        },
        provider_reference: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        provider_refund_id: {
          type: DataTypes.STRING(120),
          allowNull: true,
          unique: true,
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
        failure_reason: { type: DataTypes.STRING(240), allowNull: true },
        provider_metadata: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        requested_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        last_attempt_at: { type: DataTypes.DATE, allowNull: true },
        processed_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps,
      },
      { transaction },
    );
    await queryInterface.addConstraint('booking_refunds', {
      fields: ['status'],
      type: 'check',
      name: 'booking_refunds_status_ck',
      where: {
        status: [
          'not_applicable',
          'pending',
          'processing',
          'successful',
          'failed',
        ],
      },
      transaction,
    });
    await queryInterface.addConstraint('booking_refunds', {
      fields: ['provider'],
      type: 'check',
      name: 'booking_refunds_provider_ck',
      where: { provider: ['paystack'] },
      transaction,
    });
    await queryInterface.addConstraint('booking_refunds', {
      fields: ['amount'],
      type: 'check',
      name: 'booking_refunds_amount_ck',
      where: { amount: { [Op.gte]: 0 } },
      transaction,
    });
    await queryInterface.addIndex('booking_refunds', ['status', 'created_at'], {
      name: 'booking_refunds_status_created_idx',
      transaction,
    });
    await queryInterface.addIndex('booking_refunds', ['provider_reference'], {
      name: 'booking_refunds_provider_reference_idx',
      transaction,
    });

    await queryInterface.createTable(
      'email_notifications',
      {
        id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
        booking_id: {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: 'bookings', key: 'id' },
          onDelete: 'SET NULL',
        },
        cancellation_id: {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: 'booking_cancellations', key: 'id' },
          onDelete: 'SET NULL',
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
        last_error: { type: DataTypes.STRING(240), allowNull: true },
        sent_at: { type: DataTypes.DATE, allowNull: true },
        ...timestamps,
      },
      { transaction },
    );
    await queryInterface.addConstraint('email_notifications', {
      fields: ['status'],
      type: 'check',
      name: 'email_notifications_status_ck',
      where: { status: ['queued', 'sent', 'failed'] },
      transaction,
    });
    await queryInterface.addIndex(
      'email_notifications',
      ['booking_id', 'type', 'created_at'],
      {
        name: 'email_notifications_booking_type_idx',
        transaction,
      },
    );
    await queryInterface.addIndex(
      'email_notifications',
      ['status', 'created_at'],
      {
        name: 'email_notifications_status_created_idx',
        transaction,
      },
    );
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('email_notifications', { transaction });
    await queryInterface.dropTable('booking_refunds', { transaction });
    await queryInterface.dropTable('booking_cancellations', { transaction });
    await queryInterface.dropTable('booking_cancellation_tokens', {
      transaction,
    });
    await queryInterface.removeIndex(
      'bookings',
      'bookings_status_updated_idx',
      {
        transaction,
      },
    );
    await queryInterface.removeConstraint('bookings', 'bookings_status_ck', {
      transaction,
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
      transaction,
    });
    await queryInterface.sequelize.query(
      'ALTER TABLE apartments DROP CONSTRAINT IF EXISTS apartments_check_in_time_ck',
      { transaction },
    );
    await queryInterface.removeColumn('apartments', 'check_in_time', {
      transaction,
    });
    await queryInterface.removeColumn('apartments', 'timezone', {
      transaction,
    });
  });
}
