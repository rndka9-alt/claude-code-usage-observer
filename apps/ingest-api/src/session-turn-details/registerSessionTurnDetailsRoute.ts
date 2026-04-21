import { sessionTurnDetailsPayloadSchema, sessionTurnDetails } from '@usage-observer/domain';
import type { UsageDatabase } from '@usage-observer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';

type RequireAuthorization = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export function registerSessionTurnDetailsRoute(
  server: FastifyInstance,
  database: UsageDatabase,
  requireAuthorization: RequireAuthorization
): void {
  server.post(
    '/v1/session-turn-details',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const payload = sessionTurnDetailsPayloadSchema.parse(request.body);

      await database
        .insert(sessionTurnDetails)
        .values(
          payload.turns.map((turn) => ({
            sessionId: payload.session_id,
            turnIndex: turn.turn_index,
            timestamp: new Date(turn.timestamp),
            modelName: turn.model_name ?? null,
            stopReason: turn.stop_reason ?? null,
            hasThinking: turn.has_thinking,
            serviceTier: turn.service_tier ?? null,
            speed: turn.speed ?? null,
            inputTokens: turn.input_tokens ?? null,
            outputTokens: turn.output_tokens ?? null,
            cacheCreationInputTokens: turn.cache_creation_input_tokens ?? null,
            cacheReadInputTokens: turn.cache_read_input_tokens ?? null,
            cacheCreationEphemeral1hTokens: turn.cache_creation_ephemeral_1h_tokens ?? null,
            cacheCreationEphemeral5mTokens: turn.cache_creation_ephemeral_5m_tokens ?? null,
            toolUseCount: turn.tool_use_count,
            toolNames: turn.tool_names
          }))
        )
        .onConflictDoUpdate({
          target: [sessionTurnDetails.sessionId, sessionTurnDetails.turnIndex],
          set: {
            timestamp: sql`excluded.timestamp`,
            modelName: sql`excluded.model_name`,
            stopReason: sql`excluded.stop_reason`,
            hasThinking: sql`excluded.has_thinking`,
            serviceTier: sql`excluded.service_tier`,
            speed: sql`excluded.speed`,
            inputTokens: sql`excluded.input_tokens`,
            outputTokens: sql`excluded.output_tokens`,
            cacheCreationInputTokens: sql`excluded.cache_creation_input_tokens`,
            cacheReadInputTokens: sql`excluded.cache_read_input_tokens`,
            cacheCreationEphemeral1hTokens: sql`excluded.cache_creation_ephemeral_1h_tokens`,
            cacheCreationEphemeral5mTokens: sql`excluded.cache_creation_ephemeral_5m_tokens`,
            toolUseCount: sql`excluded.tool_use_count`,
            toolNames: sql`excluded.tool_names`
          }
        });

      reply.code(202).send({
        accepted: true,
        turn_count: payload.turns.length
      });
    }
  );
}
