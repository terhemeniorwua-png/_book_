import { DataTypes, type QueryInterface } from 'sequelize';

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'bookings',
      'privacy_notice_acknowledged_at',
      { type: DataTypes.DATE, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'bookings',
      'privacy_notice_version',
      { type: DataTypes.STRING(40), allowNull: true },
      { transaction },
    );
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeColumn('bookings', 'privacy_notice_version', {
      transaction,
    });
    await queryInterface.removeColumn(
      'bookings',
      'privacy_notice_acknowledged_at',
      { transaction },
    );
  });
}
