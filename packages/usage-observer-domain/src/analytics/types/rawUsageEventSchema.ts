import { z } from 'zod';

export const rawUsageEventSchema = z
  .object({
    timestamp: z.string().datetime({
      offset: true
    }),
    event_type: z.string().min(1),
    session_id: z.string().min(1),
    prompt_id: z.string().min(1).nullable().optional(),
    trace_id: z.string().min(1).nullable().optional(),
    span_id: z.string().min(1).nullable().optional(),
    project_id: z.string().min(1).nullable().optional(),
    project_root: z.string().min(1).nullable().optional(),
    transcript_path: z.string().min(1).nullable().optional(),
    model_name: z.string().min(1).nullable().optional(),
    tool_name: z.string().min(1).nullable().optional(),
    mcp_server_name: z.string().min(1).nullable().optional(),
    skill_name: z.string().min(1).nullable().optional(),
    source_type: z.string().min(1).nullable().optional(),
    input_tokens: z.number().int().nonnegative().nullable().optional(),
    output_tokens: z.number().int().nonnegative().nullable().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().nullable().optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().nullable().optional(),
    total_cost_usd: z.number().nonnegative().nullable().optional(),
    duration_ms: z.number().int().nonnegative().nullable().optional(),
    result_size_bytes: z.number().int().nonnegative().nullable().optional(),
    success: z.boolean().nullable().optional(),
    had_error: z.boolean().nullable().optional()
  })
  .passthrough();

export type RawUsageEvent = z.infer<typeof rawUsageEventSchema>;
