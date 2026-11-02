import { pathToFileURL } from 'node:url';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../client.js';
import { env } from '../../config/env.js';
import {
  down,
  seededApartmentIds,
  up,
} from './20261102000000-seed-apartments.js';

const seededIds = seededApartmentIds;

async function printApartmentSummary() {
  const rows = await sequelize.query<{
    name: string;
    display_location: string;
    nightly_price: string;
  }>(
    'SELECT name, display_location, nightly_price FROM apartments WHERE id IN (:ids) ORDER BY region, locality, nightly_price, name',
    { replacements: { ids: seededIds }, type: QueryTypes.SELECT },
  );
  console.log(`Seeded apartment records present: ${rows.length}`);
  console.log('Title | City | Price per night (NGN)');
  for (const apartment of rows)
    console.log(
      `${apartment.name} | ${apartment.display_location.split(', ').at(-1)} | ₦${Number(apartment.nightly_price).toLocaleString('en-NG')}`,
    );
}

export async function runApartmentSeeder(command: 'up' | 'down') {
  if (env.NODE_ENV === 'production')
    throw new Error('Apartment demo seeder is disabled in production.');
  const queryInterface = sequelize.getQueryInterface();
  const tables = await sequelize.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.apartments') AS table_name",
    { type: QueryTypes.SELECT },
  );
  if (!tables[0]?.table_name)
    throw new Error(
      'Apartments table is missing; run database migrations first.',
    );

  if (command === 'up') {
    await up({ context: queryInterface });
    await printApartmentSummary();
  } else {
    await down({ context: queryInterface });
    const [remaining] = await sequelize.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM apartments WHERE id IN (:ids)',
      { replacements: { ids: seededIds }, type: QueryTypes.SELECT },
    );
    console.log(
      `Seeder-owned apartments remaining after undo: ${remaining?.count ?? '0'}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2];
  if (command !== 'up' && command !== 'down') {
    console.error('Use seed command "up" or "down".');
    process.exitCode = 1;
  } else {
    try {
      await runApartmentSeeder(command);
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : 'Apartment seeder failed.',
      );
      process.exitCode = 1;
    } finally {
      await sequelize.close();
    }
  }
}
