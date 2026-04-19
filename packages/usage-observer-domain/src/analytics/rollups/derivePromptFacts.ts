import { randomUUID } from 'node:crypto';

import type { InferInsertModel } from 'drizzle-orm';

import { derivedPromptFacts } from '../../database/schema/schema.js';
import { rawUsageEventSchema } from '../types/rawUsageEventSchema.js';

type RawUsageEvent = ReturnType<typeof rawUsageEventSchema.parse>;
type DerivedPromptFactInsert = InferInsertModel<typeof derivedPromptFacts>;

type PromptAggregate = {
  apiRequestCount: number;
  earliestTimestamp: Date;
  hadError: boolean;
  latestTimestamp: Date;
  promptFinishedAt: Date | null;
  promptStartedAt: Date | null;
  sessionId: string;
  toolCallCount: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

function createPromptKey(sessionId: string, promptId: string): string {
  return `${sessionId}\u0000${promptId}`;
}

function createEmptyPromptAggregate(event: RawUsageEvent, eventTimestamp: Date): PromptAggregate {
  return {
    apiRequestCount: 0,
    earliestTimestamp: eventTimestamp,
    hadError: false,
    latestTimestamp: eventTimestamp,
    promptFinishedAt: null,
    promptStartedAt: null,
    sessionId: event.session_id,
    toolCallCount: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0
  };
}

function incrementNumber(total: number, value: number | null | undefined): number {
  if (typeof value !== 'number') {
    return total;
  }

  return total + value;
}

function calculateCacheEfficiencyScore(
  totalCacheReadTokens: number,
  totalCacheCreationTokens: number
): number | null {
  const denominator = totalCacheReadTokens + totalCacheCreationTokens;

  if (denominator === 0) {
    return null;
  }

  return Number((totalCacheReadTokens / denominator).toFixed(4));
}

function calculatePromptDurationMilliseconds(
  aggregate: PromptAggregate,
  promptStartedAt: Date,
  promptFinishedAt: Date
): number {
  const startedAtMilliseconds = promptStartedAt.getTime();
  const finishedAtMilliseconds = promptFinishedAt.getTime();

  if (aggregate.promptFinishedAt instanceof Date) {
    return Math.max(0, finishedAtMilliseconds - startedAtMilliseconds);
  }

  return Math.max(0, aggregate.latestTimestamp.getTime() - aggregate.earliestTimestamp.getTime());
}

export function derivePromptFacts(rawEvents: unknown[]): DerivedPromptFactInsert[] {
  const promptAggregates = new Map<string, PromptAggregate>();

  for (const rawEvent of rawEvents) {
    const event = rawUsageEventSchema.parse(rawEvent);

    if (typeof event.prompt_id !== 'string') {
      continue;
    }

    const eventTimestamp = new Date(event.timestamp);
    const promptKey = createPromptKey(event.session_id, event.prompt_id);
    const existingAggregate = promptAggregates.get(promptKey);
    const aggregate =
      existingAggregate instanceof Object
        ? existingAggregate
        : createEmptyPromptAggregate(event, eventTimestamp);

    if (eventTimestamp < aggregate.earliestTimestamp) {
      aggregate.earliestTimestamp = eventTimestamp;
    }

    if (eventTimestamp > aggregate.latestTimestamp) {
      aggregate.latestTimestamp = eventTimestamp;
    }

    if (event.event_type === 'prompt.started') {
      aggregate.promptStartedAt = eventTimestamp;
    }

    if (event.event_type === 'prompt.finished') {
      aggregate.promptFinishedAt = eventTimestamp;
    }

    if (event.event_type === 'api.request') {
      aggregate.apiRequestCount += 1;
      aggregate.totalInputTokens = incrementNumber(aggregate.totalInputTokens, event.input_tokens);
      aggregate.totalOutputTokens = incrementNumber(aggregate.totalOutputTokens, event.output_tokens);
      aggregate.totalCacheReadTokens = incrementNumber(
        aggregate.totalCacheReadTokens,
        event.cache_read_input_tokens
      );
      aggregate.totalCacheCreationTokens = incrementNumber(
        aggregate.totalCacheCreationTokens,
        event.cache_creation_input_tokens
      );
      aggregate.totalCostUsd = incrementNumber(aggregate.totalCostUsd, event.total_cost_usd);
    }

    if (event.event_type === 'tool.executed') {
      aggregate.toolCallCount += 1;
    }

    if (event.success === false || event.had_error === true) {
      aggregate.hadError = true;
    }

    promptAggregates.set(promptKey, aggregate);
  }

  const promptFacts = Array.from(promptAggregates.entries()).map(([promptKey, aggregate]) => {
    const promptStartedAt =
      aggregate.promptStartedAt instanceof Date ? aggregate.promptStartedAt : aggregate.earliestTimestamp;
    const promptFinishedAt =
      aggregate.promptFinishedAt instanceof Date ? aggregate.promptFinishedAt : aggregate.latestTimestamp;
    const totalDurationMs = calculatePromptDurationMilliseconds(
      aggregate,
      promptStartedAt,
      promptFinishedAt
    );
    const promptKeyParts = promptKey.split('\u0000');
    const promptId = promptKeyParts[1];

    if (typeof promptId !== 'string') {
      throw new Error(`Invalid prompt key: ${promptKey}`);
    }

    return {
      id: randomUUID(),
      sessionId: aggregate.sessionId,
      promptId,
      promptStartedAt,
      promptFinishedAt,
      apiRequestCount: aggregate.apiRequestCount,
      toolCallCount: aggregate.toolCallCount,
      totalInputTokens: aggregate.totalInputTokens,
      totalOutputTokens: aggregate.totalOutputTokens,
      totalCacheReadTokens: aggregate.totalCacheReadTokens,
      totalCacheCreationTokens: aggregate.totalCacheCreationTokens,
      totalCostUsd: Number(aggregate.totalCostUsd.toFixed(6)),
      totalDurationMs,
      hadError: aggregate.hadError,
      idleGapBeforeMs: null,
      cacheEfficiencyScore: calculateCacheEfficiencyScore(
        aggregate.totalCacheReadTokens,
        aggregate.totalCacheCreationTokens
      )
    };
  });

  const sessionGroups = new Map<string, DerivedPromptFactInsert[]>();

  for (const promptFact of promptFacts) {
    const existingFacts = sessionGroups.get(promptFact.sessionId);

    if (existingFacts instanceof Array) {
      existingFacts.push(promptFact);
      continue;
    }

    sessionGroups.set(promptFact.sessionId, [promptFact]);
  }

  for (const sessionFacts of sessionGroups.values()) {
    sessionFacts.sort((leftFact, rightFact) => {
      return leftFact.promptStartedAt.getTime() - rightFact.promptStartedAt.getTime();
    });

    let previousPromptFinishedAt: Date | null = null;

    for (const sessionFact of sessionFacts) {
      if (previousPromptFinishedAt instanceof Date) {
        sessionFact.idleGapBeforeMs = Math.max(
          0,
          sessionFact.promptStartedAt.getTime() - previousPromptFinishedAt.getTime()
        );
      }

      previousPromptFinishedAt = sessionFact.promptFinishedAt;
    }
  }

  return promptFacts.sort((leftFact, rightFact) => {
    return leftFact.promptStartedAt.getTime() - rightFact.promptStartedAt.getTime();
  });
}
