import { z } from 'zod';

import { runMigrations } from './runtime.js';

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1)
});

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  await runMigrations(environment.DATABASE_URL);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error('Unknown migration error');
    console.error(error);
  }

  process.exitCode = 1;
});
