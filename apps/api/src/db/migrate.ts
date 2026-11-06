import { pathToFileURL } from 'node:url';
import type { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize as defaultSequelize } from './client.js';
import { env } from '../config/env.js';
import * as catalogAndAccounts from './migrations/20261102000100-create-catalog-and-accounts.js';
import * as bookingsPaymentsInventory from './migrations/20261102000200-create-bookings-payments-and-inventory.js';
import * as inventoryExclusionAndAudit from './migrations/20261102000300-add-inventory-exclusion-and-booking-audit.js';
import * as apartmentPolicies from './migrations/20261102000400-add-apartment-policies.js';
import * as bookingAccessAndCheckoutData from './migrations/20261102000500-add-booking-access-and-checkout-data.js';
import * as paystackIntegrity from './migrations/20261102000600-add-paystack-integrity.js';
import * as adminSessionsAndAudit from './migrations/20261102000700-create-admin-sessions-and-audit.js';
import * as cancellationsRefundsAndNotifications from './migrations/20261102000800-add-cancellations-refunds-and-notifications.js';
import * as emailIdempotencyAndCheckoutTime from './migrations/20261102000900-email-idempotency-and-checkout-time.js';
import * as privacyNoticeAcceptance from './migrations/20261106001000-add-privacy-notice-acceptance.js';

export function createMigrator(sequelize: Sequelize = defaultSequelize) {
  return new Umzug({
    migrations: [
      {
        name: '20261102000100-create-catalog-and-accounts',
        up: catalogAndAccounts.up,
        down: catalogAndAccounts.down,
      },
      {
        name: '20261102000200-create-bookings-payments-and-inventory',
        up: bookingsPaymentsInventory.up,
        down: bookingsPaymentsInventory.down,
      },
      {
        name: '20261102000300-add-inventory-exclusion-and-booking-audit',
        up: inventoryExclusionAndAudit.up,
        down: inventoryExclusionAndAudit.down,
      },
      {
        name: '20261102000400-add-apartment-policies',
        up: apartmentPolicies.up,
        down: apartmentPolicies.down,
      },
      {
        name: '20261102000500-add-booking-access-and-checkout-data',
        up: bookingAccessAndCheckoutData.up,
        down: bookingAccessAndCheckoutData.down,
      },
      {
        name: '20261102000600-add-paystack-integrity',
        up: paystackIntegrity.up,
        down: paystackIntegrity.down,
      },
      {
        name: '20261102000700-create-admin-sessions-and-audit',
        up: adminSessionsAndAudit.up,
        down: adminSessionsAndAudit.down,
      },
      {
        name: '20261102000800-add-cancellations-refunds-and-notifications',
        up: cancellationsRefundsAndNotifications.up,
        down: cancellationsRefundsAndNotifications.down,
      },
      {
        name: '20261102000900-email-idempotency-and-checkout-time',
        up: emailIdempotencyAndCheckoutTime.up,
        down: emailIdempotencyAndCheckoutTime.down,
      },
      {
        name: '20261106001000-add-privacy-notice-acceptance',
        up: privacyNoticeAcceptance.up,
        down: privacyNoticeAcceptance.down,
      },
    ],
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: env.LOG_LEVEL === 'debug' ? console : undefined,
  });
}

export async function runMigrations(
  command: 'up' | 'down',
  sequelize: Sequelize = defaultSequelize,
) {
  if (command === 'down' && env.NODE_ENV === 'production') {
    throw new Error(
      'Down migrations are disabled in production to protect stored data.',
    );
  }
  const migrator = createMigrator(sequelize);
  return command === 'up' ? migrator.up() : migrator.down();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const command = process.argv[2];
    if (command !== 'up' && command !== 'down') {
      throw new Error('Use migration command "up" or "down".');
    }
    await runMigrations(command);
  } finally {
    await defaultSequelize.close();
  }
}
