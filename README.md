# Claude Code Usage Observer

Local-first observability MVP for Claude Code usage. The stack separates raw telemetry collection from relational metadata and derived analytics:

- OpenTelemetry Collector receives Claude Code OTLP signals
- Prometheus stores raw metrics
- Loki stores raw logs and event streams
- Tempo stores raw traces
- PostgreSQL stores session metadata, status snapshots, contributor snapshots, and derived rollups
- Fastify ingest-api accepts safe metadata snapshots
- TypeScript worker computes prompt, tool, and contributor impact rollups
- Grafana provides the MVP dashboards

## What This Stores

This repository intentionally stores metadata only:

- timestamps
- ids
- hashes
- counts
- durations
- percentages
- booleans
- file paths
- safe contributor metadata

It does not store raw prompt text, raw assistant output, raw tool output, full bash commands, file bodies, or sensitive content.

## Repository Layout

```text
apps/
  ingest-api/
  worker/
packages/
  usage-observer-domain/
scripts/
  statusline-sender/
infra/
  docker/
dashboards/
  grafana/
fixtures/
```

## Prerequisites

- Docker
- Docker Compose
- Node.js 20+
- pnpm 9+

## Environment File

All local ports and wrapper runtime endpoints are managed through `.env`.

1. Create `.env` from the checked-in template.

```bash
cp .env.example .env
```

2. If any local port conflicts with another stack, edit only `.env`.

Important fields:

- `USAGE_OBSERVER_OTLP_HTTP_PORT`
- `USAGE_OBSERVER_OTEL_HEALTHCHECK_PORT`
- `USAGE_OBSERVER_INGEST_API_PORT`
- `USAGE_OBSERVER_GRAFANA_PORT`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `USAGE_OBSERVER_OTEL_HEALTHCHECK_URL`
- `USAGE_OBSERVER_API_URL`
- `USAGE_OBSERVER_API_HEALTH_URL`
- `OBSERVED_CLAUDE_COMMAND`

The wrapper and Docker Compose both read the same `.env`, so port changes stay in one place.

## Local Run

1. Install dependencies.

```bash
pnpm install
```

2. Create or update `.env`.

```bash
cp .env.example .env
```

3. Start the full local stack.

```bash
docker compose up --build
```

4. Optional: run migrations outside Docker when developing locally.

```bash
pnpm db:migrate
```

5. Open Grafana at the URL implied by `.env`, default `http://127.0.0.1:3000`.

- user: `admin`
- password: `admin`

6. Health-check the API.

```bash
source ./.env && curl "$USAGE_OBSERVER_API_HEALTH_URL"
```

7. Health-check the Collector itself.

```bash
source ./.env && curl "$USAGE_OBSERVER_OTEL_HEALTHCHECK_URL"
```

## Configure Claude Code OTLP Export

The recommended path is to use the wrapper script instead of exporting OTEL variables by hand.

```bash
./scripts/run-observed-claude.sh
```

The wrapper:

- loads `.env`
- checks that the Collector health endpoint responds
- checks that the ingest-api health endpoint responds
- exports OTEL runtime variables for the Claude process
- preserves existing environment variables for downstream wrappers

If you still want manual exports, load `.env` and export the standard OTEL variables from there.

The Collector forwards raw metrics, logs, and traces to Prometheus, Loki, and Tempo. PostgreSQL is not used as a raw OTLP sink.

## Wrapper Usage

Default usage runs the command in `OBSERVED_CLAUDE_COMMAND`, which defaults to `claude`.

```bash
./scripts/run-observed-claude.sh
```

Pass normal Claude CLI arguments directly:

```bash
./scripts/run-observed-claude.sh --resume
./scripts/run-observed-claude.sh --model claude-sonnet-4
```

Run a different Claude launcher:

```bash
./scripts/run-observed-claude.sh --command ../claude-code-with-emotion/bin/claude
```

Skip endpoint health checks only when intentionally working offline:

```bash
./scripts/run-observed-claude.sh --skip-health-check
```

If the wrapper reports that the Collector or ingest-api is unreachable, the fix is usually:

```bash
docker compose up --build
```

or editing `.env` so the URLs match the ports you actually exposed.

## `claude-code-with-emotion` Compatibility

The wrapper is compatible with `../claude-code-with-emotion/bin/claude` because it only adds OTEL and observer-related environment variables and then `exec`s the requested command.

What stays intact:

