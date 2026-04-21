import { sessionFileChangesPayloadSchema, sessionFileChanges } from '@usage-observer/domain';
import type { UsageDatabase } from '@usage-observer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';

type RequireAuthorization = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export function registerSessionFileChangesRoute(
  server: FastifyInstance,
  database: UsageDatabase,
  requireAuthorization: RequireAuthorization
): void {
  server.post(
    '/v1/session-file-changes',
    {
      preHandler: requireAuthorization
    },
    async (request, reply) => {
      const payload = sessionFileChangesPayloadSchema.parse(request.body);

      await database
        .insert(sessionFileChanges)
        .values(
          payload.files.map((file) => ({
            sessionId: payload.session_id,
            filePath: file.file_path,
            fileName: file.file_name,
            version: file.version,
            backupTime: new Date(file.backup_time)
          }))
        )
        .onConflictDoUpdate({
          target: [sessionFileChanges.sessionId, sessionFileChanges.filePath],
          set: {
            version: sql`excluded.version`,
            backupTime: sql`excluded.backup_time`
          }
        });

      reply.code(202).send({
        accepted: true,
        file_count: payload.files.length
      });
    }
  );
}
