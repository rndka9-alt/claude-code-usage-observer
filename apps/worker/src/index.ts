import { createDatabase } from '@usage-observer/domain';

import { readConfig } from './config/index.js';
import { runRollupLoop } from './rollup-runner/index.js';

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const databaseConnection = createDatabase(config.databaseUrl);

  await runRollupLoop({
    database: databaseConnection.database,
    lokiBaseUrl: config.lokiBaseUrl,
    lookbackRange: config.lookbackRange,
    rollupIntervalMs: config.rollupIntervalMs,
    runOnce: config.runOnce
  });
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error('Unknown worker error');
    console.error(error);
  }

  process.exitCode = 1;
});
