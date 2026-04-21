import {
  createRangeBounds,
  deriveContributorImpactRollups,
  derivePromptFacts,
  deriveToolImpactRollups
} from '@usage-observer/domain';
import type { RawUsageEvent, UsageDatabase } from '@usage-observer/domain';

import type { RawUsageEventNormalizationDiagnostic } from '../loki-source/index.js';
import { fetchRawUsageEvents, normalizeRawUsageEventWithDiagnostics } from '../loki-source/index.js';
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

function incrementCount(counter: Map<string, number>, key: string): void {
  const nextCount = (counter.get(key) ?? 0) + 1;
  counter.set(key, nextCount);
}

function formatTopCounts(counter: Map<string, number>, limit: number): string {
  return Array.from(counter.entries())
    .sort((leftEntry, rightEntry) => {
      if (leftEntry[1] === rightEntry[1]) {
        return leftEntry[0].localeCompare(rightEntry[0]);
      }

      return rightEntry[1] - leftEntry[1];
    })
    .slice(0, limit)
    .map(([label, count]) => {
      return `${label} x${count}`;
    })
    .join(', ');
}

function collectDiagnosticFields(
  counter: Map<string, number>,
  labels: string[]
): void {
  for (const label of labels) {
    incrementCount(counter, label);
  }
}

function logNormalizationDiagnostics(input: {
  attributeFieldCounts: Map<string, number>;
  diagnostics: RawUsageEventNormalizationDiagnostic[];
  missingFieldCounts: Map<string, number>;
  reasonCounts: Map<string, number>;
  resourceFieldCounts: Map<string, number>;
  rootFieldCounts: Map<string, number>;
  unknownEventNameCounts: Map<string, number>;
}): void {
  if (input.diagnostics.length === 0) {
    return;
  }

  console.warn(
    `worker: skipped ${input.diagnostics.length} non-usage JSON log events from Loki (${formatTopCounts(
      input.reasonCounts,
      6
    )})`
  );

  if (input.unknownEventNameCounts.size > 0) {
    console.warn(`worker: unknown Loki event names: ${formatTopCounts(input.unknownEventNameCounts, 8)}`);
  }

  if (input.missingFieldCounts.size > 0) {
    console.warn(`worker: missing required Loki fields: ${formatTopCounts(input.missingFieldCounts, 8)}`);
  }

  if (input.rootFieldCounts.size > 0) {
    console.warn(`worker: unrecognized Loki root fields: ${formatTopCounts(input.rootFieldCounts, 10)}`);
  }

  if (input.attributeFieldCounts.size > 0) {
    console.warn(
      `worker: unrecognized Loki attribute fields: ${formatTopCounts(input.attributeFieldCounts, 12)}`
    );
  }

  if (input.resourceFieldCounts.size > 0) {
    console.warn(
      `worker: unrecognized Loki resource fields: ${formatTopCounts(input.resourceFieldCounts, 10)}`
    );
  }
}

export function parseRawUsageEvents(rawEvents: unknown[]): RawUsageEvent[] {
  const parsedRawEvents: RawUsageEvent[] = [];
  const diagnostics: RawUsageEventNormalizationDiagnostic[] = [];
  const reasonCounts = new Map<string, number>();
  const unknownEventNameCounts = new Map<string, number>();
  const missingFieldCounts = new Map<string, number>();
  const rootFieldCounts = new Map<string, number>();
  const attributeFieldCounts = new Map<string, number>();
  const resourceFieldCounts = new Map<string, number>();

  for (const rawEvent of rawEvents) {
    const normalizedResult = normalizeRawUsageEventWithDiagnostics(rawEvent);

    if (normalizedResult.event !== null) {
      parsedRawEvents.push(normalizedResult.event);
      continue;
    }

    diagnostics.push(normalizedResult.diagnostic);
    incrementCount(reasonCounts, normalizedResult.diagnostic.reason);

    if (typeof normalizedResult.diagnostic.rawEventName === 'string') {
      incrementCount(unknownEventNameCounts, normalizedResult.diagnostic.rawEventName);
    }

    collectDiagnosticFields(missingFieldCounts, normalizedResult.diagnostic.missingFields);
    collectDiagnosticFields(rootFieldCounts, normalizedResult.diagnostic.unknownRootKeys);
    collectDiagnosticFields(attributeFieldCounts, normalizedResult.diagnostic.unknownAttributeKeys);
    collectDiagnosticFields(resourceFieldCounts, normalizedResult.diagnostic.unknownResourceKeys);
  }

  logNormalizationDiagnostics({
    attributeFieldCounts,
    diagnostics,
    missingFieldCounts,
    reasonCounts,
    resourceFieldCounts,
    rootFieldCounts,
    unknownEventNameCounts
  });

  return parsedRawEvents;
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
