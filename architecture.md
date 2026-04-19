# Claude Code Usage Observer Architecture

## Goals

- Track Claude Code usage by time, session, and prompt without storing sensitive raw content.
- Preserve raw telemetry in standard observability backends instead of duplicating it into PostgreSQL.
- Capture context contributors as local-first metadata so correlation analysis is possible later.
- Keep collection, storage, and query layers separate so the MVP can grow into richer analytics later.

## System Boundaries

### Raw Sources Of Truth

- Metrics: Prometheus
- Logs and event streams: Loki
- Traces: Tempo

### Relational Metadata And Derived Analytics

- PostgreSQL stores session metadata, status line snapshots, contributor snapshots, and worker-produced rollups.
- PostgreSQL does not store raw prompts, raw assistant outputs, raw tool outputs, full commands, or full file contents.

### Query And Exploration Layer

- Grafana is the single MVP UI.
- Grafana reads from Prometheus, Loki, Tempo, and PostgreSQL through provisioned datasources.

## High-Level Flow

1. Claude Code emits OTLP metrics, logs, and traces to the OpenTelemetry Collector.
2. The Collector fans signals out to Prometheus, Loki, and Tempo.
3. Claude Code status line JSON is piped into the statusline sender script.
4. The sender normalizes the snapshot and POSTs it to `ingest-api`.
5. Context contributor snapshots are POSTed separately to `ingest-api`.
6. `ingest-api` validates payloads with Zod, upserts sessions, and stores append-only snapshots in PostgreSQL.
7. The worker periodically reads raw event logs from Loki, derives prompt facts and correlation tables, and writes those derived rows to PostgreSQL.
8. Grafana dashboards combine raw backends and PostgreSQL rollups for exploration.

## Components

## Docker Compose

- Local orchestration entry point for all MVP services.
- Runs PostgreSQL, Collector, Prometheus, Loki, Tempo, Grafana, ingest-api, and worker.
- Keeps the stack reproducible from `README.md` only.

## OpenTelemetry Collector

- Standard OTLP ingestion layer.
- Accepts OTLP over HTTP and gRPC.
- Applies only lightweight processing for batching and memory control.
- Sends:
  - metrics to a Prometheus scrape endpoint
  - logs to Loki
  - traces to Tempo
- Does not write OTLP payloads to PostgreSQL.

## Prometheus

- Stores raw metrics from Claude Code and the Collector.
- Supports time-series exploration and alerting extensions later.

## Loki

- Stores raw event logs and structured log envelopes.
- Acts as the raw event source that the worker scans for prompt and tool rollups.
- Retains prompt ordering and event correlation fields without persisting sensitive content.

## Tempo

- Stores raw traces and spans.
- Preserves session, prompt, trace, and span correlation for drill-down in Grafana.

## PostgreSQL

- Stores append-only operational metadata:
  - sessions
  - status line snapshots
  - contributor snapshots
- Stores derived analytics:
  - prompt facts
  - tool impact
  - contributor impact
- Adds indexes on session ids, prompt ids, and timestamps to keep Grafana queries fast.

## ingest-api

- Fastify + TypeScript service.
- Public ingest endpoints:
  - `POST /v1/statusline-snapshots`
  - `POST /v1/context-snapshots`
- Public query endpoints:
  - `GET /v1/sessions`
  - `GET /v1/sessions/:sessionId`
  - `GET /v1/prompt-facts`
  - `GET /v1/tool-impact`
  - `GET /v1/contributor-impact`
  - `GET /v1/health`
- Responsibilities:
  - validate timestamps and shapes
  - reject malformed payloads clearly
  - support lightweight bearer-token auth
  - preserve nullable fields
  - achieve idempotency through natural keys and upserts

## worker

- TypeScript background service.
- Polls Loki over HTTP on a schedule.
- Converts raw event envelopes into:
  - per-prompt facts
  - per-tool daily impact
  - per-contributor daily impact
- Explicitly marks correlation-style outputs as derived, not exact attribution.
- Continues running even if Loki or PostgreSQL is temporarily empty.

## statusline sender script

- Local CLI utility.
- Reads status line JSON from stdin.
- Extracts only allowed operational metadata.
- Sends it to `ingest-api`.
- Also exposes a context snapshot command so local scripts can report CLAUDE.md, rules, skills, MCP, output style, and auto-memory metadata without storing content.

## Data Model Strategy

## Append-Only First

- Status line and contributor snapshots are append-only facts keyed by session and capture time.
- Derived tables are replaceable rollups keyed by natural grain such as prompt id or date bucket.

## Exactness Rules

- Exact metrics are stored only when directly emitted by Claude Code or the status line.
- Contributor attribution is stored as correlation metadata only.
- Cache efficiency is a derived score, not a guaranteed causal explanation.

## Sensitive Data Policy

- Store metadata only:
  - ids
  - timestamps
  - sizes
  - counts
  - booleans
  - hashes
  - path references
- Never store:
  - raw prompt text
  - raw assistant text
  - raw tool output
  - full command text
  - file bodies
  - detailed tool input bodies

## Correlation Model

### Session Correlation

- `session_id` is the primary session-level join key across PostgreSQL rows and raw telemetry.

### Prompt Correlation

- `prompt_id` groups raw event logs into a single user-visible prompt.
- `trace_id` and `span_id` remain in raw backends for drill-down and debugging.

### Contributor Correlation

- Each context snapshot row describes a contributor that was active at a point in time.
- The worker associates prompts with the latest contributor rows visible at or before prompt start.
- Resulting impact metrics are correlation summaries, not token attribution.

## Failure Modes

- If raw OTLP data is absent, ingest-api query endpoints still serve PostgreSQL-backed snapshots and any previous rollups.
- If status line snapshots are absent, raw backends still preserve telemetry.
- If contributor snapshots are absent, prompt and tool rollups still compute.
- If worker rollups lag, Grafana still has raw telemetry and stored snapshots.

## Phase 2 Extension Points

- Replace Grafana-only UX with a custom React UI without changing ingest contracts.
- Add anomaly detection on top of derived tables.
- Improve contributor scoring with richer attribution heuristics.
- Aggregate multiple machines by adding a machine identity dimension.
- Add retention policies independently per backend.
