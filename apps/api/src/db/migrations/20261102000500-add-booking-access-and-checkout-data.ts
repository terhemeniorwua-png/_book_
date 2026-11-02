import { DataTypes, type QueryInterface } from 'sequelize';

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.addColumn('bookings', 'idempotency_key_hash', {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  await queryInterface.addColumn('bookings', 'access_token_hash', {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  await queryInterface.addColumn('bookings', 'request_fingerprint', {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  await queryInterface.addColumn('bookings', 'special_requests', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await queryInterface.addColumn('bookings', 'terms_accepted_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await queryInterface.addColumn('bookings', 'terms_version', {
    type: DataTypes.STRING(40),
    allowNull: true,
  });
  await queryInterface.addColumn('bookings', 'accepted_policy_snapshot', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
  });
  await queryInterface.addIndex('bookings', ['idempotency_key_hash'], {
    unique: true,
    name: 'bookings_idempotency_key_hash_uq',
  });
  await queryInterface.addIndex('bookings', ['access_token_hash'], {
    unique: true,
    name: 'bookings_access_token_hash_uq',
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.removeIndex('bookings', 'bookings_access_token_hash_uq');
  await queryInterface.removeIndex(
    'bookings',
    'bookings_idempotency_key_hash_uq',
  );
  await queryInterface.removeColumn('bookings', 'accepted_policy_snapshot');
  await queryInterface.removeColumn('bookings', 'terms_version');
  await queryInterface.removeColumn('bookings', 'terms_accepted_at');
  await queryInterface.removeColumn('bookings', 'special_requests');
  await queryInterface.removeColumn('bookings', 'request_fingerprint');
  await queryInterface.removeColumn('bookings', 'access_token_hash');
  await queryInterface.removeColumn('bookings', 'idempotency_key_hash');
}
