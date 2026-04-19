import { describe, expect, it } from 'vitest';

import { runContextCommand } from './runContextCommand.js';

describe('runContextCommand', () => {
  it('captures file metadata and non-file contributors without storing raw content', async () => {
    const claudeMdPath = new URL('../../../../fixtures/context/sample-CLAUDE.md', import.meta.url).pathname;
    const rulePath = new URL('../../../../fixtures/context/sample-rule.md', import.meta.url).pathname;
    const payload = await runContextCommand({
      autoMemoryEnabled: true,
      autoMemoryPath: null,
      capturedAt: new Date('2026-04-19T00:00:00.000Z'),
      claudeMdPaths: [claudeMdPath],
      gitBranch: 'main',
      mcpServers: ['filesystem'],
      modelName: 'claude-sonnet-4',
      observedMcpServers: ['github'],
      outputStyle: 'concise',
      projectRoot: '/workspace/project-alpha',
      rulePaths: [rulePath],
      sessionId: 'session-alpha',
      skillNames: ['coding-guidelines'],
      transcriptPath: '/workspace/project-alpha/.claude/transcript.jsonl'
    });

    expect(payload.session_id).toBe('session-alpha');
    expect(payload.contributors.length).toBeGreaterThanOrEqual(6);

    const claudeContributor = payload.contributors.find((contributor) => {
      return contributor.contributor_type === 'claude_md';
    });
    const skillContributor = payload.contributors.find((contributor) => {
      return contributor.contributor_type === 'skill';
    });

    expect(claudeContributor?.file_size_bytes).toBeGreaterThan(0);
    expect(claudeContributor?.metadata_json).not.toHaveProperty('content');
    expect(skillContributor?.contributor_name).toBe('coding-guidelines');
  });
});
