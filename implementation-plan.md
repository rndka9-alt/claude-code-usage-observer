# Implementation Plan

## MVP Execution Order

1. Write architecture and data model documentation.
2. Bootstrap a pnpm monorepo and package boundaries.
3. Provision Docker Compose, OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, and PostgreSQL.
4. Add Drizzle schema and SQL migrations.
5. Implement ingest-api and statusline sender.
6. Implement worker rollups for prompts, tools, and contributors.
7. Provision Grafana datasources and five dashboards.
8. Add fixtures, tests, and README run instructions.

## Package Layout

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
  statusline/
  context/
  loki/
```

## Responsibilities

### `packages/usage-observer-domain`

- Drizzle schema
- migrations
- shared Zod schemas
- shared query helpers
- worker rollup logic

### `apps/ingest-api`

- Fastify server
- auth
- request validation
- session upserts
- snapshot persistence
- query endpoints

### `apps/worker`

- Loki polling client
- prompt rollup pipeline
- tool impact aggregation
- contributor impact aggregation
- periodic execution loop

### `scripts/statusline-sender`

- stdin statusline ingestion
- optional context snapshot capture command
- metadata hashing for file-based contributors

## Delivery Notes

## Storage Split

- Prometheus, Loki, and Tempo remain raw stores.
- PostgreSQL only keeps relational metadata and derived rollups.

## Analytics Scope

- Tool and contributor outputs are explicitly labeled as correlation-oriented.
- Prompt facts are computed from raw event envelopes and retain nullable unknowns.

## Local-First Constraints

- No cloud dependencies.
- Single `docker compose up --build` path for MVP.
- Optional auth token only.

## Testing Scope

- Fastify route validation and persistence behavior
- worker rollup logic from Loki fixtures
- statusline normalization

## Phase 2 Compatibility

- A custom React dashboard can later replace or complement Grafana without changing the ingest API.
- More advanced contributor scoring can replace current correlation heuristics without changing raw storage.
- Multi-machine aggregation can extend schemas by adding machine identity dimensions.
