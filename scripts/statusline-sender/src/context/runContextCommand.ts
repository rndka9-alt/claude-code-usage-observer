import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

import type { ContextSnapshotsPayload } from '@usage-observer/domain';

type ContextCommandInput = {
  autoMemoryEnabled: boolean;
  autoMemoryPath: string | null;
  capturedAt: Date;
  claudeMdPaths: string[];
  gitBranch: string | null;
  mcpServers: string[];
  modelName: string | null;
  observedMcpServers: string[];
  outputStyle: string | null;
  projectRoot: string | null;
  rulePaths: string[];
  sessionId: string;
  skillNames: string[];
  transcriptPath: string | null;
};

type ContextContributor = ContextSnapshotsPayload['contributors'][number];

function createDeterministicHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (value instanceof Object) {
    const keys = Object.keys(value).sort();
    const keyValuePairs = keys.map((key) => {
      const objectValue = Reflect.get(value, key);
      return `${JSON.stringify(key)}:${stableSerialize(objectValue)}`;
    });

    return `{${keyValuePairs.join(',')}}`;
  }

  return JSON.stringify(value);
}

async function collectFileContributor(input: {
  contributorName: string;
  contributorScope: string;
  contributorType: string;
  filePath: string;
  metadataJson: Record<string, unknown>;
}): Promise<ContextContributor> {
  const fileStats = await stat(input.filePath);
  const fileContents = await readFile(input.filePath, 'utf8');
  const lineCount = fileContents.length === 0 ? 0 : fileContents.split(/\r?\n/).length;

  return {
    contributor_type: input.contributorType,
    contributor_name: input.contributorName,
    contributor_scope: input.contributorScope,
    contributor_hash: createDeterministicHash(fileContents),
    file_path: input.filePath,
    file_size_bytes: fileStats.size,
    line_count: lineCount,
    enabled: true,
    metadata_json: input.metadataJson
  };
}

function createMetadataContributor(input: {
  contributorName: string;
  contributorScope: string;
  contributorType: string;
  metadataJson: Record<string, unknown>;
}): ContextContributor {
  const serializedMetadata = stableSerialize(input.metadataJson);

  return {
    contributor_type: input.contributorType,
    contributor_name: input.contributorName,
    contributor_scope: input.contributorScope,
    contributor_hash: createDeterministicHash(serializedMetadata),
    file_path: null,
    file_size_bytes: null,
    line_count: null,
    enabled: true,
    metadata_json: input.metadataJson
  };
}

export async function runContextCommand(input: ContextCommandInput): Promise<ContextSnapshotsPayload> {
  const contributors: ContextContributor[] = [];

  for (const claudeMdPath of input.claudeMdPaths) {
    contributors.push(
      await collectFileContributor({
        contributorType: 'claude_md',
        contributorName: claudeMdPath,
        contributorScope: 'project',
        filePath: claudeMdPath,
        metadataJson: {
          file_path: claudeMdPath
        }
      })
    );
  }

  for (const rulePath of input.rulePaths) {
    contributors.push(
      await collectFileContributor({
        contributorType: 'rule',
        contributorName: rulePath,
        contributorScope: 'project',
        filePath: rulePath,
        metadataJson: {
          file_path: rulePath
        }
      })
    );
  }

  for (const skillName of input.skillNames) {
    contributors.push(
      createMetadataContributor({
        contributorType: 'skill',
        contributorName: skillName,
        contributorScope: 'session',
        metadataJson: {
          activated_at: input.capturedAt.toISOString(),
          skill_name: skillName
        }
      })
    );
  }

  for (const mcpServerName of input.mcpServers) {
    contributors.push(
      createMetadataContributor({
        contributorType: 'mcp_server',
        contributorName: mcpServerName,
        contributorScope: 'session',
        metadataJson: {
          mode: 'configured',
          mcp_server_name: mcpServerName
        }
      })
    );
  }

  for (const observedMcpServerName of input.observedMcpServers) {
    contributors.push(
      createMetadataContributor({
        contributorType: 'mcp_server',
        contributorName: observedMcpServerName,
        contributorScope: 'session',
        metadataJson: {
          mode: 'observed',
          mcp_server_name: observedMcpServerName
        }
      })
    );
  }

  if (typeof input.outputStyle === 'string') {
    contributors.push(
      createMetadataContributor({
        contributorType: 'output_style',
        contributorName: input.outputStyle,
        contributorScope: 'session',
        metadataJson: {
          output_style: input.outputStyle
        }
      })
    );
  }

  if (input.autoMemoryEnabled) {
    if (typeof input.autoMemoryPath === 'string') {
      contributors.push(
        await collectFileContributor({
          contributorType: 'auto_memory',
          contributorName: input.autoMemoryPath,
          contributorScope: 'session',
          filePath: input.autoMemoryPath,
          metadataJson: {
            auto_memory_enabled: true,
            file_path: input.autoMemoryPath
          }
        })
      );
    } else {
      contributors.push(
        createMetadataContributor({
          contributorType: 'auto_memory',
          contributorName: 'auto-memory',
          contributorScope: 'session',
          metadataJson: {
            auto_memory_enabled: true
          }
        })
      );
    }
  }

  if (typeof input.projectRoot === 'string' || typeof input.gitBranch === 'string') {
    contributors.push(
      createMetadataContributor({
        contributorType: 'project_state',
        contributorName: typeof input.projectRoot === 'string' ? input.projectRoot : 'project-state',
        contributorScope: 'session',
        metadataJson: {
          git_branch: input.gitBranch,
          project_root: input.projectRoot
        }
      })
    );
  }

  return {
    session_id: input.sessionId,
    captured_at: input.capturedAt.toISOString(),
    project_root: input.projectRoot,
    git_branch: input.gitBranch,
    transcript_path: input.transcriptPath,
    model_name: input.modelName,
    source: 'context-snapshot',
    contributors
  };
}
