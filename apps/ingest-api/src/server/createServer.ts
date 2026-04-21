import type { UsageDatabase } from '@usage-observer/domain';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import { createRequireAuthorization } from '../auth/index.js';
import { registerContextSnapshotsRoute } from '../context-snapshots/index.js';
import { registerContributorImpactRoute } from '../contributor-impact/index.js';
import { registerHealthRoute } from '../health/index.js';
import { registerPromptFactsRoute } from '../prompt-facts/index.js';
import { createSessionStore } from '../session-store/index.js';
import { registerSessionsRoute } from '../sessions/index.js';
import { registerSessionFileChangesRoute } from '../session-file-changes/index.js';
import { registerSessionTurnDetailsRoute } from '../session-turn-details/index.js';
import { registerStatuslineSnapshotsRoute } from '../statusline-snapshots/index.js';
import { registerToolImpactRoute } from '../tool-impact/index.js';

export function createServer(input: {
  authToken: string | null;
  database: UsageDatabase;
}) {
  const server = Fastify({
    logger: true
  });

  const sessionStore = createSessionStore(input.database);
  const requireAuthorization = createRequireAuthorization(input.authToken);

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        message: 'Payload validation failed',
        issues: error.issues
      });
      return;
    }

    request.log.error(error);
    reply.code(500).send({
      message: error instanceof Error ? error.message : 'Unknown server error'
    });
  });

  registerHealthRoute(server, sessionStore);
  registerStatuslineSnapshotsRoute(server, sessionStore, requireAuthorization);
  registerContextSnapshotsRoute(server, sessionStore, requireAuthorization);
  registerSessionsRoute(server, sessionStore, requireAuthorization);
  registerPromptFactsRoute(server, sessionStore, requireAuthorization);
  registerToolImpactRoute(server, sessionStore, requireAuthorization);
  registerContributorImpactRoute(server, sessionStore, requireAuthorization);
  registerSessionTurnDetailsRoute(server, input.database, requireAuthorization);
  registerSessionFileChangesRoute(server, input.database, requireAuthorization);

  return server;
}