- existing `CLAUDE_WITH_EMOTION_*` environment variables
- the emotion wrapper's prompt injection
- helper binary resolution for `claude-status`, `claude-session-hook`, and related scripts when you target `../claude-code-with-emotion/bin/claude`
- user-scope MCP usage that the emotion project already configured
- hook settings injection when that project already provides `CLAUDE_WITH_EMOTION_HOOKS_SETTINGS_FILE`

Caveat:

- If you launch `../claude-code-with-emotion/bin/claude` directly from a plain shell, outside the Electron app bootstrap, the wrapper can provide `CLAUDE_WITH_EMOTION_ORIGINAL_PATH` fallback and helper-bin `PATH` setup so the real Claude binary and helper commands resolve, but it does not generate the Electron app's hook settings file for you.
- In other words, the wrapper is compatible with `claude-code-with-emotion`, but it does not replace that app's own session bootstrap.

## Send Status Line Snapshots

Pipe Claude Code status line JSON into the sender script.

```bash
cat fixtures/statusline/sample-statusline.json | \
  USAGE_OBSERVER_API_URL=http://127.0.0.1:8080 \
  USAGE_OBSERVER_AUTH_TOKEN=local-observer-token \
  pnpm --filter @usage-observer/statusline-sender dev
```

The sender normalizes nested status line JSON into the ingest-api payload shape and adds a capture timestamp when one is missing.

## Send Context Contributor Snapshots

Use the same sender package with the `context` subcommand.

```bash
USAGE_OBSERVER_API_URL=http://127.0.0.1:8080 \
USAGE_OBSERVER_AUTH_TOKEN=local-observer-token \
pnpm --filter @usage-observer/statusline-sender dev -- context \
  --session-id session-alpha \
  --project-root /workspace/project-alpha \
  --git-branch main \
  --transcript-path /workspace/project-alpha/.claude/transcript.jsonl \
  --model-name claude-sonnet-4 \
  --claude-md-path "$(pwd)/fixtures/context/sample-CLAUDE.md" \
  --rule-path "$(pwd)/fixtures/context/sample-rule.md" \
  --skill-name coding-guidelines \
  --mcp-server filesystem \
  --observed-mcp-server github \
  --output-style concise \
  --auto-memory-enabled true
```

The command stores only:

- file path
- file size
- line count
- deterministic hash
- enabled state
- safe metadata JSON

Current caveat:

- the wrapper sets OTEL exports and health-checks the backend, but status line and context contributor submission still need an explicit sender integration path.
- the current repo ships the sender and the endpoints, but it does not yet auto-wire session snapshot or contributor snapshot capture from the wrapper alone.

## API Endpoints

- `POST /v1/statusline-snapshots`
- `POST /v1/context-snapshots`
- `GET /v1/sessions`
- `GET /v1/sessions/:sessionId`
- `GET /v1/prompt-facts`
- `GET /v1/tool-impact`
- `GET /v1/contributor-impact`
- `GET /v1/health`

If `INGEST_API_AUTH_TOKEN` is set, all endpoints except `/v1/health` require `Authorization: Bearer <token>`.

## Dashboards

Provisioned Grafana dashboards:

1. `Overview`
2. `Session Explorer`
3. `Prompt & Tool Impact`
4. `Contributor Impact`
5. `Cache Behavior`

These dashboards answer the MVP questions:

- when usage spiked today
- which session was most expensive
- which prompt cost the most
- whether idle-gap cache-miss-looking patterns appeared
- which tools correlate with expensive prompts
- which MCP, skills, rules, or CLAUDE.md contributors correlate with higher usage

## Development Commands

```bash
pnpm build
pnpm typecheck
pnpm test
```

## Tests And Fixtures

Fixtures live under `fixtures/` and include:

- nested status line JSON
- safe context snapshot payload
- Loki query response with structured event lines
- sample CLAUDE.md and rule files

Automated tests currently cover:

- status line normalization
- context contributor capture
- prompt, tool, and contributor rollup derivation
- ingest-api config parsing

## Architecture Docs

- [architecture.md](./architecture.md)
- [data-model.md](./data-model.md)
- [implementation-plan.md](./implementation-plan.md)

## Phase 2

Not implemented in this MVP, but the current architecture keeps room for:

- custom React dashboards
- richer filtering UI
- anomaly detection
- improved contributor scoring
- multi-machine aggregation
- retention policies
- export workflows
