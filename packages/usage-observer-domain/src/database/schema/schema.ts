/*
Data source map
===============

sessions, session_snapshots
  Source: Claude Code statusline JSON (realtime, 30s throttle) + Stop hook transcript parsing
  Ingested via: POST /v1/statusline-snapshots -> normalizeRawStatusline()
  Fields from statusline: cost, rate_limits, context_window, model, cwd, transcript_path
  Fields from Stop hook: transcript-derived token totals (fallback when statusline fields are absent)

context_snapshots
  Source: SessionEnd hook (once per session) + worker Loki event extraction
  Hook contributors: CLAUDE.md files (global/project), .claude/rules/ files, project_state, MCP servers (from transcript mcp__ tool names)
  Loki contributors: skill_activated events, mcp_server_connection events
  contributorType values: claude_md, rule, project_state, skill, mcp_server

derived_prompt_facts
  Source: Loki OTEL events (api_request, user_prompt, tool_result)
  Derived by: worker -> derivePromptFacts() every 5min, full reindex from 7d window
  Groups api_request/tool_result events by (session_id, prompt_id)

derived_tool_impact
  Source: derived_prompt_facts + Loki tool_result events
  Derived by: worker -> toolImpactPipeline, date-bucketed replace

derived_contributor_impact
  Source: derived_prompt_facts + context_snapshots (DB + Loki-synthesized)
  Derived by: worker -> contributorImpactPipeline, date-bucketed replace
  Correlation only: matches prompt to the latest context snapshot before prompt start
*/

import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: text('session_id').notNull(),
    firstSeenAt: timestamp('first_seen_at', {
      withTimezone: true
    }).notNull(),
    lastSeenAt: timestamp('last_seen_at', {
      withTimezone: true
    }).notNull(),
    projectId: text('project_id'),
    projectRoot: text('project_root'),
    gitBranch: text('git_branch'),
    transcriptPath: text('transcript_path'),
    modelName: text('model_name'),
    source: text('source').notNull()
  },
  (table) => {
    return {
      sessionIdUnique: unique('sessions_session_id_unique').on(table.sessionId),
      lastSeenAtIndex: index('sessions_last_seen_at_index').on(table.lastSeenAt)
    };
  }
);

export const sessionSnapshots = pgTable(
  'session_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: text('session_id').notNull(),
    capturedAt: timestamp('captured_at', {
      withTimezone: true
    }).notNull(),
    cwd: text('cwd'),
    pwd: text('pwd'),
    usedPercentage: numeric('used_percentage', {
      precision: 5,
      scale: 2,
      mode: 'number'
    }),
    totalInputTokens: bigint('total_input_tokens', {
      mode: 'number'
    }),
    totalOutputTokens: bigint('total_output_tokens', {
      mode: 'number'
    }),
    currentInputTokens: bigint('current_input_tokens', {
      mode: 'number'
    }),
    currentOutputTokens: bigint('current_output_tokens', {
      mode: 'number'
    }),
    cacheCreationInputTokens: bigint('cache_creation_input_tokens', {
      mode: 'number'
    }),
    cacheReadInputTokens: bigint('cache_read_input_tokens', {
      mode: 'number'
    }),
    totalCostUsd: numeric('total_cost_usd', {
      precision: 12,
      scale: 6,
      mode: 'number'
    }),
    durationMs: bigint('duration_ms', {
      mode: 'number'
    }),
    fiveHourUsedPercent: numeric('five_hour_used_percent', {
      precision: 5,
      scale: 2,
      mode: 'number'
    }),
    sevenDayUsedPercent: numeric('seven_day_used_percent', {
      precision: 5,
      scale: 2,
      mode: 'number'
    })
  },
  (table) => {
    return {
      sessionSnapshotUnique: unique('session_snapshots_session_id_captured_at_unique').on(
        table.sessionId,
        table.capturedAt
      ),
      sessionCapturedAtIndex: index('session_snapshots_session_id_captured_at_index').on(
        table.sessionId,
        table.capturedAt
      )
    };
  }
);

export const contextSnapshots = pgTable(
  'context_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: text('session_id').notNull(),
    capturedAt: timestamp('captured_at', {
      withTimezone: true
    }).notNull(),
    contributorType: text('contributor_type').notNull(),
    contributorName: text('contributor_name').notNull(),
    contributorScope: text('contributor_scope').notNull(),
    contributorHash: text('contributor_hash').notNull(),
    filePath: text('file_path'),
    fileSizeBytes: bigint('file_size_bytes', {
      mode: 'number'
    }),
    lineCount: integer('line_count'),
    enabled: boolean('enabled').notNull(),
    metadataJson: jsonb('metadata_json').notNull()
  },
  (table) => {
    return {
      contributorSnapshotUnique: unique(
        'context_snapshots_session_id_captured_at_contributor_unique'
      ).on(
        table.sessionId,
        table.capturedAt,
        table.contributorType,
        table.contributorName,
        table.contributorHash
      ),
      sessionCapturedAtIndex: index('context_snapshots_session_id_captured_at_index').on(
        table.sessionId,
        table.capturedAt
      ),
      contributorLookupIndex: index('context_snapshots_contributor_lookup_index').on(
        table.contributorType,
        table.contributorName,
        table.capturedAt
      )
    };
  }
);

