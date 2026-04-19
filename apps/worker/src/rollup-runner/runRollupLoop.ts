import {
  createRangeBounds,
  deriveContributorImpactRollups,
  derivePromptFacts,
  deriveToolImpactRollups,
  rawUsageEventSchema
} from '@usage-observer/domain';
import type { RawUsageEvent, UsageDatabase } from '@usage-observer/domain';

import { fetchRawUsageEvents } from '../loki-source/index.js';
import { createRollupStore } from '../rollup-store/index.js';

function createDateBucket(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

function collectAffectedDateBuckets(rawEvents: RawUsageEvent[]): string[] {
  const affectedDateBuckets = new Set<string>();

  for (const rawEvent of rawEvents) {
    affectedDateBuckets.add(createDateBucket(new Date(rawEvent.timestamp)));
  }

  return Array.from(affectedDateBuckets.values()).sort((leftBucket, rightBucket) => {
    return leftBucket.localeCompare(rightBucket);
  });
}

async function runRollupCycle(input: {
  database: UsageDatabase;
  lokiBaseUrl: string;
  lookbackRange: '24h' | '7d' | '30d';
}): Promise<void> {
  const rangeBounds = createRangeBounds(input.lookbackRange, new Date());
  const rawEvents = await fetchRawUsageEvents({
    startAt: rangeBounds.startAt,
    endAt: rangeBounds.endAt,
    lokiBaseUrl: input.lokiBaseUrl
  });
  const parsedRawEvents = rawEvents.map((rawEvent) => rawUsageEventSchema.parse(rawEvent));
  const promptFacts = derivePromptFacts(parsedRawEvents);
  const rollupStore = createRollupStore(input.database);

  await rollupStore.replacePromptFacts(promptFacts);

  if (promptFacts.length === 0) {
    console.info('worker: no prompt facts derived in current window');
    return;
  }

  const contributorSnapshots = await rollupStore.listContextSnapshots({
    startAt: rangeBounds.startAt,
    endAt: rangeBounds.endAt
  });
  const toolImpactRows = deriveToolImpactRollups(promptFacts, parsedRawEvents);
  const contributorImpactRows = deriveContributorImpactRollups(promptFacts, contributorSnapshots);
  const affectedDateBuckets = collectAffectedDateBuckets(parsedRawEvents);

  await rollupStore.replaceToolImpact(toolImpactRows, affectedDateBuckets);
  await rollupStore.replaceContributorImpact(contributorImpactRows, affectedDateBuckets);

  console.info(
    `worker: rolled up ${promptFacts.length} prompts, ${toolImpactRows.length} tool rows, ${contributorImpactRows.length} contributor rows`
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function runRollupLoop(input: {
  database: UsageDatabase;
  lokiBaseUrl: string;
  lookbackRange: '24h' | '7d' | '30d';
  rollupIntervalMs: number;
  runOnce: boolean;
}): Promise<void> {
  do {
    try {
      await runRollupCycle({
        database: input.database,
        lokiBaseUrl: input.lokiBaseUrl,
        lookbackRange: input.lookbackRange
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack);
      } else {
        console.error('Unknown rollup cycle error');
        console.error(error);
      }
    }

    if (input.runOnce) {
      return;
    }

    await wait(input.rollupIntervalMs);
  } while (input.runOnce === false);
}
