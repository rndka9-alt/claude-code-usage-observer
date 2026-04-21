import { z } from 'zod';

const turnDetailSchema = z.object({
  turn_index: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  model_name: z.string().min(1).nullable().optional(),
  stop_reason: z.string().min(1).nullable().optional(),
  has_thinking: z.boolean(),
  service_tier: z.string().min(1).nullable().optional(),
  speed: z.string().min(1).nullable().optional(),
  input_tokens: z.number().int().nonnegative().nullable().optional(),
  output_tokens: z.number().int().nonnegative().nullable().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().nullable().optional(),
  cache_read_input_tokens: z.number().int().nonnegative().nullable().optional(),
  cache_creation_ephemeral_1h_tokens: z.number().int().nonnegative().nullable().optional(),
  cache_creation_ephemeral_5m_tokens: z.number().int().nonnegative().nullable().optional(),
  tool_use_count: z.number().int().nonnegative(),
  tool_names: z.array(z.string())
});

export const sessionTurnDetailsPayloadSchema = z.object({
  session_id: z.string().min(1),
  turns: z.array(turnDetailSchema).min(1)
});

export type SessionTurnDetailsPayload = z.infer<typeof sessionTurnDetailsPayloadSchema>;
