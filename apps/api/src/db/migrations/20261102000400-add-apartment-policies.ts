import { DataTypes, type QueryInterface } from 'sequelize';

export async function up({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.addColumn('apartments', 'house_rules', {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  });
  await queryInterface.addConstraint('apartments', {
    fields: ['house_rules'],
    type: 'check',
    name: 'apartments_house_rules_array_ck',
    where: queryInterface.sequelize.where(
      queryInterface.sequelize.fn(
        'jsonb_typeof',
        queryInterface.sequelize.col('house_rules'),
      ),
      'array',
    ),
  });
  await queryInterface.addColumn('apartments', 'check_in_policy', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await queryInterface.addColumn('apartments', 'check_out_policy', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await queryInterface.addColumn('apartments', 'cancellation_policy', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
}

export async function down({
  context: queryInterface,
}: {
  context: QueryInterface;
}) {
  await queryInterface.removeColumn('apartments', 'cancellation_policy');
  await queryInterface.removeColumn('apartments', 'check_out_policy');
  await queryInterface.removeColumn('apartments', 'check_in_policy');
  await queryInterface.removeConstraint(
    'apartments',
    'apartments_house_rules_array_ck',
  );
  await queryInterface.removeColumn('apartments', 'house_rules');
}
