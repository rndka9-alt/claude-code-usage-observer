import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { normalizeRawStatusline } from './normalizeRawStatusline.js';

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const fixturePath = new URL(relativePath, import.meta.url);
  const fixtureContents = await readFile(fixturePath, 'utf8');
  const parsedFixture: unknown = JSON.parse(fixtureContents);
  return parsedFixture;
}

describe('normalizeRawStatusline', () => {
  it('normalizes real Claude Code statusline JSON into ingest payload', async () => {
    const rawStatusline = await readJsonFixture(
      '../../../../fixtures/statusline/sample-statusline.json'
    );
    const payload = normalizeRawStatusline(
      rawStatusline,
      new Date('2026-04-19T00:00:00.000Z')
    );

    expect(payload.session_id).toBe('session-alpha');
    expect(payload.model_name).toBe('Sonnet 4.6 (1M context)');
    expect(payload.total_input_tokens).toBe(12000);
    expect(payload.total_output_tokens).toBe(2300);
    expect(payload.current_input_tokens).toBe(800);
    expect(payload.current_output_tokens).toBe(120);
    expect(payload.cache_creation_input_tokens).toBe(500);
    expect(payload.cache_read_input_tokens).toBe(1400);
    expect(payload.total_cost_usd).toBe(1.234567);
    expect(payload.used_percentage).toBe(42.5);
    expect(payload.five_hour_used_percent).toBe(15.5);
    expect(payload.seven_day_used_percent).toBe(4.2);
    expect(payload.duration_ms).toBe(190000);
    expect(payload.source).toBe('statusline');
  });

  it('uses capturedAt when no timestamp field is present', async () => {
    const payload = normalizeRawStatusline(
      { session_id: 'test-session' },
      new Date('2026-04-19T12:00:00.000Z')
    );

    expect(payload.timestamp).toBe('2026-04-19T12:00:00.000Z');
  });

  it('tolerates unknown fields without failing', async () => {
    const payload = normalizeRawStatusline(
      {
        session_id: 'test-session',
        vim: { mode: 'INSERT' },
        exceeds_200k_tokens: false,
        some_future_field: 'whatever'
      },
      new Date('2026-04-19T12:00:00.000Z')
    );

    expect(payload.session_id).toBe('test-session');
  });
});
