import { createDatabase, runMigrations } from '@usage-observer/domain';

import { readConfig } from './config/index.js';
import { createServer } from './server/index.js';

async function main(): Promise<void> {
  const config = readConfig(process.env);

  if (config.runMigrations) {
    await runMigrations(config.databaseUrl);
  }

  const databaseConnection = createDatabase(config.databaseUrl);
  const server = createServer({
    authToken: config.authToken,
    database: databaseConnection.database
  });

  await server.listen({
    port: config.port,
    host: '0.0.0.0'
  });
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error('Unknown ingest-api error');
    console.error(error);
  }

  process.exitCode = 1;
});
