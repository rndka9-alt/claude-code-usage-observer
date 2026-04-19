import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import * as schema from './schema/schema.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);

export function createDatabaseUrl(options: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): string {
  const encodedUser = encodeURIComponent(options.user);
  const encodedPassword = encodeURIComponent(options.password);

  return `postgres://${encodedUser}:${encodedPassword}@${options.host}:${options.port}/${options.database}`;
}

export function createDatabase(connectionString: string): {
  database: ReturnType<typeof drizzle<typeof schema>>;
  pool: Pool;
} {
  const pool = new Pool({
    connectionString
  });

  const database = drizzle(pool, {
    schema
  });

  return {
    database,
    pool
  };
}

export type UsageDatabaseConnection = ReturnType<typeof createDatabase>;
export type UsageDatabase = UsageDatabaseConnection['database'];

export function getDrizzleMigrationFolder(): string {
  return path.resolve(currentDirectoryPath, '../../drizzle');
}

export async function runMigrations(connectionString: string): Promise<void> {
  const { database, pool } = createDatabase(connectionString);

  try {
    await migrate(database, {
      migrationsFolder: getDrizzleMigrationFolder()
    });
  } finally {
    await pool.end();
  }
}
