import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { contextSnapshotsPayloadSchema } from '../../index.js';
import { deriveContributorImpactRollups } from './deriveContributorImpactRollups.js';
import { derivePromptFacts } from './derivePromptFacts.js';
import { deriveToolImpactRollups } from './deriveToolImpactRollups.js';

const lokiFixtureSchema = z.object({
  data: z.object({
    result: z.array(
      z.object({
        values: z.array(z.tuple([z.string(), z.string()]))
      })
    )
  })
});

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const fixturePath = new URL(relativePath, import.meta.url);
  const fixtureContents = await readFile(fixturePath, 'utf8');
  const parsedFixture: unknown = JSON.parse(fixtureContents);
  return parsedFixture;
}

function extractRawEvents(lokiFixture: {
  data: {
    result: Array<{
      values: Array<[string, string]>;
    }>;
  };
}): unknown[] {
  const rawEvents: unknown[] = [];

  for (const streamResult of lokiFixture.data.result) {
    for (const valuePair of streamResult.values) {
      const line = valuePair[1];
      rawEvents.push(JSON.parse(line));
    }
  }

  return rawEvents;
}

describe('derive rollups', () => {
  it('derives prompt, tool, and contributor rollups from safe fixtures', async () => {
    const lokiFixture = lokiFixtureSchema.parse(
      await readJsonFixture('../../../../../fixtures/loki/sample-query-range-response.json')
    );
    const contextFixture = await readJsonFixture('../../../../../fixtures/context/sample-context-payload.json');
    const contributorPayload = contextSnapshotsPayloadSchema.parse(contextFixture);
    const rawEvents = extractRawEvents(lokiFixture);
    const promptFacts = derivePromptFacts(rawEvents);
    const toolImpact = deriveToolImpactRollups(promptFacts, rawEvents);
    const contributorSnapshots = contributorPayload.contributors.map((contributor) => {
      return {
        id: randomUUID(),
        sessionId: contributorPayload.session_id,
        capturedAt: new Date(contributorPayload.captured_at),
        contributorType: contributor.contributor_type,
        contributorName: contributor.contributor_name,
        contributorScope: contributor.contributor_scope,
        contributorHash: contributor.contributor_hash,
        filePath: contributor.file_path ?? null,
        fileSizeBytes: contributor.file_size_bytes ?? null,
        lineCount: contributor.line_count ?? null,
        enabled: contributor.enabled,
        metadataJson: contributor.metadata_json
      };
    });
    const contributorImpact = deriveContributorImpactRollups(promptFacts, contributorSnapshots);

    expect(promptFacts).toHaveLength(2);
    expect(promptFacts[0]?.promptId).toBe('prompt-1');
    expect(promptFacts[0]?.idleGapBeforeMs).toBeNull();
    expect(promptFacts[1]?.idleGapBeforeMs).toBe(595000);
    expect(promptFacts[1]?.hadError).toBe(true);

    expect(toolImpact).toHaveLength(2);
    expect(toolImpact[0]?.toolName).toBe('bash.exec');
    expect(toolImpact[0]?.errorRate).toBe(1);

    expect(contributorImpact).toHaveLength(2);
    expect(contributorImpact[0]?.promptCount).toBe(2);
    expect(contributorImpact[0]?.notes).toContain('Correlation only');
  });
});
