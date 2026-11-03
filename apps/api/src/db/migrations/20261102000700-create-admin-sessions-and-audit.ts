import { DataTypes, type QueryInterface } from 'sequelize';

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.createTable('admin_sessions', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    admin_account_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'admin_accounts', key: 'id' },
      onDelete: 'CASCADE',
    },
    token_hash: { type: DataTypes.STRING(64), allowNull: false },
    csrf_token_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  await queryInterface.addIndex('admin_sessions', ['token_hash'], {
    unique: true,
    name: 'admin_sessions_token_hash_uq',
  });
  await queryInterface.addIndex(
    'admin_sessions',
    ['admin_account_id', 'expires_at'],
    {
      name: 'admin_sessions_account_expiry_idx',
    },
  );
  await queryInterface.addIndex('admin_sessions', ['expires_at'], {
    where: { revoked_at: null },
    name: 'admin_sessions_active_expiry_idx',
  });

  await queryInterface.createTable('admin_audit_events', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    admin_account_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'admin_accounts', key: 'id' },
      onDelete: 'SET NULL',
    },
    action: { type: DataTypes.STRING(80), allowNull: false },
    target_type: { type: DataTypes.STRING(40), allowNull: false },
    target_id: { type: DataTypes.STRING(120), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
  await queryInterface.addIndex('admin_audit_events', ['created_at'], {
    name: 'admin_audit_events_created_idx',
  });
  await queryInterface.addIndex(
    'admin_audit_events',
    ['target_type', 'target_id', 'created_at'],
    {
      name: 'admin_audit_events_target_created_idx',
    },
  );
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.dropTable('admin_audit_events');
  await queryInterface.dropTable('admin_sessions');
}
