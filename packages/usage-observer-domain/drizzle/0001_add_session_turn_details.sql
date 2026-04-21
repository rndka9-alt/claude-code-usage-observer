CREATE TABLE IF NOT EXISTS session_turn_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  turn_index integer NOT NULL,
  timestamp timestamptz NOT NULL,
  model_name text,
  stop_reason text,
  has_thinking boolean NOT NULL,
  service_tier text,
  speed text,
  input_tokens bigint,
  output_tokens bigint,
  cache_creation_input_tokens bigint,
  cache_read_input_tokens bigint,
  cache_creation_ephemeral_1h_tokens bigint,
  cache_creation_ephemeral_5m_tokens bigint,
  tool_use_count integer NOT NULL,
  tool_names jsonb NOT NULL,
  CONSTRAINT session_turn_details_session_id_turn_index_unique UNIQUE (session_id, turn_index)
);

CREATE INDEX IF NOT EXISTS session_turn_details_session_id_timestamp_index
  ON session_turn_details (session_id, timestamp);
