#!/usr/bin/env bash
# Sends a status-line snapshot to ingest-api on every Stop event.
# Receives hook input JSON on stdin with session_id and transcript_path.

set -eu

API_URL="${USAGE_OBSERVER_API_URL:-http://127.0.0.1:20008}"
AUTH_TOKEN="${USAGE_OBSERVER_AUTH_TOKEN:-}"

hook_input=$(cat)

SESSION_ID="$(printf '%s' "$hook_input" | jq -r '.session_id // empty')"
TRANSCRIPT_PATH="$(printf '%s' "$hook_input" | jq -r '.transcript_path // empty')"
CWD="$(printf '%s' "$hook_input" | jq -r '.cwd // empty')"

if [[ -z "$SESSION_ID" ]] || [[ -z "$TRANSCRIPT_PATH" ]] || [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

GIT_BRANCH=""
if [[ -n "$CWD" ]] && [[ -d "$CWD/.git" || -f "$CWD/.git" ]]; then
  GIT_BRANCH="$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi

snapshot=$(python3 - "$TRANSCRIPT_PATH" "$SESSION_ID" "$CWD" "$GIT_BRANCH" <<'PY'
import sys, json, os

transcript_path = sys.argv[1]
session_id = sys.argv[2]
cwd = sys.argv[3]
git_branch = sys.argv[4] if len(sys.argv) > 4 else ""

total_input = 0
total_output = 0
total_cache_read = 0
total_cache_create = 0
model_name = None
last_timestamp = None

with open(transcript_path, "r") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        if entry.get("type") != "assistant":
            continue

        msg = entry.get("message", {})
        usage = msg.get("usage")
        if not usage:
            continue

        total_input += usage.get("input_tokens", 0)
        total_output += usage.get("output_tokens", 0)
        total_cache_read += usage.get("cache_read_input_tokens", 0)
        total_cache_create += usage.get("cache_creation_input_tokens", 0)

        m = msg.get("model")
        if m:
            model_name = m

        ts = entry.get("timestamp")
        if ts:
            last_timestamp = ts

payload = {
    "session_id": session_id,
    "project_root": cwd or None,
    "cwd": cwd or None,
    "git_branch": git_branch or None,
    "transcript_path": transcript_path,
    "model": {"display_name": model_name} if model_name else None,
    "context_window": {
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "current_usage": {
            "cache_creation_input_tokens": total_cache_create,
            "cache_read_input_tokens": total_cache_read,
        },
    },
    "source": "statusline"
}

payload = {k: v for k, v in payload.items() if v is not None}
print(json.dumps(payload))
PY
)

if [[ -z "$snapshot" ]] || [[ "$snapshot" == "null" ]]; then
  exit 0
fi

curl_args=(
  --silent --show-error
  --max-time 5
  -X POST
  -H 'Content-Type: application/json'
)

if [[ -n "$AUTH_TOKEN" ]]; then
  curl_args+=(-H "Authorization: Bearer $AUTH_TOKEN")
fi

printf '%s' "$snapshot" | curl "${curl_args[@]}" \
  --data-binary @- \
  "${API_URL}/v1/statusline-snapshots"
