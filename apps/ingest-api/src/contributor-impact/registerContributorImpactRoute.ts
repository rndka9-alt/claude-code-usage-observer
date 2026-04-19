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
    limit: z.coerce.number().int().positive().max(1000).optional()
  })
  .strict();

export function registerContributorImpactRoute(
  server: FastifyInstance,
  sessionStore: SessionStore,
  requireAuthorization: RequireAuthorization
): void {
  server.get(
    '/v1/contributor-impact',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const query = querySchema.parse(request.query);
      const range = typeof query.range === 'string' ? query.range : '7d';
      const limit = typeof query.limit === 'number' ? query.limit : 200;
      const bounds = createRangeBounds(range, new Date());
      const items = await sessionStore.listContributorImpact({
        startAt: bounds.startAt,
        endAt: bounds.endAt,
        limit
      });

      reply.send({
        items,
        range
      });
    }
  );
}
