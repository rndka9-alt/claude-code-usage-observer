FROM node:20-alpine

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/ingest-api/package.json apps/ingest-api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/usage-observer-domain/package.json packages/usage-observer-domain/package.json
COPY scripts/statusline-sender/package.json scripts/statusline-sender/package.json

RUN pnpm install --recursive --frozen-lockfile=false

COPY . .

RUN pnpm --filter @usage-observer/domain build
RUN pnpm --filter @usage-observer/worker build

CMD ["node", "apps/worker/dist/index.js"]
