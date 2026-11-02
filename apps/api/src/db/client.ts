import { Sequelize } from 'sequelize';
import { env } from '../config/env.js';

export function databaseUrl(): string {
  if (env.NODE_ENV === 'test') {
    if (!env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL is required for database tests and test migrations',
      );
    }
    return env.TEST_DATABASE_URL;
  }
  return env.DATABASE_URL!;
}

export const sequelize = new Sequelize(databaseUrl(), {
  dialect: 'postgres',
  logging: env.LOG_LEVEL === 'debug' ? console.debug : false,
  pool: { max: env.DB_POOL_MAX, min: 0, acquire: 30_000, idle: 10_000 },
  ...(env.DB_SSL
    ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: true } } }
    : {}),
});
