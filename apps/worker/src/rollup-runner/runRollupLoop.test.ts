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
        level: 'info',
        message: 'collector heartbeat'
      }
    ]);

    expect(parsedEvents).toEqual([
      {
        timestamp: '2026-04-19T00:00:00.000Z',
        event_type: 'prompt.started',
        session_id: 'session-alpha',
        prompt_id: 'prompt-1'
      }
    ]);
    expect(warnSpy).toHaveBeenCalledWith('worker: skipped 1 non-usage JSON log events from Loki');
  });
});
