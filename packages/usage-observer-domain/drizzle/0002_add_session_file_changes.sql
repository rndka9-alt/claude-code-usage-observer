CREATE TABLE IF NOT EXISTS session_file_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  version integer NOT NULL,
  backup_time timestamptz NOT NULL,
  CONSTRAINT session_file_changes_session_id_file_path_unique UNIQUE (session_id, file_path)
);

CREATE INDEX IF NOT EXISTS session_file_changes_session_id_index
  ON session_file_changes (session_id);
