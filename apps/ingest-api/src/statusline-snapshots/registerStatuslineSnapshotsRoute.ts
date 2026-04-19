import { statuslineSnapshotPayloadSchema } from '@usage-observer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createSessionStore } from '../session-store/index.js';

type SessionStore = ReturnType<typeof createSessionStore>;
type RequireAuthorization = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export function registerStatuslineSnapshotsRoute(
  server: FastifyInstance,
  sessionStore: SessionStore,
  requireAuthorization: RequireAuthorization
): void {
  server.post(
    '/v1/statusline-snapshots',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const payload = statuslineSnapshotPayloadSchema.parse(request.body);
      await sessionStore.ingestStatuslineSnapshot(payload);

      reply.code(202).send({
        accepted: true
      });
    }
  );
}
