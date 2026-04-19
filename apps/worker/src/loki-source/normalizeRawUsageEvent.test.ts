import { describe, expect, it } from 'vitest';

import {
  normalizeRawUsageEvent,
  normalizeRawUsageEventWithDiagnostics
} from './normalizeRawUsageEvent.js';

describe('normalizeRawUsageEvent', () => {
  it('keeps legacy fixture-style events unchanged', () => {
    expect(
      normalizeRawUsageEvent({
        timestamp: '2026-04-19T00:00:00.000Z',
        event_type: 'prompt.started',
        session_id: 'session-alpha',
        prompt_id: 'prompt-1'
      })
    ).toEqual({
      timestamp: '2026-04-19T00:00:00.000Z',
      event_type: 'prompt.started',
      session_id: 'session-alpha',
      prompt_id: 'prompt-1'
    });
  });

  it('maps Claude Code official api request events into normalized usage events', () => {
    const normalizedEvent = normalizeRawUsageEvent({
      body: 'claude_code.api_request',
      attributes: {
        'event.name': 'api_request',
        'event.timestamp': '2026-04-19T00:00:02.000Z',
        'session.id': 'session-alpha',
        'prompt.id': 'prompt-1',
        model: 'claude-sonnet-4',
        cost_usd: '0.42',
        duration_ms: '1800',
        input_tokens: '1000',
        output_tokens: '200',
        cache_read_tokens: '100',
        cache_creation_tokens: '400'
      }
    });

    expect(normalizedEvent).not.toBeNull();
    expect(normalizedEvent).toMatchObject({
      timestamp: '2026-04-19T00:00:02.000Z',
      event_type: 'api.request',
      session_id: 'session-alpha',
      prompt_id: 'prompt-1',
      model_name: 'claude-sonnet-4',
      source_type: 'claude_code',
      total_cost_usd: 0.42,
      duration_ms: 1800,
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 400
    });
  });

  it('maps Claude Code api error events into failed api request usage events', () => {
    const normalizedEvent = normalizeRawUsageEvent({
      body: 'claude_code.api_error',
      attributes: {
        'event.name': 'api_error',
        'event.timestamp': '2026-04-19T00:00:04.000Z',
        'session.id': 'session-alpha',
        'prompt.id': 'prompt-1',
        model: 'claude-sonnet-4',
        duration_ms: '900'
      }
    });

    expect(normalizedEvent).not.toBeNull();
    expect(normalizedEvent).toMatchObject({
      timestamp: '2026-04-19T00:00:04.000Z',
      event_type: 'api.request',
      session_id: 'session-alpha',
      prompt_id: 'prompt-1',
      model_name: 'claude-sonnet-4',
      source_type: 'claude_code',
      duration_ms: 900,
      success: false,
      had_error: true
    });
  });

  it('returns diagnostics for unknown events without exposing raw values', () => {
    const normalizedResult = normalizeRawUsageEventWithDiagnostics({
      body: 'claude_code.tool_decision',
      attributes: {
        'event.name': 'tool_decision',
        'event.timestamp': '2026-04-19T00:00:04.000Z',
        'session.id': 'session-alpha',
        'prompt.id': 'prompt-1',
        tool_name: 'Bash',
        decision: 'accept'
      },
      resources: {
        'service.name': 'claude-code'
      }
    });

    expect(normalizedResult.event).toBeNull();
    expect(normalizedResult.diagnostic).toMatchObject({
      rawEventName: 'claude_code.tool_decision',
      reason: 'unknown_event_name',
      unknownAttributeKeys: ['decision'],
      unknownResourceKeys: []
    });
  });
});
