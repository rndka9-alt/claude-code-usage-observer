import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  INGEST_API_AUTH_TOKEN: z.string().min(1).optional(),
  RUN_MIGRATIONS: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
});

export function readConfig(environment: NodeJS.ProcessEnv): {
  authToken: string | null;
  databaseUrl: string;
  port: number;
  runMigrations: boolean;
} {
  const parsedEnvironment = configSchema.parse(environment);

  return {
    authToken:
      typeof parsedEnvironment.INGEST_API_AUTH_TOKEN === 'string'
        ? parsedEnvironment.INGEST_API_AUTH_TOKEN
        : null,
    databaseUrl: parsedEnvironment.DATABASE_URL,
    port: parsedEnvironment.PORT,
    runMigrations: parsedEnvironment.RUN_MIGRATIONS === true
  };
}
