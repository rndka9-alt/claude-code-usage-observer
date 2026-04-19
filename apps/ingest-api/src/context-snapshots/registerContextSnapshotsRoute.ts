import { contextSnapshotsPayloadSchema } from '@usage-observer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createSessionStore } from '../session-store/index.js';

type SessionStore = ReturnType<typeof createSessionStore>;
type RequireAuthorization = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export function registerContextSnapshotsRoute(
  server: FastifyInstance,
  sessionStore: SessionStore,
  requireAuthorization: RequireAuthorization
): void {
  server.post(
    '/v1/context-snapshots',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const payload = contextSnapshotsPayloadSchema.parse(request.body);
      await sessionStore.ingestContextSnapshots(payload);

      reply.code(202).send({
        accepted: true,
        contributor_count: payload.contributors.length
      });
    }
  );
}
