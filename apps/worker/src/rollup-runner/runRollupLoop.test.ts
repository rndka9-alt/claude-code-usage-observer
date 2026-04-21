import { describe, expect, it, vi } from 'vitest';

import { parseRawUsageEvents } from './parseRawUsageEvents.js';

describe('parseRawUsageEvents', () => {
  it('keeps valid usage events and skips unrelated JSON logs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const parsedEvents = parseRawUsageEvents([
      {
        timestamp: '2026-04-19T00:00:00.000Z',
        event_type: 'prompt.started',
        session_id: 'session-alpha',
        prompt_id: 'prompt-1'
      },
      {
        body: 'claude_code.tool_result',
        attributes: {
          'event.name': 'tool_result',
          'event.timestamp': '2026-04-19T00:00:02.000Z',
          'session.id': 'session-alpha',
          'prompt.id': 'prompt-1',
          tool_name: 'Read',
          duration_ms: '12',
          success: 'true'
        }
      },
      {
        level: 'info',
        message: 'collector heartbeat'
      },
      {
        body: 'claude_code.tool_decision',
        attributes: {
          'event.name': 'tool_decision',
          'event.timestamp': '2026-04-19T00:00:03.000Z',
          'session.id': 'session-alpha',
          'prompt.id': 'prompt-1',
          tool_name: 'Read',
          decision: 'accept'
        }
      }
    ]);

    expect(parsedEvents).toHaveLength(2);
    expect(parsedEvents[0]).toEqual({
      timestamp: '2026-04-19T00:00:00.000Z',
      event_type: 'prompt.started',
      session_id: 'session-alpha',
      prompt_id: 'prompt-1'
    });
    expect(parsedEvents[1]).toMatchObject({
      timestamp: '2026-04-19T00:00:02.000Z',
      event_type: 'tool.executed',
      session_id: 'session-alpha',
      prompt_id: 'prompt-1',
      tool_name: 'Read',
      source_type: 'claude_code',
      duration_ms: 12,
      success: true
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'worker: skipped 2 non-usage JSON log events from Loki (unknown_event_name x2)'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'worker: unknown Loki event names: claude_code.tool_decision x1'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'worker: unrecognized Loki root fields: level x1, message x1'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'worker: unrecognized Loki attribute fields: decision x1'
    );
  });
});
