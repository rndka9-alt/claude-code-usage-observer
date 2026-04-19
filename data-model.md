# Data Model

## Principles

- All persisted facts have UTC timestamps.
- Snapshot tables are append-only.
- Derived tables are re-computable and keyed by natural grains.
- Raw OTLP signals remain in Prometheus, Loki, and Tempo, not PostgreSQL.
- Unknown values remain nullable instead of inventing precision.

## Core Tables

## `sessions`

One row per logical Claude Code session.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Surrogate primary key |
| `session_id` | `text` | Unique external session id |
| `first_seen_at` | `timestamptz` | First observed timestamp |
| `last_seen_at` | `timestamptz` | Last observed timestamp |
| `project_id` | `text` | Project identifier when emitted |
| `project_root` | `text` | Project root when known |
| `git_branch` | `text` | Current branch when known |
| `transcript_path` | `text` | Transcript path when known |
| `model_name` | `text` | Last observed model name |
| `source` | `text` | Source path such as `statusline` or `context-snapshot` |

Indexes:

- unique `session_id`
- btree on `last_seen_at`

## `session_snapshots`

Append-only status line snapshots for a session timeline.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Surrogate primary key |
| `session_id` | `text` | Foreign-key-like reference to `sessions.session_id` |
| `captured_at` | `timestamptz` | Snapshot capture time |
| `cwd` | `text` | Working directory at capture time |
| `pwd` | `text` | Present working directory when emitted separately |
| `used_percentage` | `numeric(5,2)` | Context window used percentage |
| `total_input_tokens` | `bigint` | Total input tokens |
| `total_output_tokens` | `bigint` | Total output tokens |
| `current_input_tokens` | `bigint` | Current prompt input tokens |
| `current_output_tokens` | `bigint` | Current prompt output tokens |
| `cache_creation_input_tokens` | `bigint` | Cache creation tokens |
| `cache_read_input_tokens` | `bigint` | Cache read tokens |
| `total_cost_usd` | `numeric(12,6)` | Total cost observed at snapshot time |
| `duration_ms` | `bigint` | Session duration snapshot |
| `five_hour_used_percent` | `numeric(5,2)` | Five-hour rate limit usage |
| `seven_day_used_percent` | `numeric(5,2)` | Seven-day rate limit usage |

Indexes:

- unique `(session_id, captured_at)` for idempotent writes
- btree on `(session_id, captured_at desc)`

## `context_snapshots`

Append-only contributor facts. Each row represents one contributor at one capture time.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Surrogate primary key |
| `session_id` | `text` | Reference to `sessions.session_id` |
| `captured_at` | `timestamptz` | Snapshot capture time |
| `contributor_type` | `text` | `claude_md`, `rule`, `skill`, `mcp_server`, `output_style`, `auto_memory`, `project`, etc. |
| `contributor_name` | `text` | Stable human-readable name |
| `contributor_scope` | `text` | Scope such as `session`, `project`, `global` |
| `contributor_hash` | `text` | Deterministic metadata hash |
| `file_path` | `text` | Path when the contributor comes from a file |
| `file_size_bytes` | `bigint` | File size when relevant |
| `line_count` | `integer` | Line count when relevant |
| `enabled` | `boolean` | Active/inactive at capture time |
| `metadata_json` | `jsonb` | Safe metadata only |

Indexes:

- unique `(session_id, captured_at, contributor_type, contributor_name, contributor_hash)`
- btree on `(session_id, captured_at desc)`
- btree on `(contributor_type, contributor_name, captured_at desc)`
- gin on `metadata_json`

## Derived Tables

## `derived_prompt_facts`

