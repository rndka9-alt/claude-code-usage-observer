import { createRangeBounds, timeRangePresetSchema } from '@usage-observer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createSessionStore } from '../session-store/index.js';

type SessionStore = ReturnType<typeof createSessionStore>;
type RequireAuthorization = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

const querySchema = z
  .object({
    range: timeRangePresetSchema.optional(),
    session_id: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(1000).optional()
  })
  .strict();

export function registerPromptFactsRoute(
  server: FastifyInstance,
  sessionStore: SessionStore,
  requireAuthorization: RequireAuthorization
): void {
  server.get(
    '/v1/prompt-facts',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const range = typeof query.range === 'string' ? query.range : '7d';
      const limit = typeof query.limit === 'number' ? query.limit : 250;
      const bounds = createRangeBounds(range, new Date());
      const items = await sessionStore.listPromptFacts({
        startAt: bounds.startAt,
        endAt: bounds.endAt,
        sessionId: typeof query.session_id === 'string' ? query.session_id : null,
        limit
      });

      reply.send({
        items,
        range
      });
    }
  );
}
