import { AdminAccount } from './models/index.js';
import { sequelize } from './client.js';
import { hashAdminPassword } from '../services/admin-password.js';

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
  throw new Error(
    'Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD for this one-time provisioning command.',
  );
}

try {
  const passwordHash = await hashAdminPassword(password);
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtext('apartment-booking-initial-admin'))",
      { transaction },
    );
    if ((await AdminAccount.count({ transaction })) > 0) {
      throw new Error(
        'An administrator account already exists; bootstrap provisioning is disabled.',
      );
    }
    await AdminAccount.create(
      {
        email,
        passwordHash,
        displayName: email.split('@')[0]!,
        role: 'superadmin',
      },
      { transaction },
    );
  });
  process.stdout.write(
    'Initial administrator provisioned. Remove the one-time credentials from the environment.\n',
  );
} finally {
  await sequelize.close();
}
