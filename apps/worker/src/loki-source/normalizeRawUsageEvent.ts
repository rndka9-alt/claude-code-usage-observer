import { rawUsageEventSchema } from '@usage-observer/domain';
import type { RawUsageEvent } from '@usage-observer/domain';
import { z } from 'zod';

const rawRecordSchema = z.record(z.string(), z.unknown());
const rawTimestampSchema = z.string().datetime({
  offset: true
});
const knownRootKeys = new Set([
  'attributes',
  'body',
  'event.name',
  'event_name',
  'event_type',
  'name',
  'observed_timestamp',
  'resources',
  'time',
  'timestamp'
]);
const knownAttributeKeys = new Set([
  'attributes_cache_creation_tokens',
  'attributes_cache_read_tokens',
  'attributes_cost_usd',
  'attributes_duration_ms',
  'attributes_event_name',
  'attributes_input_tokens',
  'attributes_model',
  'attributes_output_tokens',
  'attributes_prompt_id',
  'attributes_result_size_bytes',
  'attributes_session_id',
  'attributes_source',
  'attributes_tool_name',
  'cache_creation_input_tokens',
  'cache_creation_tokens',
  'cache_read_input_tokens',
  'cache_read_tokens',
  'cost_usd',
  'duration_ms',
  'event.name',
  'event.timestamp',
  'event_name',
  'event_timestamp',
  'had_error',
  'hadError',
  'input_tokens',
  'mcp_server_name',
  'model',
  'model.id',
  'model_name',
  'output_tokens',
  'project.id',
  'project_id',
  'project_root',
  'prompt.id',
  'promptId',
  'prompt_id',
  'result_size_bytes',
  'session.id',
  'sessionId',
  'session_id',
  'source',
  'source_type',
  'span.id',
  'span_id',
  'success',
  'timestamp',
  'tool',
  'tool.name',
  'tool_name',
  'tool_name_normalized',
  'tool_result_size_bytes',
  'trace.id',
  'trace_id',
  'transcript_path'
]);
const knownResourceKeys = new Set([
  'host.arch',
  'os.type',
  'os.version',
  'service.name',
  'service.version'
]);

export type RawUsageEventNormalizationDiagnostic = {
  attributeKeys: string[];
  missingFields: string[];
  rawEventName: string | null;
  reason: 'non_object' | 'unknown_event_name' | 'missing_required_fields' | 'schema_validation_failed';
  resourceKeys: string[];
  rootKeys: string[];
  unknownAttributeKeys: string[];
  unknownResourceKeys: string[];
  unknownRootKeys: string[];
};

export type RawUsageEventNormalizationResult =
  | {
      diagnostic: null;
      event: RawUsageEvent;
    }
  | {
      diagnostic: RawUsageEventNormalizationDiagnostic;
      event: null;
    };

function collectCandidateRecords(rootRecord: Record<string, unknown>): Record<string, unknown>[] {
  const candidateRecords: Record<string, unknown>[] = [rootRecord];

  for (const nestedKey of ['attributes', 'resources']) {
    const nestedRecord = rawRecordSchema.safeParse(rootRecord[nestedKey]);

    if (nestedRecord.success) {
      candidateRecords.push(nestedRecord.data);
    }
  }

  return candidateRecords;
}

function listRecordKeys(record: Record<string, unknown> | null): string[] {
  if (record === null) {
    return [];
  }

  return Object.keys(record).sort((leftKey, rightKey) => {
    return leftKey.localeCompare(rightKey);
  });
}

function listUnknownKeys(record: Record<string, unknown> | null, knownKeys: Set<string>): string[] {
  if (record === null) {
    return [];
  }

  return Object.keys(record)
    .filter((key) => knownKeys.has(key) === false)
    .sort((leftKey, rightKey) => {
      return leftKey.localeCompare(rightKey);
    });
}

