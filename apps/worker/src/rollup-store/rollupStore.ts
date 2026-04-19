import {
  contextSnapshots,
  derivedContributorImpact,
  derivedPromptFacts,
  derivedToolImpact
} from '@usage-observer/domain';
import type { UsageDatabase } from '@usage-observer/domain';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export function createRollupStore(database: UsageDatabase) {
  return {
    async listContextSnapshots(input: {
      endAt: Date;
      startAt: Date;
    }): Promise<InferSelectModel<typeof contextSnapshots>[]> {
      return database
        .select()
        .from(contextSnapshots)
        .where(
          and(
            gte(contextSnapshots.capturedAt, input.startAt),
            lte(contextSnapshots.capturedAt, input.endAt)
          )
        )
        .orderBy(asc(contextSnapshots.sessionId), asc(contextSnapshots.capturedAt));
    },

    async replacePromptFacts(rows: InferInsertModel<typeof derivedPromptFacts>[]): Promise<void> {
      if (rows.length === 0) {
        return;
      }

      await database
        .insert(derivedPromptFacts)
        .values(rows)
        .onConflictDoUpdate({
          target: [derivedPromptFacts.sessionId, derivedPromptFacts.promptId],
          set: {
            promptStartedAt: sql`excluded.prompt_started_at`,
            promptFinishedAt: sql`excluded.prompt_finished_at`,
            apiRequestCount: sql`excluded.api_request_count`,
            toolCallCount: sql`excluded.tool_call_count`,
            totalInputTokens: sql`excluded.total_input_tokens`,
            totalOutputTokens: sql`excluded.total_output_tokens`,
            totalCacheReadTokens: sql`excluded.total_cache_read_tokens`,
            totalCacheCreationTokens: sql`excluded.total_cache_creation_tokens`,
            totalCostUsd: sql`excluded.total_cost_usd`,
            totalDurationMs: sql`excluded.total_duration_ms`,
            hadError: sql`excluded.had_error`,
            idleGapBeforeMs: sql`excluded.idle_gap_before_ms`,
            cacheEfficiencyScore: sql`excluded.cache_efficiency_score`
          }
        });
    },

    async replaceToolImpact(
      rows: InferInsertModel<typeof derivedToolImpact>[],
      affectedDateBuckets: string[]
    ): Promise<void> {
      if (affectedDateBuckets.length === 0) {
        return;
      }

      await database
        .delete(derivedToolImpact)
        .where(inArray(derivedToolImpact.dateBucket, affectedDateBuckets));

      if (rows.length === 0) {
        return;
      }

      await database.insert(derivedToolImpact).values(rows);
    },

    async replaceContributorImpact(
      rows: InferInsertModel<typeof derivedContributorImpact>[],
      affectedDateBuckets: string[]
    ): Promise<void> {
      if (affectedDateBuckets.length === 0) {
        return;
      }

      await database
        .delete(derivedContributorImpact)
        .where(inArray(derivedContributorImpact.dateBucket, affectedDateBuckets));

      if (rows.length === 0) {
        return;
      }

      await database.insert(derivedContributorImpact).values(rows);
    }
  };
}
