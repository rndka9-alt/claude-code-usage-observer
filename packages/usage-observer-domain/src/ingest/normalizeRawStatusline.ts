import { z } from 'zod';

import type { StatuslineSnapshotPayload } from './statuslineSnapshotPayloadSchema.js';
import { statuslineSnapshotPayloadSchema } from './statuslineSnapshotPayloadSchema.js';

const rawStatuslineSchema = z
  .object({
    session_id: z.string().min(1),
    timestamp: z
      .string()
      .datetime({ offset: true })
      .optional(),
    project_id: z.string().min(1).nullable().optional(),
    project_root: z.string().min(1).nullable().optional(),
    cwd: z.string().min(1).nullable().optional(),
    pwd: z.string().min(1).nullable().optional(),
    git_branch: z.string().min(1).nullable().optional(),
    transcript_path: z.string().min(1).nullable().optional(),
    model_name: z.string().min(1).nullable().optional(),
    model: z
      .object({
        display_name: z.string().min(1).nullable().optional()
      })
      .passthrough()
      .nullable()
      .optional(),
    context_window: z
      .object({
        used_percentage: z.number().min(0).max(100).nullable().optional(),
        total_input_tokens: z.number().int().nonnegative().nullable().optional(),
        total_output_tokens: z.number().int().nonnegative().nullable().optional(),
        current_usage: z
          .object({
            input_tokens: z.number().int().nonnegative().nullable().optional(),
            output_tokens: z.number().int().nonnegative().nullable().optional(),
            cache_creation_input_tokens: z.number().int().nonnegative().nullable().optional(),
            cache_read_input_tokens: z.number().int().nonnegative().nullable().optional()
          })
          .passthrough()
          .nullable()
          .optional()
      })
      .passthrough()
      .nullable()
      .optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().nullable().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().nullable().optional(),
    cost: z
      .object({
        total_cost_usd: z.number().nonnegative().nullable().optional(),
        total_duration_ms: z.number().int().nonnegative().nullable().optional()
      })
      .passthrough()
      .nullable()
      .optional(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
    rate_limits: z
      .object({
        five_hour: z
          .object({
            used_percentage: z.number().min(0).max(100).nullable().optional()
          })
          .passthrough()
          .nullable()
          .optional(),
        seven_day: z
          .object({
            used_percentage: z.number().min(0).max(100).nullable().optional()
          })
          .passthrough()
          .nullable()
          .optional()
      })
      .passthrough()
      .nullable()
      .optional()
  })
  .passthrough();

export type RawStatusline = z.infer<typeof rawStatuslineSchema>;

const mappedTopLevelKeys = new Set([
  'session_id',
  'timestamp',
  'project_id',
  'project_root',
  'cwd',
  'pwd',
  'git_branch',
  'transcript_path',
  'model_name',
  'model',
  'context_window',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'cost',
  'duration_ms',
  'rate_limits',
  'source'
]);

function warnUnmappedFields(raw: RawStatusline): void {
  const unmapped = Object.keys(raw).filter(
    (key) => mappedTopLevelKeys.has(key) === false
  );

  if (unmapped.length > 0) {
    console.warn(`unmapped statusline fields: ${unmapped.join(', ')}`);
  }
}

export function normalizeRawStatusline(
  rawStatusline: unknown,
  capturedAt: Date
): StatuslineSnapshotPayload {
  const parsed = rawStatuslineSchema.parse(rawStatusline);

  warnUnmappedFields(parsed);

  const cacheCreation =
    parsed.context_window?.current_usage?.cache_creation_input_tokens ??
    parsed.cache_creation_input_tokens;
  const cacheRead =
    parsed.context_window?.current_usage?.cache_read_input_tokens ??
    parsed.cache_read_input_tokens;
  const durationMs = parsed.duration_ms ?? parsed.cost?.total_duration_ms;

  return statuslineSnapshotPayloadSchema.parse({
    session_id: parsed.session_id,
    timestamp:
      typeof parsed.timestamp === 'string'
        ? parsed.timestamp
        : capturedAt.toISOString(),
    project_id: parsed.project_id,
    project_root: parsed.project_root,
    cwd: parsed.cwd,
    pwd: parsed.pwd,
    git_branch: parsed.git_branch,
    transcript_path: parsed.transcript_path,
    model_name:
      typeof parsed.model_name === 'string'
        ? parsed.model_name
        : parsed.model?.display_name,
    used_percentage: parsed.context_window?.used_percentage,
    total_input_tokens: parsed.context_window?.total_input_tokens,
    total_output_tokens: parsed.context_window?.total_output_tokens,
    current_input_tokens: parsed.context_window?.current_usage?.input_tokens,
    current_output_tokens: parsed.context_window?.current_usage?.output_tokens,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    total_cost_usd: parsed.cost?.total_cost_usd,
    duration_ms: durationMs,
    five_hour_used_percent: parsed.rate_limits?.five_hour?.used_percentage,
    seven_day_used_percent: parsed.rate_limits?.seven_day?.used_percentage,
    source: 'statusline'
  });
}