Rollup grain: one row per prompt.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Surrogate primary key |
| `session_id` | `text` | Session join key |
| `prompt_id` | `text` | Prompt join key |
| `prompt_started_at` | `timestamptz` | Derived prompt start |
| `prompt_finished_at` | `timestamptz` | Derived prompt finish |
| `api_request_count` | `integer` | Number of API request events |
| `tool_call_count` | `integer` | Number of tool call events |
| `total_input_tokens` | `bigint` | Summed input tokens |
| `total_output_tokens` | `bigint` | Summed output tokens |
| `total_cache_read_tokens` | `bigint` | Summed cache read tokens |
| `total_cache_creation_tokens` | `bigint` | Summed cache creation tokens |
| `total_cost_usd` | `numeric(12,6)` | Summed request cost |
| `total_duration_ms` | `bigint` | Prompt duration |
| `had_error` | `boolean` | Any prompt-level error |
| `idle_gap_before_ms` | `bigint` | Gap from previous prompt finish |
| `cache_efficiency_score` | `numeric(8,4)` | `cache_read / (cache_read + cache_creation)` when derivable |

Indexes:

- unique `(session_id, prompt_id)`
- btree on `prompt_started_at desc`
- btree on `total_cost_usd desc`

## `derived_tool_impact`

Rollup grain: one row per `(date_bucket, tool_name)`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Surrogate primary key |
| `date_bucket` | `date` | UTC day bucket |
| `tool_name` | `text` | Tool identifier |
| `prompt_count` | `integer` | Distinct prompt count |
| `avg_prompt_cost_usd` | `numeric(12,6)` | Mean cost for prompts containing the tool |
| `avg_prompt_input_tokens` | `numeric(14,2)` | Mean prompt input tokens |
| `avg_prompt_output_tokens` | `numeric(14,2)` | Mean prompt output tokens |
| `avg_tool_duration_ms` | `numeric(14,2)` | Mean tool duration |
| `avg_tool_result_size_bytes` | `numeric(14,2)` | Mean result size |
| `error_rate` | `numeric(8,4)` | Fraction of tool events with error |

Indexes:

- unique `(date_bucket, tool_name)`
- btree on `date_bucket desc`

## `derived_contributor_impact`

Rollup grain: one row per `(date_bucket, contributor_type, contributor_name)`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Surrogate primary key |
| `date_bucket` | `date` | UTC day bucket |
| `contributor_type` | `text` | Contributor type |
| `contributor_name` | `text` | Contributor identifier |
| `session_count` | `integer` | Sessions in which the contributor was active |
| `prompt_count` | `integer` | Prompts associated with the contributor |
| `avg_prompt_cost_usd` | `numeric(12,6)` | Mean prompt cost |
| `avg_prompt_input_tokens` | `numeric(14,2)` | Mean prompt input tokens |
| `avg_prompt_output_tokens` | `numeric(14,2)` | Mean prompt output tokens |
| `cache_hit_rate` | `numeric(8,4)` | Fraction of prompts with cache reads |
| `notes` | `text` | Plain explanation that the table is correlational |

Indexes:

- unique `(date_bucket, contributor_type, contributor_name)`
- btree on `(contributor_type, contributor_name, date_bucket desc)`

## Relationship Notes

- `session_snapshots.session_id`, `context_snapshots.session_id`, and `derived_prompt_facts.session_id` all correlate through the same external `session_id`.
- `derived_contributor_impact` is computed by joining prompt facts to the nearest preceding context snapshot rows in the same session.
- Raw `trace_id` and `span_id` are intentionally not duplicated into PostgreSQL because Tempo is the source of truth.

## Idempotency Strategy

- Status line writes use `(session_id, captured_at)` as the natural idempotency key.
- Context snapshot writes use `(session_id, captured_at, contributor_type, contributor_name, contributor_hash)`.
- Derived tables use their natural grains and are fully recomputable.

## Nullable Fields

- Many fields in `session_snapshots` are nullable because the status line payload is not guaranteed to contain every metric.
- `file_path`, `file_size_bytes`, and `line_count` in `context_snapshots` are nullable for non-file contributors.
- `cache_efficiency_score` is nullable when both cache token totals are absent.
