import { randomUUID } from 'node:crypto';

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import {
  contextSnapshots,
  derivedContributorImpact,
  derivedPromptFacts
} from '../../database/schema/schema.js';

type ContextSnapshotRow = InferSelectModel<typeof contextSnapshots>;
type ContributorImpactRow = InferInsertModel<typeof derivedContributorImpact>;
type PromptFactRow = InferInsertModel<typeof derivedPromptFacts>;

type ContributorAggregate = {
  cacheHitPromptCount: number;
  contributorName: string;
  contributorType: string;
  dateBucket: string;
  promptCostTotal: number;
  promptCount: number;
  promptInputTotal: number;
  promptOutputTotal: number;
  sessionKeys: Set<string>;
};

function createDateBucket(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

function createContributorKey(
  contributorType: string,
  contributorName: string,
  contributorHash: string
): string {
  return `${contributorType}\u0000${contributorName}\u0000${contributorHash}`;
}

function createContributorAggregate(
  contributorType: string,
  contributorName: string,
  dateBucket: string
): ContributorAggregate {
  return {
    cacheHitPromptCount: 0,
    contributorName,
    contributorType,
    dateBucket,
    promptCostTotal: 0,
    promptCount: 0,
    promptInputTotal: 0,
    promptOutputTotal: 0,
    sessionKeys: new Set<string>()
  };
}

function collectActiveContributors(
  promptFact: PromptFactRow,
  snapshotsBySession: Map<string, ContextSnapshotRow[]>
): ContextSnapshotRow[] {
  const sessionSnapshots = snapshotsBySession.get(promptFact.sessionId);

  if (!(sessionSnapshots instanceof Array)) {
    return [];
  }

  const activeContributors = new Map<string, ContextSnapshotRow>();

  for (const snapshot of sessionSnapshots) {
    if (snapshot.capturedAt > promptFact.promptStartedAt) {
      break;
    }

    const contributorKey = createContributorKey(
      snapshot.contributorType,
      snapshot.contributorName,
      snapshot.contributorHash
    );

    activeContributors.set(contributorKey, snapshot);
  }

  return Array.from(activeContributors.values()).filter((snapshot) => snapshot.enabled);
}

export function deriveContributorImpactRollups(
  promptFacts: PromptFactRow[],
  contributorSnapshots: ContextSnapshotRow[]
): ContributorImpactRow[] {
  const snapshotsBySession = new Map<string, ContextSnapshotRow[]>();

  for (const contributorSnapshot of contributorSnapshots) {
    const sessionSnapshots = snapshotsBySession.get(contributorSnapshot.sessionId);

    if (sessionSnapshots instanceof Array) {
      sessionSnapshots.push(contributorSnapshot);
      continue;
    }

    snapshotsBySession.set(contributorSnapshot.sessionId, [contributorSnapshot]);
  }

  for (const sessionSnapshots of snapshotsBySession.values()) {
    sessionSnapshots.sort((leftSnapshot, rightSnapshot) => {
      return leftSnapshot.capturedAt.getTime() - rightSnapshot.capturedAt.getTime();
    });
  }

  const aggregates = new Map<string, ContributorAggregate>();

  for (const promptFact of promptFacts) {
    const activeContributors = collectActiveContributors(promptFact, snapshotsBySession);

    for (const activeContributor of activeContributors) {
      const dateBucket = createDateBucket(promptFact.promptStartedAt);
      const aggregateKey = `${dateBucket}\u0000${activeContributor.contributorType}\u0000${activeContributor.contributorName}`;
      const existingAggregate = aggregates.get(aggregateKey);
      const aggregate =
        existingAggregate instanceof Object
          ? existingAggregate
          : createContributorAggregate(
              activeContributor.contributorType,
              activeContributor.contributorName,
              dateBucket
            );

      aggregate.promptCount += 1;
      aggregate.promptCostTotal += promptFact.totalCostUsd;
      aggregate.promptInputTotal += promptFact.totalInputTokens;
      aggregate.promptOutputTotal += promptFact.totalOutputTokens;
      aggregate.sessionKeys.add(promptFact.sessionId);

      if (promptFact.totalCacheReadTokens > 0) {
        aggregate.cacheHitPromptCount += 1;
      }

      aggregates.set(aggregateKey, aggregate);
    }
  }

  return Array.from(aggregates.values())
    .map((aggregate) => {
      return {
        id: randomUUID(),
        dateBucket: aggregate.dateBucket,
        contributorType: aggregate.contributorType,
        contributorName: aggregate.contributorName,
        sessionCount: aggregate.sessionKeys.size,
        promptCount: aggregate.promptCount,
        avgPromptCostUsd: Number((aggregate.promptCostTotal / aggregate.promptCount).toFixed(6)),
        avgPromptInputTokens: Number((aggregate.promptInputTotal / aggregate.promptCount).toFixed(2)),
        avgPromptOutputTokens: Number((aggregate.promptOutputTotal / aggregate.promptCount).toFixed(2)),
        cacheHitRate: Number((aggregate.cacheHitPromptCount / aggregate.promptCount).toFixed(4)),
        notes:
          'Correlation only. Derived from contributor snapshots active at or before prompt start; not exact token attribution.'
      };
    })
    .sort((leftRow, rightRow) => {
      if (leftRow.dateBucket === rightRow.dateBucket) {
        if (leftRow.contributorType === rightRow.contributorType) {
          return leftRow.contributorName.localeCompare(rightRow.contributorName);
        }

        return leftRow.contributorType.localeCompare(rightRow.contributorType);
      }

      return leftRow.dateBucket.localeCompare(rightRow.dateBucket);
    });
}