function readString(candidateRecords: Record<string, unknown>[], keys: string[]): string | null {
  for (const candidateRecord of candidateRecords) {
    for (const key of keys) {
      const value = candidateRecord[key];

      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function readNumber(candidateRecords: Record<string, unknown>[], keys: string[]): number | null {
  for (const candidateRecord of candidateRecords) {
    for (const key of keys) {
      const value = candidateRecord[key];

      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value;
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        const parsedValue = Number(value);

        if (Number.isFinite(parsedValue) && parsedValue >= 0) {
          return parsedValue;
        }
      }
    }
  }

  return null;
}

function readBoolean(candidateRecords: Record<string, unknown>[], keys: string[]): boolean | null {
  for (const candidateRecord of candidateRecords) {
    for (const key of keys) {
      const value = candidateRecord[key];

      if (typeof value === 'boolean') {
        return value;
      }

      if (value === 'true') {
        return true;
      }

      if (value === 'false') {
        return false;
      }
    }
  }

  return null;
}

function normalizeTimestamp(candidateRecords: Record<string, unknown>[]): string | null {
  const rawTimestamp = readString(candidateRecords, [
    'timestamp',
    'event_timestamp',
    'event.timestamp',
    'time',
    'observed_timestamp'
  ]);

  if (rawTimestamp === null) {
    return null;
  }

  const parsedTimestamp = rawTimestampSchema.safeParse(rawTimestamp);

  if (parsedTimestamp.success === false) {
    return null;
  }

  return parsedTimestamp.data;
}

function normalizeEventType(rawEventName: string): RawUsageEvent['event_type'] | null {
  switch (rawEventName) {
    case 'prompt.started':
    case 'claude_code.user_prompt':
    case 'user_prompt':
      return 'prompt.started';
    case 'prompt.finished':
      return 'prompt.finished';
    case 'api.request':
    case 'claude_code.api_request':
    case 'claude_code.api_error':
    case 'api_request':
    case 'api_error':
      return 'api.request';
    case 'tool.executed':
    case 'claude_code.tool_result':
    case 'tool_result':
      return 'tool.executed';
    default:
      return null;
  }
}

function inferSuccess(candidateRecords: Record<string, unknown>[], rawEventName: string): boolean | null {
  const explicitSuccess = readBoolean(candidateRecords, ['success']);

  if (explicitSuccess !== null) {
    return explicitSuccess;
  }

  if (rawEventName === 'claude_code.api_error') {
    return false;
  }

  return null;
}

function inferHadError(candidateRecords: Record<string, unknown>[], rawEventName: string): boolean | null {
  const explicitHadError = readBoolean(candidateRecords, ['had_error', 'hadError']);

  if (explicitHadError !== null) {
    return explicitHadError;
  }

  if (rawEventName === 'claude_code.api_error') {
    return true;
  }

  return null;
}

function createDiagnostic(input: {
  attributesRecord: Record<string, unknown> | null;
  missingFields?: string[];
  rawEventName: string | null;
  reason: RawUsageEventNormalizationDiagnostic['reason'];
  resourcesRecord: Record<string, unknown> | null;
  rootRecord: Record<string, unknown> | null;
}): RawUsageEventNormalizationDiagnostic {
  const missingFields = input.missingFields instanceof Array ? input.missingFields : [];

  return {
    attributeKeys: listRecordKeys(input.attributesRecord),
    missingFields,
    rawEventName: input.rawEventName,
    reason: input.reason,
    resourceKeys: listRecordKeys(input.resourcesRecord),
    rootKeys: listRecordKeys(input.rootRecord),
    unknownAttributeKeys: listUnknownKeys(input.attributesRecord, knownAttributeKeys),
    unknownResourceKeys: listUnknownKeys(input.resourcesRecord, knownResourceKeys),
    unknownRootKeys: listUnknownKeys(input.rootRecord, knownRootKeys)
  };
}

export function normalizeRawUsageEventWithDiagnostics(rawEvent: unknown): RawUsageEventNormalizationResult {
  const directlyParsedEvent = rawUsageEventSchema.safeParse(rawEvent);

  if (directlyParsedEvent.success) {
    return {
      event: directlyParsedEvent.data,
      diagnostic: null
    };
  }

  const parsedRecord = rawRecordSchema.safeParse(rawEvent);

  if (parsedRecord.success === false) {
    return {
      event: null,
      diagnostic: createDiagnostic({
        attributesRecord: null,
        rawEventName: null,
        reason: 'non_object',
        resourcesRecord: null,
        rootRecord: null
      })
    };
  }

  const record = parsedRecord.data;
  const attributesRecord = rawRecordSchema.safeParse(record.attributes).success
    ? rawRecordSchema.parse(record.attributes)
    : null;
  const resourcesRecord = rawRecordSchema.safeParse(record.resources).success
    ? rawRecordSchema.parse(record.resources)
    : null;
  const candidateRecords = collectCandidateRecords(record);
  const rawEventName = readString(candidateRecords, [
    'body',
    'event_type',
    'event_name',
    'event.name',
    'attributes_event_name',
    'name'
  ]);
  const normalizedEventName = typeof rawEventName === 'string' ? rawEventName : null;
  const eventType = normalizedEventName !== null ? normalizeEventType(normalizedEventName) : null;
  const timestamp = normalizeTimestamp(candidateRecords);
  const sessionId = readString(candidateRecords, [
    'session_id',
    'session.id',
    'sessionId',
    'attributes_session_id',
    'resources_session_id'
  ]);

  if (normalizedEventName === null || eventType === null) {
    return {
      event: null,
      diagnostic: createDiagnostic({
        attributesRecord,
        rawEventName: normalizedEventName,
        reason: 'unknown_event_name',
        resourcesRecord,
        rootRecord: record
      })
    };
  }

  const missingFields: string[] = [];

  if (timestamp === null) {
    missingFields.push('event.timestamp');
  }

  if (sessionId === null) {
    missingFields.push('session.id');
  }

  if (missingFields.length > 0) {
    return {
      event: null,
      diagnostic: createDiagnostic({
        attributesRecord,
        missingFields,
        rawEventName: normalizedEventName,
        reason: 'missing_required_fields',
        resourcesRecord,
        rootRecord: record
      })
    };
  }

  const normalizedCandidate = {
    timestamp,
    event_type: eventType,
    session_id: sessionId,
    prompt_id: readString(candidateRecords, [
      'prompt_id',
      'prompt.id',
      'promptId',
      'attributes_prompt_id'
    ]),
    trace_id: readString(candidateRecords, ['trace_id', 'trace.id']),
    span_id: readString(candidateRecords, ['span_id', 'span.id']),
    project_id: readString(candidateRecords, ['project_id', 'project.id']),
    project_root: readString(candidateRecords, ['project_root']),
    transcript_path: readString(candidateRecords, ['transcript_path']),
    model_name: readString(candidateRecords, ['model_name', 'model', 'model.id', 'attributes_model']),
    tool_name: readString(candidateRecords, [
      'tool_name',
      'tool_name_normalized',
      'tool',
      'tool.name',
      'attributes_tool_name'
    ]),
    mcp_server_name: readString(candidateRecords, ['mcp_server_name']),
    source_type: readString(candidateRecords, ['source_type', 'source', 'attributes_source']) ?? 'claude_code',
    input_tokens: readNumber(candidateRecords, ['input_tokens', 'attributes_input_tokens']),
    output_tokens: readNumber(candidateRecords, ['output_tokens', 'attributes_output_tokens']),
    cache_read_input_tokens: readNumber(candidateRecords, [
      'cache_read_input_tokens',
      'cache_read_tokens',
      'attributes_cache_read_tokens'
    ]),
    cache_creation_input_tokens: readNumber(candidateRecords, [
      'cache_creation_input_tokens',
      'cache_creation_tokens',
      'attributes_cache_creation_tokens'
    ]),
    total_cost_usd: readNumber(candidateRecords, ['total_cost_usd', 'cost_usd', 'attributes_cost_usd']),
    duration_ms: readNumber(candidateRecords, ['duration_ms', 'attributes_duration_ms']),
    result_size_bytes: readNumber(candidateRecords, [
      'result_size_bytes',
      'tool_result_size_bytes',
      'attributes_result_size_bytes'
    ]),
    success: inferSuccess(candidateRecords, normalizedEventName),
    had_error: inferHadError(candidateRecords, normalizedEventName)
  };
  const normalizedEvent = rawUsageEventSchema.safeParse(normalizedCandidate);

  if (normalizedEvent.success === false) {
    return {
      event: null,
      diagnostic: createDiagnostic({
        attributesRecord,
        rawEventName: normalizedEventName,
        reason: 'schema_validation_failed',
        resourcesRecord,
        rootRecord: record
      })
    };
  }

  return {
    event: normalizedEvent.data,
    diagnostic: null
  };
}

export function normalizeRawUsageEvent(rawEvent: unknown): RawUsageEvent | null {
  const normalizedResult = normalizeRawUsageEventWithDiagnostics(rawEvent);

  return normalizedResult.event;
}
