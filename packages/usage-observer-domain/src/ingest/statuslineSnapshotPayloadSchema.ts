import { z } from 'zod';

export const statuslineSnapshotPayloadSchema = z
  .object({
    session_id: z.string().min(1),
    timestamp: z.string().datetime({
      offset: true
    }),
    project_id: z.string().min(1).nullable().optional(),
    project_root: z.string().min(1).nullable().optional(),
    cwd: z.string().min(1).nullable().optional(),
    pwd: z.string().min(1).nullable().optional(),
    git_branch: z.string().min(1).nullable().optional(),
    transcript_path: z.string().min(1).nullable().optional(),
    model_name: z.string().min(1).nullable().optional(),
    used_percentage: z.number().min(0).max(100).nullable().optional(),
    total_input_tokens: z.number().int().nonnegative().nullable().optional(),
    total_output_tokens: z.number().int().nonnegative().nullable().optional(),
    current_input_tokens: z.number().int().nonnegative().nullable().optional(),
    current_output_tokens: z.number().int().nonnegative().nullable().optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().nullable().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().nullable().optional(),
    total_cost_usd: z.number().nonnegative().nullable().optional(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
    five_hour_used_percent: z.number().min(0).max(100).nullable().optional(),
    seven_day_used_percent: z.number().min(0).max(100).nullable().optional(),
    source: z.string().min(1).default('statusline')
  })
  .strict();

export type StatuslineSnapshotPayload = z.infer<typeof statuslineSnapshotPayloadSchema>;
