import { Sequelize } from 'sequelize';
import dns from 'node:dns';
import net from 'node:net';
import { env } from '../config/env.js';

// Some IPv4-only hosts cannot complete Node's automatic IPv4/IPv6 address
// selection. Prefer the first resolved address so unreachable IPv6 endpoints
// do not turn reachable PostgreSQL IPv4 endpoints into connection timeouts.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

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
    ? {
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: true,
            ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {}),
          },
        },
      }
    : {}),
});
