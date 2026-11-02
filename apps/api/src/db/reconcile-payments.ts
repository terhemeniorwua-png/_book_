import { pathToFileURL } from 'node:url';
import { sequelize } from './client.js';
import { reconcileStalePayments } from '../services/paystack.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await reconcileStalePayments();
    for (const result of results) process.stdout.write(`${result.reference}\t${result.status}\n`);
    process.stdout.write(`Reconciled ${results.length} payment attempt(s).\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Payment reconciliation failed.'}\n`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
