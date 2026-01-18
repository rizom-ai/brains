# syntax=docker/dockerfile:1.6
# Optimized Dockerfile for Bun monorepo
# BuildKit required: DOCKER_BUILDKIT=1 docker build ...

FROM oven/bun:1.2.13-debian

ARG APP_NAME=team-brain

WORKDIR /app

# Layer 1: System dependencies (rarely changes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: Root dependency manifests
COPY package.json bun.lock bunfig.toml turbo.json ./

# Layer 3: Workspace package.json files (one per workspace)
# Apps
COPY apps/collective-brain/package.json ./apps/collective-brain/
COPY apps/professional-brain/package.json ./apps/professional-brain/
COPY apps/team-brain/package.json ./apps/team-brain/

# Interfaces
COPY interfaces/cli/package.json ./interfaces/cli/
COPY interfaces/matrix/package.json ./interfaces/matrix/
COPY interfaces/mcp/package.json ./interfaces/mcp/
COPY interfaces/webserver/package.json ./interfaces/webserver/

# Plugins
COPY plugins/analytics/package.json ./plugins/analytics/
COPY plugins/blog/package.json ./plugins/blog/
COPY plugins/decks/package.json ./plugins/decks/
COPY plugins/directory-sync/package.json ./plugins/directory-sync/
COPY plugins/examples/package.json ./plugins/examples/
COPY plugins/git-sync/package.json ./plugins/git-sync/
COPY plugins/image/package.json ./plugins/image/
COPY plugins/link/package.json ./plugins/link/
COPY plugins/note/package.json ./plugins/note/
COPY plugins/portfolio/package.json ./plugins/portfolio/
COPY plugins/professional-site/package.json ./plugins/professional-site/
COPY plugins/publish-pipeline/package.json ./plugins/publish-pipeline/
COPY plugins/site-builder/package.json ./plugins/site-builder/
COPY plugins/social-media/package.json ./plugins/social-media/
COPY plugins/summary/package.json ./plugins/summary/
COPY plugins/system/package.json ./plugins/system/
COPY plugins/topics/package.json ./plugins/topics/

# Shared
COPY shared/default-site-content/package.json ./shared/default-site-content/
COPY shared/eslint-config/package.json ./shared/eslint-config/
COPY shared/image/package.json ./shared/image/
COPY shared/product-site-content/package.json ./shared/product-site-content/
COPY shared/test-utils/package.json ./shared/test-utils/
COPY shared/theme-default/package.json ./shared/theme-default/
COPY shared/theme-yeehaa/package.json ./shared/theme-yeehaa/
COPY shared/typescript-config/package.json ./shared/typescript-config/
COPY shared/ui-library/package.json ./shared/ui-library/
COPY shared/utils/package.json ./shared/utils/

# Shell
COPY shell/agent-service/package.json ./shell/agent-service/
COPY shell/ai-evaluation/package.json ./shell/ai-evaluation/
COPY shell/ai-service/package.json ./shell/ai-service/
COPY shell/app/package.json ./shell/app/
COPY shell/content-service/package.json ./shell/content-service/
COPY shell/conversation-service/package.json ./shell/conversation-service/
COPY shell/core/package.json ./shell/core/
COPY shell/daemon-registry/package.json ./shell/daemon-registry/
COPY shell/datasource/package.json ./shell/datasource/
COPY shell/embedding-service/package.json ./shell/embedding-service/
COPY shell/entity-service/package.json ./shell/entity-service/
COPY shell/identity-service/package.json ./shell/identity-service/
COPY shell/job-queue/package.json ./shell/job-queue/
COPY shell/mcp-service/package.json ./shell/mcp-service/
COPY shell/messaging-service/package.json ./shell/messaging-service/
COPY shell/permission-service/package.json ./shell/permission-service/
COPY shell/plugins/package.json ./shell/plugins/
COPY shell/profile-service/package.json ./shell/profile-service/
COPY shell/render-service/package.json ./shell/render-service/
COPY shell/service-registry/package.json ./shell/service-registry/
COPY shell/templates/package.json ./shell/templates/

# Layer 4: Install dependencies (cached unless package.json/bun.lock changes)
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --ignore-scripts --frozen-lockfile

# Layer 5: Download Matrix binary (cached unless @matrix-org version changes)
RUN cd /app/node_modules/@matrix-org/matrix-sdk-crypto-nodejs && \
    PACKAGE_VERSION=$(grep '"version"' package.json | cut -d'"' -f4) && \
    echo "Downloading Matrix SDK crypto binary v${PACKAGE_VERSION}..." && \
    curl -fsSL -o matrix-sdk-crypto.linux-x64-gnu.node \
        "https://github.com/matrix-org/matrix-rust-sdk/releases/download/matrix-sdk-crypto-nodejs-v${PACKAGE_VERSION}/matrix-sdk-crypto.linux-x64-gnu.node" && \
    chmod +x matrix-sdk-crypto.linux-x64-gnu.node

# Verify binary
RUN ls -la /app/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/*.node || \
    (echo "ERROR: Matrix native binary not found!" && exit 1)

# Layer 6: Copy source code (invalidates only build layer)
COPY . .

# Layer 7: Build with Turbo cache
RUN --mount=type=cache,target=/app/.turbo/cache \
    bun run build

# Layer 8: Runtime setup
RUN mkdir -p /app/data /app/cache /app/cache/embeddings /app/dist /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/dist /app/brain-data

RUN if [ -d "/app/apps/${APP_NAME}/seed-content" ]; then \
        cp -r "/app/apps/${APP_NAME}/seed-content" /app/seed-content; \
    fi

EXPOSE 3333

ENV APP_NAME=${APP_NAME}

CMD ["sh", "-c", "bun run --jsx-import-source=preact apps/${APP_NAME}/brain.config.ts"]
