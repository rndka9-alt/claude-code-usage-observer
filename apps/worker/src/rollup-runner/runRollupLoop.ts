import {
  createRangeBounds,
  derivePromptFacts
} from '@usage-observer/domain';
import type { RawUsageEvent, UsageDatabase } from '@usage-observer/domain';

import { fetchRawUsageEvents } from '../loki-source/index.js';
import type { RollupPipeline } from '../rollup-pipelines/index.js';
import {
  contributorImpactPipeline,
  toolImpactPipeline
} from '../rollup-pipelines/index.js';
import { createRollupStore } from '../rollup-store/index.js';

import { parseRawUsageEvents } from './parseRawUsageEvents.js';

const PIPELINES: RollupPipeline[] = [
  toolImpactPipeline,
  contributorImpactPipeline
];

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
  const parsedRawEvents = parseRawUsageEvents(rawEvents);
  const promptFacts = derivePromptFacts(parsedRawEvents);
  const rollupStore = createRollupStore(input.database);

  await rollupStore.replacePromptFacts(promptFacts);

  if (promptFacts.length === 0) {
    console.info('worker: no prompt facts derived in current window');
    return;
  }

  const affectedDateBuckets = collectAffectedDateBuckets(parsedRawEvents);

  for (const pipeline of PIPELINES) {
    const result = await pipeline({
      rawEvents: parsedRawEvents,
      promptFacts,
      affectedDateBuckets,
      rangeBounds,
      database: input.database
    });
    console.info(`worker: ${result.pipelineName} produced ${result.rowCount} rows`);
  }
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
  let consecutiveFailures = 0;

  do {
    try {
      await runRollupCycle({
        database: input.database,
        lokiBaseUrl: input.lokiBaseUrl,
        lookbackRange: input.lookbackRange
      });
      consecutiveFailures = 0;
    } catch (error: unknown) {
      consecutiveFailures += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `Rollup cycle failed (${consecutiveFailures} consecutive): ${errorMessage}`
      );
      if (errorStack !== undefined) {
        console.error(errorStack);
      }
    }

    if (input.runOnce) {
      return;
    }

    await wait(input.rollupIntervalMs);
  } while (input.runOnce === false);
}
