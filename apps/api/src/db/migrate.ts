import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { env } from '../config/env.js';

const sequelize = new Sequelize(env.DATABASE_URL, { logging: false });
const migrator = new Umzug({
  migrations: { glob: 'src/db/migrations/*.ts' },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

try {
  const command = process.argv[2];
  if (command === 'up') await migrator.up();
  else if (command === 'down') await migrator.down();
  else throw new Error('Use migration command "up" or "down".');
} finally {
  await sequelize.close();
}
