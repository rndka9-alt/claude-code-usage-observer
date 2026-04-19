import {
  contextSnapshots,
  derivedContributorImpact,
  derivedPromptFacts,
  derivedToolImpact,
  sessions,
  sessionSnapshots
} from '@usage-observer/domain';
import type {
  ContextSnapshotsPayload,
  StatuslineSnapshotPayload,
  UsageDatabase
} from '@usage-observer/domain';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
type SessionRow = InferSelectModel<typeof sessions>;

function createDateBucket(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function upsertSession(
  database: UsageDatabase,
  payload: {
    firstSeenAt: Date;
    gitBranch: string | null | undefined;
    modelName: string | null | undefined;
    projectId: string | null | undefined;
    projectRoot: string | null | undefined;
    sessionId: string;
    source: string;
    transcriptPath: string | null | undefined;
  }
): Promise<void> {
  const existingRows = await database
    .select()
    .from(sessions)
    .where(eq(sessions.sessionId, payload.sessionId))
    .limit(1);

  const existingRow = existingRows[0];

  if (!(existingRow instanceof Object)) {
    await database.insert(sessions).values({
      sessionId: payload.sessionId,
      firstSeenAt: payload.firstSeenAt,
      lastSeenAt: payload.firstSeenAt,
      projectId: payload.projectId ?? null,
      projectRoot: payload.projectRoot ?? null,
      gitBranch: payload.gitBranch ?? null,
      transcriptPath: payload.transcriptPath ?? null,
      modelName: payload.modelName ?? null,
      source: payload.source
    });
    return;
  }

  await database
    .update(sessions)
    .set({
      firstSeenAt:
        payload.firstSeenAt < existingRow.firstSeenAt ? payload.firstSeenAt : existingRow.firstSeenAt,
      lastSeenAt: payload.firstSeenAt > existingRow.lastSeenAt ? payload.firstSeenAt : existingRow.lastSeenAt,
      projectId: typeof payload.projectId === 'string' ? payload.projectId : existingRow.projectId,
      projectRoot:
        typeof payload.projectRoot === 'string' ? payload.projectRoot : existingRow.projectRoot,
      gitBranch: typeof payload.gitBranch === 'string' ? payload.gitBranch : existingRow.gitBranch,
      transcriptPath:
        typeof payload.transcriptPath === 'string'
          ? payload.transcriptPath
          : existingRow.transcriptPath,
      modelName: typeof payload.modelName === 'string' ? payload.modelName : existingRow.modelName,
      source: payload.source
    })
    .where(eq(sessions.sessionId, payload.sessionId));
}

export function createSessionStore(database: UsageDatabase) {
  return {
    async getHealth(): Promise<void> {
      await database.execute(sql`select 1`);
    },

    async ingestContextSnapshots(payload: ContextSnapshotsPayload): Promise<void> {
      const capturedAt = new Date(payload.captured_at);

      await upsertSession(database, {
        firstSeenAt: capturedAt,
        gitBranch: payload.git_branch,
        modelName: payload.model_name,
        projectId: null,
        projectRoot: payload.project_root,
        sessionId: payload.session_id,
        source: payload.source,
        transcriptPath: payload.transcript_path
      });

      await database
        .insert(contextSnapshots)
        .values(
          payload.contributors.map((contributor) => {
            return {
              sessionId: payload.session_id,
              capturedAt,
              contributorType: contributor.contributor_type,
              contributorName: contributor.contributor_name,
              contributorScope: contributor.contributor_scope,
              contributorHash: contributor.contributor_hash,
              filePath: contributor.file_path ?? null,
              fileSizeBytes: contributor.file_size_bytes ?? null,
              lineCount: contributor.line_count ?? null,
              enabled: contributor.enabled,
              metadataJson: contributor.metadata_json
            };
          })
        )
        .onConflictDoUpdate({
          target: [
            contextSnapshots.sessionId,
            contextSnapshots.capturedAt,
            contextSnapshots.contributorType,
            contextSnapshots.contributorName,
            contextSnapshots.contributorHash
          ],
          set: {
            contributorScope: sql`excluded.contributor_scope`,
            filePath: sql`excluded.file_path`,
            fileSizeBytes: sql`excluded.file_size_bytes`,
            lineCount: sql`excluded.line_count`,
            enabled: sql`excluded.enabled`,
            metadataJson: sql`excluded.metadata_json`
          }
        });
    },

    async ingestStatuslineSnapshot(payload: StatuslineSnapshotPayload): Promise<void> {
      const capturedAt = new Date(payload.timestamp);

      await upsertSession(database, {
        firstSeenAt: capturedAt,
        gitBranch: payload.git_branch,
        modelName: payload.model_name,
        projectId: payload.project_id,
        projectRoot: payload.project_root,
        sessionId: payload.session_id,
        source: payload.source,
        transcriptPath: payload.transcript_path
      });

      await database
        .insert(sessionSnapshots)
        .values({
          sessionId: payload.session_id,
          capturedAt,
          cwd: payload.cwd ?? null,
          pwd: payload.pwd ?? null,
          usedPercentage: payload.used_percentage ?? null,
          totalInputTokens: payload.total_input_tokens ?? null,
          totalOutputTokens: payload.total_output_tokens ?? null,
          currentInputTokens: payload.current_input_tokens ?? null,
          currentOutputTokens: payload.current_output_tokens ?? null,
          cacheCreationInputTokens: payload.cache_creation_input_tokens ?? null,
          cacheReadInputTokens: payload.cache_read_input_tokens ?? null,
          totalCostUsd: payload.total_cost_usd ?? null,
          durationMs: payload.duration_ms ?? null,
          fiveHourUsedPercent: payload.five_hour_used_percent ?? null,
          sevenDayUsedPercent: payload.seven_day_used_percent ?? null
        })
        .onConflictDoUpdate({
          target: [sessionSnapshots.sessionId, sessionSnapshots.capturedAt],
          set: {
            cwd: sql`excluded.cwd`,
            pwd: sql`excluded.pwd`,
            usedPercentage: sql`excluded.used_percentage`,
            totalInputTokens: sql`excluded.total_input_tokens`,
            totalOutputTokens: sql`excluded.total_output_tokens`,
            currentInputTokens: sql`excluded.current_input_tokens`,
            currentOutputTokens: sql`excluded.current_output_tokens`,
            cacheCreationInputTokens: sql`excluded.cache_creation_input_tokens`,
            cacheReadInputTokens: sql`excluded.cache_read_input_tokens`,
            totalCostUsd: sql`excluded.total_cost_usd`,
            durationMs: sql`excluded.duration_ms`,
            fiveHourUsedPercent: sql`excluded.five_hour_used_percent`,
            sevenDayUsedPercent: sql`excluded.seven_day_used_percent`
          }
        });
    },

    async listSessions(input: {
      endAt: Date;
      limit: number;
      startAt: Date;
    }): Promise<
      Array<{
        latestSnapshot: InferSelectModel<typeof sessionSnapshots> | null;
        session: SessionRow;
      }>
    > {
      const sessionRows = await database
        .select()
        .from(sessions)
        .where(and(gte(sessions.lastSeenAt, input.startAt), lte(sessions.lastSeenAt, input.endAt)))
        .orderBy(desc(sessions.lastSeenAt))
        .limit(input.limit);

      if (sessionRows.length === 0) {
        return [];
      }

      const sessionIds = sessionRows.map((row) => row.sessionId);
      const snapshotRows = await database
        .select()
        .from(sessionSnapshots)
        .where(inArray(sessionSnapshots.sessionId, sessionIds))
        .orderBy(desc(sessionSnapshots.capturedAt));

      const latestSnapshotBySessionId = new Map<string, InferSelectModel<typeof sessionSnapshots>>();

      for (const snapshotRow of snapshotRows) {
        if (latestSnapshotBySessionId.has(snapshotRow.sessionId) === false) {
          latestSnapshotBySessionId.set(snapshotRow.sessionId, snapshotRow);
        }
      }

      return sessionRows.map((sessionRow) => {
        const latestSnapshot = latestSnapshotBySessionId.get(sessionRow.sessionId);

        return {
          session: sessionRow,
          latestSnapshot: latestSnapshot instanceof Object ? latestSnapshot : null
        };
      });
    },

    async getSessionDetail(input: {
      endAt: Date;
      sessionId: string;
      startAt: Date;
    }): Promise<{
      contributors: InferSelectModel<typeof contextSnapshots>[];
      promptFacts: InferSelectModel<typeof derivedPromptFacts>[];
      session: SessionRow | null;
      snapshots: InferSelectModel<typeof sessionSnapshots>[];
    }> {
      const sessionRows = await database
        .select()
        .from(sessions)
        .where(eq(sessions.sessionId, input.sessionId))
        .limit(1);
      const sessionRow = sessionRows[0];

      if (!(sessionRow instanceof Object)) {
        return {
          contributors: [],
          promptFacts: [],
          session: null,
          snapshots: []
        };
      }

      const snapshots = await database
        .select()
        .from(sessionSnapshots)
        .where(
          and(
            eq(sessionSnapshots.sessionId, input.sessionId),
            gte(sessionSnapshots.capturedAt, input.startAt),
            lte(sessionSnapshots.capturedAt, input.endAt)
          )
        )
        .orderBy(asc(sessionSnapshots.capturedAt));

      const contributors = await database
        .select()
        .from(contextSnapshots)
        .where(
          and(
            eq(contextSnapshots.sessionId, input.sessionId),
            gte(contextSnapshots.capturedAt, input.startAt),
            lte(contextSnapshots.capturedAt, input.endAt)
          )
        )
        .orderBy(asc(contextSnapshots.capturedAt));

      const promptFacts = await database
        .select()
        .from(derivedPromptFacts)
        .where(
          and(
            eq(derivedPromptFacts.sessionId, input.sessionId),
            gte(derivedPromptFacts.promptStartedAt, input.startAt),
            lte(derivedPromptFacts.promptStartedAt, input.endAt)
          )
        )
        .orderBy(asc(derivedPromptFacts.promptStartedAt));

      return {
        contributors,
        promptFacts,
        session: sessionRow,
        snapshots
      };
    },

    async listPromptFacts(input: {
      endAt: Date;
      limit: number;
      sessionId: string | null;
      startAt: Date;
    }): Promise<InferSelectModel<typeof derivedPromptFacts>[]> {
      if (typeof input.sessionId === 'string') {
        return database
          .select()
          .from(derivedPromptFacts)
          .where(
            and(
              eq(derivedPromptFacts.sessionId, input.sessionId),
              gte(derivedPromptFacts.promptStartedAt, input.startAt),
              lte(derivedPromptFacts.promptStartedAt, input.endAt)
            )
          )
          .orderBy(desc(derivedPromptFacts.totalCostUsd), desc(derivedPromptFacts.promptStartedAt))
          .limit(input.limit);
      }

      return database
        .select()
        .from(derivedPromptFacts)
        .where(
          and(
            gte(derivedPromptFacts.promptStartedAt, input.startAt),
            lte(derivedPromptFacts.promptStartedAt, input.endAt)
          )
        )
        .orderBy(desc(derivedPromptFacts.totalCostUsd), desc(derivedPromptFacts.promptStartedAt))
        .limit(input.limit);
    },

    async listToolImpact(input: {
      endAt: Date;
      limit: number;
      startAt: Date;
    }): Promise<InferSelectModel<typeof derivedToolImpact>[]> {
      return database
        .select()
        .from(derivedToolImpact)
        .where(
          and(
            gte(derivedToolImpact.dateBucket, createDateBucket(input.startAt)),
            lte(derivedToolImpact.dateBucket, createDateBucket(input.endAt))
          )
        )
        .orderBy(desc(derivedToolImpact.dateBucket), desc(derivedToolImpact.avgPromptCostUsd))
        .limit(input.limit);
    },

    async listContributorImpact(input: {
      endAt: Date;
      limit: number;
      startAt: Date;
    }): Promise<InferSelectModel<typeof derivedContributorImpact>[]> {
      return database
        .select()
        .from(derivedContributorImpact)
        .where(
          and(
            gte(derivedContributorImpact.dateBucket, createDateBucket(input.startAt)),
            lte(derivedContributorImpact.dateBucket, createDateBucket(input.endAt))
          )
        )
        .orderBy(desc(derivedContributorImpact.dateBucket), desc(derivedContributorImpact.avgPromptCostUsd))
        .limit(input.limit);
    }
  };
}
