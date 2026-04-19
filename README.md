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

## Local Run

1. Install dependencies.

```bash
pnpm install
```

2. Start the full local stack.

```bash
docker compose up --build
```

3. Optional: run migrations outside Docker when developing locally.

```bash
pnpm db:migrate
```

4. Open Grafana at `http://127.0.0.1:3000`.

- user: `admin`
- password: `admin`

5. Health-check the API.

```bash
curl http://127.0.0.1:8080/v1/health
```

## Configure Claude Code OTLP Export

Point Claude Code OTLP export at the Collector.

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_TRACES_EXPORTER=otlp
```

The Collector forwards raw metrics, logs, and traces to Prometheus, Loki, and Tempo. PostgreSQL is not used as a raw OTLP sink.

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
