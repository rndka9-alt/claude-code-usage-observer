#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${USAGE_OBSERVER_ENV_FILE:-$REPO_ROOT/.env}"

print_usage() {
  cat <<'EOF'
Usage:
  ./scripts/run-observed-claude.sh [wrapper-options] [claude-args...]

Wrapper options:
  --command <path>        Run a different Claude launcher for this run.
  --skip-health-check     Do not probe collector or ingest-api before launch.
  --help                  Show this message.

Examples:
  ./scripts/run-observed-claude.sh
  ./scripts/run-observed-claude.sh --resume
  ./scripts/run-observed-claude.sh --command ../claude-code-with-emotion/bin/claude
EOF
}

if ! command -v curl >/dev/null 2>&1; then
  printf 'Missing required command: curl\n' >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Missing %s. Create it first, for example: cp .env.example .env\n' "$ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

export CLAUDE_CODE_ENABLE_TELEMETRY="${CLAUDE_CODE_ENABLE_TELEMETRY:-1}"
export OTEL_EXPORTER_OTLP_ENDPOINT
export OTEL_EXPORTER_OTLP_PROTOCOL
export OTEL_METRICS_EXPORTER
export OTEL_LOGS_EXPORTER
export OTEL_TRACES_EXPORTER
export OTEL_METRIC_EXPORT_INTERVAL="${OTEL_METRIC_EXPORT_INTERVAL:-5000}"
export OTEL_LOGS_EXPORT_INTERVAL="${OTEL_LOGS_EXPORT_INTERVAL:-1000}"

COMMAND_OVERRIDE=""
SKIP_HEALTH_CHECK="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --command)
      if [[ $# -lt 2 ]]; then
        printf 'Missing value for --command\n' >&2
        exit 1
      fi
      COMMAND_OVERRIDE="$2"
      shift 2
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK="true"
      shift
      ;;
    --help)
      print_usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

TARGET_COMMAND="${COMMAND_OVERRIDE:-claude}"

require_env() {
  local key="$1"
  local value="${!key:-}"

  if [[ -z "$value" ]]; then
    printf 'Required environment variable %s is not set in %s\n' "$key" "$ENV_FILE" >&2
    exit 1
  fi
}

check_health() {
  local name="$1"
  local url="$2"

  if curl --fail --silent --show-error --max-time 2 "$url" >/dev/null; then
    return 0
  fi

  printf '%s is not reachable at %s\n' "$name" "$url" >&2
  printf 'Start the local stack with: docker compose up --build\n' >&2
  printf 'If you changed ports, update %s so the wrapper uses the correct URLs.\n' "$ENV_FILE" >&2
  exit 1
}

require_env OTEL_EXPORTER_OTLP_ENDPOINT
require_env OTEL_EXPORTER_OTLP_PROTOCOL
require_env CLAUDE_CODE_ENABLE_TELEMETRY
require_env OTEL_METRICS_EXPORTER
require_env OTEL_LOGS_EXPORTER
require_env OTEL_TRACES_EXPORTER
require_env USAGE_OBSERVER_OTEL_HEALTHCHECK_URL
require_env USAGE_OBSERVER_API_URL
require_env USAGE_OBSERVER_API_HEALTH_URL

if [[ "$SKIP_HEALTH_CHECK" != "true" ]]; then
  check_health "OpenTelemetry Collector" "$USAGE_OBSERVER_OTEL_HEALTHCHECK_URL"
  check_health "ingest-api" "$USAGE_OBSERVER_API_HEALTH_URL"
fi

export USAGE_OBSERVER_REPO_ROOT="$REPO_ROOT"
export USAGE_OBSERVER_ORIGINAL_STATUSLINE_CMD="${USAGE_OBSERVER_ORIGINAL_STATUSLINE_CMD:-~/.claude/statusline.sh}"

OBSERVER_SETTINGS="$REPO_ROOT/scripts/observer-hooks-settings.json"

case "$TARGET_COMMAND" in
  *claude-code-with-emotion/bin/claude)
    EMOTION_BIN_DIR="$(CDPATH='' cd -- "$(dirname -- "$TARGET_COMMAND")" && pwd)"
    export CLAUDE_WITH_EMOTION_ORIGINAL_PATH="${CLAUDE_WITH_EMOTION_ORIGINAL_PATH:-$PATH}"
    export CLAUDE_WITH_EMOTION_HELPER_BIN_DIR="${CLAUDE_WITH_EMOTION_HELPER_BIN_DIR:-$EMOTION_BIN_DIR}"
    export PATH="$EMOTION_BIN_DIR:$PATH"
    if [[ -z "${CLAUDE_WITH_EMOTION_HOOKS_SETTINGS_FILE:-}" ]]; then
      printf '%s\n' \
        'Warning: CLAUDE_WITH_EMOTION_HOOKS_SETTINGS_FILE is not set.' \
        'Prompt injection and helper-bin resolution should still work, but direct shell launches outside the Electron app will not get the app-generated hook settings file.' >&2
    fi
    ;;
esac

printf 'Launching %s with usage observer OTEL exports.\n' "$TARGET_COMMAND" >&2
exec "$TARGET_COMMAND" --settings "$OBSERVER_SETTINGS" "$@"
