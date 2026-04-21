#!/usr/bin/env bash
# Wraps the user's original statusline command and tees data to ingest-api.
# Throttles API calls to avoid flooding (max once per THROTTLE_INTERVAL seconds).

set -u

REPO_ROOT="${USAGE_OBSERVER_REPO_ROOT:-}"
API_URL="${USAGE_OBSERVER_API_URL:-http://127.0.0.1:20008}"
AUTH_TOKEN="${USAGE_OBSERVER_AUTH_TOKEN:-}"
ORIGINAL_CMD="${USAGE_OBSERVER_ORIGINAL_STATUSLINE_CMD:-}"
THROTTLE_INTERVAL="${USAGE_OBSERVER_STATUSLINE_THROTTLE_SEC:-30}"
THROTTLE_DIR="/tmp/claude-observer-statusline"

input=$(cat)

forward_to_ingest() {
  local sender="$REPO_ROOT/scripts/statusline-sender/dist/index.js"

  if [[ ! -f "$sender" ]]; then
    return 0
  fi

  mkdir -p "$THROTTLE_DIR"

  local session_id
  session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"

  if [[ -z "$session_id" ]]; then
    return 0
  fi

  local stamp_file="$THROTTLE_DIR/$session_id"
  local now
  now="$(date +%s)"

  if [[ -f "$stamp_file" ]]; then
    local last
    last="$(cat "$stamp_file" 2>/dev/null || echo 0)"
    if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < THROTTLE_INTERVAL )); then
      return 0
    fi
  fi

  printf '%s' "$now" > "$stamp_file"

  export USAGE_OBSERVER_API_URL="$API_URL"
  export USAGE_OBSERVER_AUTH_TOKEN="$AUTH_TOKEN"

  printf '%s' "$input" | node "$sender" statusline >/dev/null 2>&1 &
}

if [[ -n "$REPO_ROOT" ]]; then
  forward_to_ingest
fi

if [[ -n "$ORIGINAL_CMD" ]]; then
  printf '%s' "$input" | eval "$ORIGINAL_CMD"
fi
