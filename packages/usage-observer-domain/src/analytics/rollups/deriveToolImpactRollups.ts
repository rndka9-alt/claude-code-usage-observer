import { randomUUID } from 'node:crypto';

import type { InferInsertModel } from 'drizzle-orm';

import { derivedPromptFacts, derivedToolImpact } from '../../database/schema/schema.js';
import { rawUsageEventSchema } from '../types/rawUsageEventSchema.js';

type PromptFactRow = InferInsertModel<typeof derivedPromptFacts>;
type ToolImpactRow = InferInsertModel<typeof derivedToolImpact>;
type RawUsageEvent = ReturnType<typeof rawUsageEventSchema.parse>;

type ToolAggregate = {
  dateBucket: string;
  errorCount: number;
  promptCostTotal: number;
  promptCount: number;
  promptInputTotal: number;
  promptKeys: Set<string>;
  promptOutputTotal: number;
  resultSizeTotal: number;
  toolDurationTotal: number;
  toolEventCount: number;
  toolName: string;
};

function createPromptKey(sessionId: string, promptId: string): string {
  return `${sessionId}\u0000${promptId}`;
}

function createDateBucket(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

function incrementNumber(total: number, value: number | null | undefined): number {
  if (typeof value !== 'number') {
    return total;
  }

  return total + value;
}

function createToolAggregate(toolName: string, dateBucket: string): ToolAggregate {
  return {
    dateBucket,
    errorCount: 0,
    promptCostTotal: 0,
    promptCount: 0,
    promptInputTotal: 0,
    promptKeys: new Set<string>(),
    promptOutputTotal: 0,
    resultSizeTotal: 0,
    toolDurationTotal: 0,
    toolEventCount: 0,
    toolName
  };
}

export function deriveToolImpactRollups(
  promptFacts: PromptFactRow[],
  rawEvents: unknown[]
): ToolImpactRow[] {
  const promptFactsByKey = new Map<string, PromptFactRow>();

  for (const promptFact of promptFacts) {
    const promptKey = createPromptKey(promptFact.sessionId, promptFact.promptId);
    promptFactsByKey.set(promptKey, promptFact);
  }

  const toolAggregates = new Map<string, ToolAggregate>();

  for (const rawEvent of rawEvents) {
    const event: RawUsageEvent = rawUsageEventSchema.parse(rawEvent);

    if (event.event_type !== 'tool.executed') {
      continue;
    }

    if (typeof event.prompt_id !== 'string') {
      continue;
    }

    if (typeof event.tool_name !== 'string') {
      continue;
    }

    const eventTimestamp = new Date(event.timestamp);
    const dateBucket = createDateBucket(eventTimestamp);
    const aggregateKey = `${dateBucket}\u0000${event.tool_name}`;
    const promptKey = createPromptKey(event.session_id, event.prompt_id);
    const promptFact = promptFactsByKey.get(promptKey);
    const existingAggregate = toolAggregates.get(aggregateKey);
    const aggregate =
      existingAggregate instanceof Object
        ? existingAggregate
        : createToolAggregate(event.tool_name, dateBucket);

    aggregate.toolEventCount += 1;
    aggregate.toolDurationTotal = incrementNumber(aggregate.toolDurationTotal, event.duration_ms);
    aggregate.resultSizeTotal = incrementNumber(aggregate.resultSizeTotal, event.result_size_bytes);

    if (event.success === false || event.had_error === true) {
      aggregate.errorCount += 1;
    }

    if (promptFact instanceof Object && aggregate.promptKeys.has(promptKey) === false) {
      aggregate.promptKeys.add(promptKey);
      aggregate.promptCount += 1;
      aggregate.promptCostTotal += promptFact.totalCostUsd;
      aggregate.promptInputTotal += promptFact.totalInputTokens;
      aggregate.promptOutputTotal += promptFact.totalOutputTokens;
    }

    toolAggregates.set(aggregateKey, aggregate);
  }

  return Array.from(toolAggregates.values())
    .map((aggregate) => {
      const promptCount = aggregate.promptCount;
      const toolEventCount = aggregate.toolEventCount;

      return {
        id: randomUUID(),
        dateBucket: aggregate.dateBucket,
        toolName: aggregate.toolName,
        promptCount,
        avgPromptCostUsd:
          promptCount > 0 ? Number((aggregate.promptCostTotal / promptCount).toFixed(6)) : 0,
        avgPromptInputTokens:
          promptCount > 0 ? Number((aggregate.promptInputTotal / promptCount).toFixed(2)) : 0,
        avgPromptOutputTokens:
          promptCount > 0 ? Number((aggregate.promptOutputTotal / promptCount).toFixed(2)) : 0,
        avgToolDurationMs:
          toolEventCount > 0 ? Number((aggregate.toolDurationTotal / toolEventCount).toFixed(2)) : 0,
        avgToolResultSizeBytes:
          toolEventCount > 0 ? Number((aggregate.resultSizeTotal / toolEventCount).toFixed(2)) : 0,
        errorRate: toolEventCount > 0 ? Number((aggregate.errorCount / toolEventCount).toFixed(4)) : 0
      };
    })
    .sort((leftRow, rightRow) => {
      if (leftRow.dateBucket === rightRow.dateBucket) {
        return leftRow.toolName.localeCompare(rightRow.toolName);
      }

      return leftRow.dateBucket.localeCompare(rightRow.dateBucket);
    });
}
