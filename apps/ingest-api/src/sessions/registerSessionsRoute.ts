import { createRangeBounds, timeRangePresetSchema } from '@usage-observer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createSessionStore } from '../session-store/index.js';

type SessionStore = ReturnType<typeof createSessionStore>;
type RequireAuthorization = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

const sessionsListQuerySchema = z
  .object({
    range: timeRangePresetSchema.optional(),
    limit: z.coerce.number().int().positive().max(500).optional()
  })
  .strict();

const sessionDetailQuerySchema = z
  .object({
    range: timeRangePresetSchema.optional()
  })
  .strict();

export function registerSessionsRoute(
  server: FastifyInstance,
  sessionStore: SessionStore,
  requireAuthorization: RequireAuthorization
): void {
  server.get(
    '/v1/sessions',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const query = sessionsListQuerySchema.parse(request.query);
      const range = typeof query.range === 'string' ? query.range : '7d';
      const limit = typeof query.limit === 'number' ? query.limit : 100;
      const bounds = createRangeBounds(range, new Date());
      const items = await sessionStore.listSessions({
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

  server.get(
    '/v1/sessions/:sessionId',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const params = z.object({
        sessionId: z.string().min(1)
      }).parse(request.params);
      const query = sessionDetailQuerySchema.parse(request.query);
      const range = typeof query.range === 'string' ? query.range : '7d';
      const bounds = createRangeBounds(range, new Date());
      const detail = await sessionStore.getSessionDetail({
        sessionId: params.sessionId,
        startAt: bounds.startAt,
        endAt: bounds.endAt
      });

      if (!(detail.session instanceof Object)) {
        reply.code(404).send({
          message: `Unknown session_id: ${params.sessionId}`
        });
        return;
      }

      reply.send({
        ...detail,
        range
      });
    }
  );
}