export const derivedPromptFacts = pgTable(
  'derived_prompt_facts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: text('session_id').notNull(),
    promptId: text('prompt_id').notNull(),
    promptStartedAt: timestamp('prompt_started_at', {
      withTimezone: true
    }).notNull(),
    promptFinishedAt: timestamp('prompt_finished_at', {
      withTimezone: true
    }).notNull(),
    apiRequestCount: integer('api_request_count').notNull(),
    toolCallCount: integer('tool_call_count').notNull(),
    totalInputTokens: bigint('total_input_tokens', {
      mode: 'number'
    }).notNull(),
    totalOutputTokens: bigint('total_output_tokens', {
      mode: 'number'
    }).notNull(),
    totalCacheReadTokens: bigint('total_cache_read_tokens', {
      mode: 'number'
    }).notNull(),
    totalCacheCreationTokens: bigint('total_cache_creation_tokens', {
      mode: 'number'
    }).notNull(),
    totalCostUsd: numeric('total_cost_usd', {
      precision: 12,
      scale: 6,
      mode: 'number'
    }).notNull(),
    totalDurationMs: bigint('total_duration_ms', {
      mode: 'number'
    }).notNull(),
    hadError: boolean('had_error').notNull(),
    idleGapBeforeMs: bigint('idle_gap_before_ms', {
      mode: 'number'
    }),
    cacheEfficiencyScore: numeric('cache_efficiency_score', {
      precision: 8,
      scale: 4,
      mode: 'number'
    })
  },
  (table) => {
    return {
      promptFactUnique: unique('derived_prompt_facts_session_id_prompt_id_unique').on(
        table.sessionId,
        table.promptId
      ),
      promptStartedAtIndex: index('derived_prompt_facts_prompt_started_at_index').on(
        table.promptStartedAt
      ),
      promptCostIndex: index('derived_prompt_facts_total_cost_usd_index').on(table.totalCostUsd)
    };
  }
);

export const derivedToolImpact = pgTable(
  'derived_tool_impact',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dateBucket: date('date_bucket').notNull(),
    toolName: text('tool_name').notNull(),
    promptCount: integer('prompt_count').notNull(),
    avgPromptCostUsd: numeric('avg_prompt_cost_usd', {
      precision: 12,
      scale: 6,
      mode: 'number'
    }).notNull(),
    avgPromptInputTokens: numeric('avg_prompt_input_tokens', {
      precision: 14,
      scale: 2,
      mode: 'number'
    }).notNull(),
    avgPromptOutputTokens: numeric('avg_prompt_output_tokens', {
      precision: 14,
      scale: 2,
      mode: 'number'
    }).notNull(),
    avgToolDurationMs: numeric('avg_tool_duration_ms', {
      precision: 14,
      scale: 2,
      mode: 'number'
    }).notNull(),
    avgToolResultSizeBytes: numeric('avg_tool_result_size_bytes', {
      precision: 14,
      scale: 2,
      mode: 'number'
    }).notNull(),
    errorRate: numeric('error_rate', {
      precision: 8,
      scale: 4,
      mode: 'number'
    }).notNull()
  },
  (table) => {
    return {
      toolImpactUnique: unique('derived_tool_impact_date_bucket_tool_name_unique').on(
        table.dateBucket,
        table.toolName
      ),
      dateBucketIndex: index('derived_tool_impact_date_bucket_index').on(table.dateBucket)
    };
  }
);

export const derivedContributorImpact = pgTable(
  'derived_contributor_impact',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dateBucket: date('date_bucket').notNull(),
    contributorType: text('contributor_type').notNull(),
    contributorName: text('contributor_name').notNull(),
    sessionCount: integer('session_count').notNull(),
    promptCount: integer('prompt_count').notNull(),
    avgPromptCostUsd: numeric('avg_prompt_cost_usd', {
      precision: 12,
      scale: 6,
      mode: 'number'
    }).notNull(),
    avgPromptInputTokens: numeric('avg_prompt_input_tokens', {
      precision: 14,
      scale: 2,
      mode: 'number'
    }).notNull(),
    avgPromptOutputTokens: numeric('avg_prompt_output_tokens', {
      precision: 14,
      scale: 2,
      mode: 'number'
    }).notNull(),
    cacheHitRate: numeric('cache_hit_rate', {
      precision: 8,
      scale: 4,
      mode: 'number'
    }).notNull(),
    notes: text('notes').notNull()
  },
  (table) => {
    return {
      contributorImpactUnique: unique(
        'derived_contributor_impact_date_bucket_contributor_unique'
      ).on(table.dateBucket, table.contributorType, table.contributorName),
      contributorDateIndex: index('derived_contributor_impact_contributor_date_index').on(
        table.contributorType,
        table.contributorName,
        table.dateBucket
      )
    };
  }
);
