import { DataTypes, type QueryInterface } from 'sequelize';

export async function up({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn('payment_transactions', 'idempotency_key_hash', {
      type: DataTypes.STRING(64), allowNull: true,
    }, { transaction });
    await queryInterface.addColumn('payment_transactions', 'authorization_url', {
      type: DataTypes.TEXT, allowNull: true,
    }, { transaction });
    await queryInterface.addColumn('payment_transactions', 'provider_event_id', {
      type: DataTypes.STRING(64), allowNull: true,
    }, { transaction });
    await queryInterface.addIndex('payment_transactions', ['idempotency_key_hash'], {
      unique: true, name: 'payment_transactions_idempotency_key_uq', transaction,
    });
    await queryInterface.addIndex('payment_transactions', ['provider_event_id'], {
      unique: true, name: 'payment_transactions_provider_event_uq', transaction,
    });
    await queryInterface.removeConstraint('payment_transactions', 'payment_transactions_status_ck', { transaction });
    await queryInterface.addConstraint('payment_transactions', {
      fields: ['status'], type: 'check', name: 'payment_transactions_status_ck',
      where: { status: ['initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'abandoned', 'refund_pending', 'refunded', 'needs_review'] },
      transaction,
    });
    await queryInterface.removeConstraint('bookings', 'bookings_payment_status_ck', { transaction });
    await queryInterface.addConstraint('bookings', {
      fields: ['payment_status'], type: 'check', name: 'bookings_payment_status_ck',
      where: { payment_status: ['unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refund_pending', 'refunded', 'manual_review'] },
      transaction,
    });
    await queryInterface.createTable('payment_webhook_events', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      event_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      event_type: { type: DataTypes.STRING(80), allowNull: false },
      transaction_reference: { type: DataTypes.STRING(120), allowNull: true },
      processing_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'received' },
      processed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    }, { transaction });
    await queryInterface.addConstraint('payment_webhook_events', {
      fields: ['processing_status'], type: 'check', name: 'payment_webhook_events_status_ck',
      where: { processing_status: ['received', 'processed', 'ignored'] }, transaction,
    });
    await queryInterface.addIndex('payment_webhook_events', ['transaction_reference', 'created_at'], {
      name: 'payment_webhook_events_reference_created_idx', transaction,
    });
    await queryInterface.createTable('payment_state_events', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      payment_transaction_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'payment_transactions', key: 'id' }, onDelete: 'CASCADE' },
      previous_status: { type: DataTypes.STRING(20), allowNull: true },
      next_status: { type: DataTypes.STRING(20), allowNull: false },
      source: { type: DataTypes.STRING(24), allowNull: false },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    }, { transaction });
    await queryInterface.addIndex('payment_state_events', ['payment_transaction_id', 'created_at'], {
      name: 'payment_state_events_transaction_created_idx', transaction,
    });
    await queryInterface.addIndex('payment_transactions', ['status', 'created_at'], {
      name: 'payment_transactions_reconciliation_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('payment_webhook_events', { transaction });
    await queryInterface.dropTable('payment_state_events', { transaction });
    await queryInterface.removeIndex('payment_transactions', 'payment_transactions_reconciliation_idx', { transaction });
    await queryInterface.removeConstraint('bookings', 'bookings_payment_status_ck', { transaction });
    await queryInterface.addConstraint('bookings', {
      fields: ['payment_status'], type: 'check', name: 'bookings_payment_status_ck',
      where: { payment_status: ['unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded'] }, transaction,
    });
    await queryInterface.removeConstraint('payment_transactions', 'payment_transactions_status_ck', { transaction });
    await queryInterface.addConstraint('payment_transactions', {
      fields: ['status'], type: 'check', name: 'payment_transactions_status_ck',
      where: { status: ['initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded'] }, transaction,
    });
    await queryInterface.removeIndex('payment_transactions', 'payment_transactions_provider_event_uq', { transaction });
    await queryInterface.removeIndex('payment_transactions', 'payment_transactions_idempotency_key_uq', { transaction });
    await queryInterface.removeColumn('payment_transactions', 'provider_event_id', { transaction });
    await queryInterface.removeColumn('payment_transactions', 'authorization_url', { transaction });
    await queryInterface.removeColumn('payment_transactions', 'idempotency_key_hash', { transaction });
  });
}
