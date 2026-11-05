import { DataTypes, Op, type QueryInterface } from 'sequelize';

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'apartments',
      'check_out_time',
      { type: DataTypes.TIME, allowNull: true },
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE apartments ADD CONSTRAINT apartments_check_out_time_ck
       CHECK (check_out_time IS NULL OR check_out_time >= TIME '00:00' AND check_out_time < TIME '24:00')`,
      { transaction },
    );
    await queryInterface.addColumn(
      'email_notifications',
      'deduplication_key',
      { type: DataTypes.STRING(160), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'email_notifications',
      'provider_message_id',
      { type: DataTypes.STRING(160), allowNull: true },
      { transaction },
    );
    await queryInterface.addIndex(
      'email_notifications',
      ['deduplication_key'],
      {
        unique: true,
        where: { deduplication_key: { [Op.ne]: null } },
        name: 'email_notifications_deduplication_key_uq',
        transaction,
      },
    );
    await queryInterface.removeConstraint(
      'email_notifications',
      'email_notifications_status_ck',
      { transaction },
    );
    await queryInterface.addConstraint('email_notifications', {
      fields: ['status'],
      type: 'check',
      name: 'email_notifications_status_ck',
      where: { status: ['queued', 'sending', 'sent', 'failed'] },
      transaction,
    });
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeConstraint(
      'email_notifications',
      'email_notifications_status_ck',
      { transaction },
    );
    await queryInterface.addConstraint('email_notifications', {
      fields: ['status'],
      type: 'check',
      name: 'email_notifications_status_ck',
      where: { status: ['queued', 'sent', 'failed'] },
      transaction,
    });
    await queryInterface.removeIndex(
      'email_notifications',
      'email_notifications_deduplication_key_uq',
      { transaction },
    );
    await queryInterface.removeColumn(
      'email_notifications',
      'provider_message_id',
      {
        transaction,
      },
    );
    await queryInterface.removeColumn(
      'email_notifications',
      'deduplication_key',
      {
        transaction,
      },
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE apartments DROP CONSTRAINT IF EXISTS apartments_check_out_time_ck',
      { transaction },
    );
    await queryInterface.removeColumn('apartments', 'check_out_time', {
      transaction,
    });
  });
}
