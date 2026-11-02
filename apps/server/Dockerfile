# Self-contained Nakama image with the Chkobba runtime module baked in.
#
# Build from the monorepo root so pnpm can resolve the workspace (@chkobba/rules, @chkobba/protocol):
#   docker build -f apps/server/Dockerfile -t chkobba-nakama .
#
# Run (the database address carries credentials, so it is supplied at runtime,
# never baked into the image):
#   docker run -e NAKAMA_DATABASE_ADDRESS=user:pass@host:5432/nakama -p 7350:7350 chkobba-nakama
#
# Local development keeps using docker-compose.yml, which bind-mounts build/ instead.

# ---- Build stage: compile the module to a single ES5 bundle ----
FROM node:24.21.0-bookworm-slim AS build

# pnpm version matches the root package.json "packageManager" field.
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

WORKDIR /repo

# Manifests first so the dependency layer is cached across source changes.
# Every workspace manifest is copied so the frozen lockfile still matches the
# workspace, but only the server and its workspace deps are installed.
# The workspace's hoisted linker (needed by Expo) ignores --filter and would
# install the whole mobile app, so the image build uses the isolated linker.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/rules/package.json packages/rules/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --config.node-linker=isolated --filter "@chkobba/server..."

COPY packages/rules/ packages/rules/
COPY packages/protocol/ packages/protocol/
COPY apps/server/ apps/server/
RUN pnpm --filter @chkobba/server build

# ---- Runtime stage: pinned Nakama with the bundle and config ----
FROM heroiclabs/nakama:3.40.0

COPY --from=build /repo/apps/server/build/index.js /nakama/data/modules/build/index.js
COPY apps/server/local.yml /nakama/data/local.yml

EXPOSE 7349 7350 7351

# Mirrors docker-compose.yml: run migrations, then start Nakama with the config.
# NAKAMA_DATABASE_ADDRESS is required; the shell aborts with a clear error if unset.
ENTRYPOINT ["/bin/sh", "-ec", "/nakama/nakama migrate up --database.address \"${NAKAMA_DATABASE_ADDRESS:?NAKAMA_DATABASE_ADDRESS is required}\" && exec /nakama/nakama --config /nakama/data/local.yml --database.address \"$NAKAMA_DATABASE_ADDRESS\" \"$@\"", "--"]
