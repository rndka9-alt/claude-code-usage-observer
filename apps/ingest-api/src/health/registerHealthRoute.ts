import type { FastifyInstance } from 'fastify';

import { createSessionStore } from '../session-store/index.js';

type SessionStore = ReturnType<typeof createSessionStore>;

export function registerHealthRoute(server: FastifyInstance, sessionStore: SessionStore): void {
  server.get('/v1/health', async (_request, reply) => {
    await sessionStore.getHealth();

    reply.send({
      ok: true
    });
  });
}
