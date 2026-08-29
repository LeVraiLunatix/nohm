import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema.js';
import { createDatabase, type Database } from './client.js';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
const lockKey = 5_184_227_091;

/**
 * Serializes auto-migration across independently-running dashboard installations.
 *
 * Importing this module pulls in drizzle-orm (~160 MB resident), so anything that only needs to
 * *query* should import `./client.js` alone. The always-on Railway service runs migrations as a
 * separate short-lived process and never imports this — see `railway.json`.
 */
export async function migrateDatabase(database: Database): Promise<void> {
  if (database.mode !== 'postgres' || !database.databaseUrl) return;
  // A one-connection client keeps the session-scoped advisory lock and migration statements on
  // the same PostgreSQL session. The normal application pool remains untouched.
  const migrationDatabase = createDatabase(database.databaseUrl, 1);
  try {
    await migrationDatabase.client`select pg_advisory_lock(${lockKey})`;
    await migrate(drizzle(migrationDatabase.client, { schema }), { migrationsFolder });
  } finally {
    try {
      await migrationDatabase.client`select pg_advisory_unlock(${lockKey})`;
    } finally {
      await migrationDatabase.client.end({ timeout: 5 });
    }
  }
}
