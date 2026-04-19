import type { StatuslineSnapshotPayload } from '@usage-observer/domain';
import { statuslineSnapshotPayloadSchema } from '@usage-observer/domain';
import { z } from 'zod';

const rawStatuslineSchema = z
  .object({
    session_id: z.string().min(1),
    timestamp: z.string().datetime({
      offset: true
    }).optional(),
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
      .strict()
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
            output_tokens: z.number().int().nonnegative().nullable().optional()
          })
          .strict()
          .nullable()
          .optional()
      })
      .strict()
      .nullable()
      .optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().nullable().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().nullable().optional(),
    cost: z
      .object({
        total_cost_usd: z.number().nonnegative().nullable().optional()
      })
      .strict()
      .nullable()
      .optional(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
    rate_limits: z
      .object({
        five_hour: z
          .object({
            used_percent: z.number().min(0).max(100).nullable().optional()
          })
          .strict()
          .nullable()
          .optional(),
        seven_day: z
          .object({
            used_percent: z.number().min(0).max(100).nullable().optional()
          })
          .strict()
          .nullable()
          .optional()
      })
      .strict()
      .nullable()
      .optional()
  })
  .passthrough();

export function normalizeStatuslineSnapshot(
  rawStatusline: unknown,
  capturedAt: Date
): StatuslineSnapshotPayload {
  const parsedStatusline = rawStatuslineSchema.parse(rawStatusline);

  return statuslineSnapshotPayloadSchema.parse({
    session_id: parsedStatusline.session_id,
    timestamp:
      typeof parsedStatusline.timestamp === 'string'
        ? parsedStatusline.timestamp
        : capturedAt.toISOString(),
    project_id: parsedStatusline.project_id,
    project_root: parsedStatusline.project_root,
    cwd: parsedStatusline.cwd,
    pwd: parsedStatusline.pwd,
    git_branch: parsedStatusline.git_branch,
    transcript_path: parsedStatusline.transcript_path,
    model_name:
      typeof parsedStatusline.model_name === 'string'
        ? parsedStatusline.model_name
        : parsedStatusline.model?.display_name,
    used_percentage: parsedStatusline.context_window?.used_percentage,
    total_input_tokens: parsedStatusline.context_window?.total_input_tokens,
    total_output_tokens: parsedStatusline.context_window?.total_output_tokens,
    current_input_tokens: parsedStatusline.context_window?.current_usage?.input_tokens,
    current_output_tokens: parsedStatusline.context_window?.current_usage?.output_tokens,
    cache_creation_input_tokens: parsedStatusline.cache_creation_input_tokens,
    cache_read_input_tokens: parsedStatusline.cache_read_input_tokens,
    total_cost_usd: parsedStatusline.cost?.total_cost_usd,
    duration_ms: parsedStatusline.duration_ms,
    five_hour_used_percent: parsedStatusline.rate_limits?.five_hour?.used_percent,
    seven_day_used_percent: parsedStatusline.rate_limits?.seven_day?.used_percent,
    source: 'statusline'
  });
}
