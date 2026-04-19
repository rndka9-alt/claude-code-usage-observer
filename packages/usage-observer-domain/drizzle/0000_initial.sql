CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  project_id text,
  project_root text,
  git_branch text,
  transcript_path text,
  model_name text,
  source text NOT NULL,
  CONSTRAINT sessions_session_id_unique UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS sessions_last_seen_at_index
  ON sessions (last_seen_at);

CREATE TABLE IF NOT EXISTS session_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  cwd text,
  pwd text,
  used_percentage numeric(5, 2),
  total_input_tokens bigint,
  total_output_tokens bigint,
  current_input_tokens bigint,
  current_output_tokens bigint,
  cache_creation_input_tokens bigint,
  cache_read_input_tokens bigint,
  total_cost_usd numeric(12, 6),
  duration_ms bigint,
  five_hour_used_percent numeric(5, 2),
  seven_day_used_percent numeric(5, 2),
  CONSTRAINT session_snapshots_session_id_captured_at_unique UNIQUE (session_id, captured_at)
);

CREATE INDEX IF NOT EXISTS session_snapshots_session_id_captured_at_index
  ON session_snapshots (session_id, captured_at);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  contributor_type text NOT NULL,
  contributor_name text NOT NULL,
  contributor_scope text NOT NULL,
  contributor_hash text NOT NULL,
  file_path text,
  file_size_bytes bigint,
  line_count integer,
  enabled boolean NOT NULL,
  metadata_json jsonb NOT NULL,
  CONSTRAINT context_snapshots_session_id_captured_at_contributor_unique UNIQUE (
    session_id,
    captured_at,
    contributor_type,
    contributor_name,
    contributor_hash
  )
);

CREATE INDEX IF NOT EXISTS context_snapshots_session_id_captured_at_index
  ON context_snapshots (session_id, captured_at);

CREATE INDEX IF NOT EXISTS context_snapshots_contributor_lookup_index
  ON context_snapshots (contributor_type, contributor_name, captured_at);

CREATE INDEX IF NOT EXISTS context_snapshots_metadata_json_gin_index
  ON context_snapshots USING gin (metadata_json);

CREATE TABLE IF NOT EXISTS derived_prompt_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  prompt_id text NOT NULL,
  prompt_started_at timestamptz NOT NULL,
  prompt_finished_at timestamptz NOT NULL,
  api_request_count integer NOT NULL,
  tool_call_count integer NOT NULL,
  total_input_tokens bigint NOT NULL,
  total_output_tokens bigint NOT NULL,
  total_cache_read_tokens bigint NOT NULL,
  total_cache_creation_tokens bigint NOT NULL,
  total_cost_usd numeric(12, 6) NOT NULL,
  total_duration_ms bigint NOT NULL,
  had_error boolean NOT NULL,
  idle_gap_before_ms bigint,
  cache_efficiency_score numeric(8, 4),
  CONSTRAINT derived_prompt_facts_session_id_prompt_id_unique UNIQUE (session_id, prompt_id)
);

CREATE INDEX IF NOT EXISTS derived_prompt_facts_prompt_started_at_index
  ON derived_prompt_facts (prompt_started_at);

CREATE INDEX IF NOT EXISTS derived_prompt_facts_total_cost_usd_index
  ON derived_prompt_facts (total_cost_usd);

CREATE TABLE IF NOT EXISTS derived_tool_impact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_bucket date NOT NULL,
  tool_name text NOT NULL,
  prompt_count integer NOT NULL,
  avg_prompt_cost_usd numeric(12, 6) NOT NULL,
  avg_prompt_input_tokens numeric(14, 2) NOT NULL,
  avg_prompt_output_tokens numeric(14, 2) NOT NULL,
  avg_tool_duration_ms numeric(14, 2) NOT NULL,
  avg_tool_result_size_bytes numeric(14, 2) NOT NULL,
  error_rate numeric(8, 4) NOT NULL,
  CONSTRAINT derived_tool_impact_date_bucket_tool_name_unique UNIQUE (date_bucket, tool_name)
);

CREATE INDEX IF NOT EXISTS derived_tool_impact_date_bucket_index
  ON derived_tool_impact (date_bucket);

CREATE TABLE IF NOT EXISTS derived_contributor_impact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_bucket date NOT NULL,
  contributor_type text NOT NULL,
  contributor_name text NOT NULL,
  session_count integer NOT NULL,
  prompt_count integer NOT NULL,
  avg_prompt_cost_usd numeric(12, 6) NOT NULL,
  avg_prompt_input_tokens numeric(14, 2) NOT NULL,
  avg_prompt_output_tokens numeric(14, 2) NOT NULL,
  cache_hit_rate numeric(8, 4) NOT NULL,
  notes text NOT NULL,
  CONSTRAINT derived_contributor_impact_date_bucket_contributor_unique UNIQUE (
    date_bucket,
    contributor_type,
    contributor_name
  )
);

CREATE INDEX IF NOT EXISTS derived_contributor_impact_contributor_date_index
  ON derived_contributor_impact (contributor_type, contributor_name, date_bucket);
