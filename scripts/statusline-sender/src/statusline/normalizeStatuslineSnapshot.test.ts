import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { normalizeStatuslineSnapshot } from './normalizeStatuslineSnapshot.js';

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const fixturePath = new URL(relativePath, import.meta.url);
  const fixtureContents = await readFile(fixturePath, 'utf8');
  const parsedFixture: unknown = JSON.parse(fixtureContents);
  return parsedFixture;
}

describe('normalizeStatuslineSnapshot', () => {
  it('normalizes nested statusline input into ingest payload shape', async () => {
    const rawStatusline = await readJsonFixture('../../../../fixtures/statusline/sample-statusline.json');
    const payload = normalizeStatuslineSnapshot(rawStatusline, new Date('2026-04-19T00:00:00.000Z'));

    expect(payload.session_id).toBe('session-alpha');
    expect(payload.project_id).toBe('project-alpha');
    expect(payload.model_name).toBe('claude-sonnet-4');
    expect(payload.total_input_tokens).toBe(12000);
    expect(payload.current_output_tokens).toBe(120);
    expect(payload.total_cost_usd).toBe(1.234567);
  });
});
