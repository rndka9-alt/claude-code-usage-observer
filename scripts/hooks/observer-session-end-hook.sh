#!/usr/bin/env bash
# Collects context snapshots (CLAUDE.md, rules, project state) at session end.
# Receives hook input JSON on stdin with session_id, transcript_path, and cwd.

set -eu

API_URL="${USAGE_OBSERVER_API_URL:-http://127.0.0.1:20008}"
AUTH_TOKEN="${USAGE_OBSERVER_AUTH_TOKEN:-}"

hook_input=$(cat)

SESSION_ID="$(printf '%s' "$hook_input" | jq -r '.session_id // empty')"
TRANSCRIPT_PATH="$(printf '%s' "$hook_input" | jq -r '.transcript_path // empty')"
CWD="$(printf '%s' "$hook_input" | jq -r '.cwd // empty')"

if [[ -z "$SESSION_ID" ]]; then
  exit 0
fi

GIT_BRANCH=""
if [[ -n "$CWD" ]] && [[ -d "$CWD/.git" || -f "$CWD/.git" ]]; then
  GIT_BRANCH="$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi

context_payload=$(python3 - "$SESSION_ID" "$CWD" "$GIT_BRANCH" "$TRANSCRIPT_PATH" <<'PY'
import sys, json, hashlib, os
from datetime import datetime, timezone

session_id = sys.argv[1]
cwd = sys.argv[2]
git_branch = sys.argv[3] if len(sys.argv) > 3 else ""
transcript_path = sys.argv[4] if len(sys.argv) > 4 else ""

captured_at = datetime.now(timezone.utc).isoformat()
contributors = []


def file_contributor(contributor_type, name, scope, path, extra_metadata=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        st = os.stat(path)
        line_count = len(content.split("\n")) if content else 0
        file_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        meta = {"file_path": path}
        if extra_metadata:
            meta.update(extra_metadata)
        return {
            "contributor_type": contributor_type,
            "contributor_name": name,
            "contributor_scope": scope,
            "contributor_hash": file_hash,
            "file_path": path,
            "file_size_bytes": st.st_size,
            "line_count": line_count,
            "enabled": True,
            "metadata_json": meta,
        }
    except (OSError, UnicodeDecodeError):
        return None


def metadata_contributor(contributor_type, name, scope, metadata):
    serialized = json.dumps(metadata, sort_keys=True, separators=(",", ":"))
    return {
        "contributor_type": contributor_type,
        "contributor_name": name,
        "contributor_scope": scope,
        "contributor_hash": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
        "file_path": None,
        "file_size_bytes": None,
        "line_count": None,
        "enabled": True,
        "metadata_json": metadata,
    }


# CLAUDE.md files
claude_md_candidates = []
home = os.path.expanduser("~")

# global
claude_md_candidates.append((os.path.join(home, ".claude", "CLAUDE.md"), "global"))
# project root
if cwd:
    claude_md_candidates.append((os.path.join(cwd, "CLAUDE.md"), "project"))
    claude_md_candidates.append((os.path.join(cwd, ".claude", "CLAUDE.md"), "project"))

for path, scope in claude_md_candidates:
    c = file_contributor("claude_md", path, scope, path)
    if c:
        contributors.append(c)

# Rule files (.claude/rules/ directory)
if cwd:
    rules_dir = os.path.join(cwd, ".claude", "rules")
    if os.path.isdir(rules_dir):
        for fname in sorted(os.listdir(rules_dir)):
            fpath = os.path.join(rules_dir, fname)
            if os.path.isfile(fpath):
                c = file_contributor("rule", fpath, "project", fpath)
                if c:
                    contributors.append(c)

# Model name and MCP servers from transcript
model_name = None
mcp_servers = set()
if transcript_path and os.path.isfile(transcript_path):
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
            m = msg.get("model")
            if m:
                model_name = m
            for block in msg.get("content", []):
                if not isinstance(block, dict):
                    continue
                if block.get("type") != "tool_use":
                    continue
                name = block.get("name", "")
                if name.startswith("mcp__"):
                    parts = name.split("__")
                    if len(parts) >= 2:
                        mcp_servers.add(parts[1])

for server_name in sorted(mcp_servers):
    contributors.append(
        metadata_contributor(
            "mcp_server",
            server_name,
            "session",
            {"mcp_server_name": server_name, "source": "transcript"},
        )
    )

# Project state
if cwd or git_branch:
    contributors.append(
        metadata_contributor(
            "project_state",
            cwd or "project-state",
            "session",
            {"project_root": cwd or None, "git_branch": git_branch or None},
        )
    )

if not contributors:
    print("")
    sys.exit(0)

payload = {
    "session_id": session_id,
    "captured_at": captured_at,
    "project_root": cwd or None,
    "git_branch": git_branch or None,
    "transcript_path": transcript_path or None,
    "model_name": model_name,
    "source": "context-snapshot",
    "contributors": contributors,
}

print(json.dumps(payload))
PY
)

if [[ -z "$context_payload" ]] || [[ "$context_payload" == "null" ]]; then
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

post_json() {
  local endpoint="$1"
  printf '%s' "$2" | curl "${curl_args[@]}" \
    --data-binary @- \
    "${API_URL}${endpoint}"
}

post_json "/v1/context-snapshots" "$context_payload"

# --- 2. Turn details (per-turn transcript metrics) ---

turn_details=$(python3 - "$SESSION_ID" "$TRANSCRIPT_PATH" <<'PY'
import sys, json

session_id = sys.argv[1]
transcript_path = sys.argv[2]

turns = []
turn_index = 0

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

        ts = entry.get("timestamp")
        if not ts:
            continue

        has_thinking = False
        tool_use_count = 0
        tool_names = []
        for block in msg.get("content", []):
            if not isinstance(block, dict):
                continue
            if block.get("type") == "thinking":
                has_thinking = True
            if block.get("type") == "tool_use":
                tool_use_count += 1
                tool_names.append(block.get("name", "unknown"))

        cache_creation = usage.get("cache_creation", {})

        turns.append({
            "turn_index": turn_index,
            "timestamp": ts,
            "model_name": msg.get("model"),
            "stop_reason": msg.get("stop_reason"),
            "has_thinking": has_thinking,
            "service_tier": usage.get("service_tier"),
            "speed": usage.get("speed"),
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens"),
            "cache_read_input_tokens": usage.get("cache_read_input_tokens"),
            "cache_creation_ephemeral_1h_tokens": cache_creation.get("ephemeral_1h_input_tokens"),
            "cache_creation_ephemeral_5m_tokens": cache_creation.get("ephemeral_5m_input_tokens"),
            "tool_use_count": tool_use_count,
            "tool_names": tool_names,
        })
        turn_index += 1

if not turns:
    print("")
    sys.exit(0)

print(json.dumps({"session_id": session_id, "turns": turns}))
PY
)

if [[ -n "$turn_details" ]] && [[ "$turn_details" != "null" ]]; then
  post_json "/v1/session-turn-details" "$turn_details"
fi
