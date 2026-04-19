import { rawUsageEventSchema } from '@usage-observer/domain';
import type { RawUsageEvent } from '@usage-observer/domain';
import { z } from 'zod';

const rawRecordSchema = z.record(z.string(), z.unknown());
const rawTimestampSchema = z.string().datetime({
  offset: true
});

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];

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

  return null;
}

function readBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];

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

  return null;
}

function normalizeTimestamp(record: Record<string, unknown>): string | null {
  const rawTimestamp = readString(record, [
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
      return 'prompt.started';
    case 'prompt.finished':
      return 'prompt.finished';
    case 'api.request':
    case 'claude_code.api_request':
    case 'claude_code.api_error':
      return 'api.request';
    case 'tool.executed':
    case 'claude_code.tool_result':
      return 'tool.executed';
    default:
      return null;
  }
}

function inferSuccess(record: Record<string, unknown>, rawEventName: string): boolean | null {
  const explicitSuccess = readBoolean(record, ['success']);

  if (explicitSuccess !== null) {
    return explicitSuccess;
  }

  if (rawEventName === 'claude_code.api_error') {
    return false;
  }

  return null;
}

function inferHadError(record: Record<string, unknown>, rawEventName: string): boolean | null {
  const explicitHadError = readBoolean(record, ['had_error', 'hadError']);

  if (explicitHadError !== null) {
    return explicitHadError;
  }

  if (rawEventName === 'claude_code.api_error') {
    return true;
  }

  return null;
}

export function normalizeRawUsageEvent(rawEvent: unknown): RawUsageEvent | null {
  const directlyParsedEvent = rawUsageEventSchema.safeParse(rawEvent);

  if (directlyParsedEvent.success) {
    return directlyParsedEvent.data;
  }

  const parsedRecord = rawRecordSchema.safeParse(rawEvent);

  if (parsedRecord.success === false) {
    return null;
  }

  const record = parsedRecord.data;
  const rawEventName = readString(record, [
    'event_type',
    'event_name',
    'event.name',
    'attributes_event_name',
    'name',
    'body'
  ]);
  const normalizedEventName = typeof rawEventName === 'string' ? rawEventName : null;
  const eventType = normalizedEventName !== null ? normalizeEventType(normalizedEventName) : null;
  const timestamp = normalizeTimestamp(record);
  const sessionId = readString(record, [
    'session_id',
    'session.id',
    'sessionId',
    'attributes_session_id',
    'resources_session_id'
  ]);

  if (normalizedEventName === null || eventType === null || timestamp === null || sessionId === null) {
    return null;
  }

  const normalizedCandidate = {
    timestamp,
    event_type: eventType,
    session_id: sessionId,
    prompt_id: readString(record, ['prompt_id', 'prompt.id', 'promptId', 'attributes_prompt_id']),
    trace_id: readString(record, ['trace_id', 'trace.id']),
    span_id: readString(record, ['span_id', 'span.id']),
    project_id: readString(record, ['project_id', 'project.id']),
    project_root: readString(record, ['project_root']),
    transcript_path: readString(record, ['transcript_path']),
    model_name: readString(record, ['model_name', 'model', 'model.id', 'attributes_model']),
    tool_name: readString(record, [
      'tool_name',
      'tool_name_normalized',
      'tool',
      'tool.name',
      'attributes_tool_name'
    ]),
    mcp_server_name: readString(record, ['mcp_server_name']),
    source_type: readString(record, ['source_type', 'source', 'attributes_source']) ?? 'claude_code',
    input_tokens: readNumber(record, ['input_tokens', 'attributes_input_tokens']),
    output_tokens: readNumber(record, ['output_tokens', 'attributes_output_tokens']),
    cache_read_input_tokens: readNumber(record, [
      'cache_read_input_tokens',
      'cache_read_tokens',
      'attributes_cache_read_tokens'
    ]),
    cache_creation_input_tokens: readNumber(record, [
      'cache_creation_input_tokens',
      'cache_creation_tokens',
      'attributes_cache_creation_tokens'
    ]),
    total_cost_usd: readNumber(record, ['total_cost_usd', 'cost_usd', 'attributes_cost_usd']),
    duration_ms: readNumber(record, ['duration_ms', 'attributes_duration_ms']),
    result_size_bytes: readNumber(record, ['result_size_bytes', 'attributes_result_size_bytes']),
    success: inferSuccess(record, normalizedEventName),
    had_error: inferHadError(record, normalizedEventName)
  };
  const normalizedEvent = rawUsageEventSchema.safeParse(normalizedCandidate);

  if (normalizedEvent.success === false) {
    return null;
  }

  return normalizedEvent.data;
}
