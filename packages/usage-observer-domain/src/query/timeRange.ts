import { z } from 'zod';

export const timeRangePresetSchema = z.enum(['24h', '7d', '30d']);

export function createRangeBounds(
  preset: z.infer<typeof timeRangePresetSchema>,
  now: Date
): {
  endAt: Date;
  startAt: Date;
} {
  const endAt = new Date(now.toISOString());
  const startAt = new Date(now.toISOString());

  if (preset === '24h') {
    startAt.setUTCHours(startAt.getUTCHours() - 24);
  }

  if (preset === '7d') {
    startAt.setUTCDate(startAt.getUTCDate() - 7);
  }

  if (preset === '30d') {
    startAt.setUTCDate(startAt.getUTCDate() - 30);
  }

  return {
    startAt,
    endAt
  };
}
