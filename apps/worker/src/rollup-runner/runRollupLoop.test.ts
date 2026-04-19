import { describe, expect, it, vi } from 'vitest';

import { parseRawUsageEvents } from './runRollupLoop.js';

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
        timestamp: '2026-04-19T00:00:02.000Z',
        event_name: 'claude_code.tool_result',
        session_id: 'session-alpha',
        prompt_id: 'prompt-1',
        tool_name: 'Read',
        duration_ms: 12,
        success: true
      },
      {
        level: 'info',
        message: 'collector heartbeat'
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
    expect(warnSpy).toHaveBeenCalledWith('worker: skipped 1 non-usage JSON log events from Loki');
  });
});
