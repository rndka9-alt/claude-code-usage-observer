import { timeRangePresetSchema } from '@usage-observer/domain';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  LOKI_BASE_URL: z.string().url(),
  LOOKBACK_RANGE: timeRangePresetSchema.default('7d'),
  ROLLUP_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  RUN_ONCE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
});

export function readConfig(environment: NodeJS.ProcessEnv): {
  databaseUrl: string;
  lokiBaseUrl: string;
  lookbackRange: '24h' | '7d' | '30d';
  rollupIntervalMs: number;
  runOnce: boolean;
} {
  const parsedEnvironment = configSchema.parse(environment);

  return {
    databaseUrl: parsedEnvironment.DATABASE_URL,
    lokiBaseUrl: parsedEnvironment.LOKI_BASE_URL,
    lookbackRange: parsedEnvironment.LOOKBACK_RANGE,
    rollupIntervalMs: parsedEnvironment.ROLLUP_INTERVAL_MS,
    runOnce: parsedEnvironment.RUN_ONCE === true
  };
}
