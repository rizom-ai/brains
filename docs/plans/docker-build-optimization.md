# Docker Deployment Fix Plan

## Problem

The current Docker setup has issues:

1. **Slow builds** - `COPY . .` copies entire monorepo, invalidating all cache on any change
2. **Workspace linking issues** - Previous layer optimization attempt broke bun workspace linking (reverted in `6bc0bbc6`)
3. **Large images** - Full monorepo + all dev dependencies included

## Solution: Use the New Build System

Now that we have `brain-build` which bundles apps into a single distributable file, we can:

1. **Build locally** (or in CI) - `bun run build` creates `dist/brain.config.js` + migrations
2. **Simple Dockerfile** - Just copy the dist folder and install runtime native modules
3. **Fast builds** - No more monorepo copying, `bun install`, or `bun run build` inside Docker

## Native Modules Required at Runtime

The build script marks these as external (not bundled):

- `@matrix-org/matrix-sdk-crypto-nodejs` - Matrix E2E encryption
- `@libsql/client` / `libsql` - Database driver
- `better-sqlite3` - SQLite native bindings
- `onnxruntime-node` / `fastembed` - Local embeddings (optional)

## Implementation

### Step 1: Create New Production Dockerfile

**File:** `deploy/docker/Dockerfile.prod`

```dockerfile
# Minimal production Dockerfile using pre-built bundle
FROM oven/bun:1.2.13-debian

WORKDIR /app

# Layer 1: System dependencies (rarely changes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: Runtime native module package.json (changes rarely)
COPY package.json ./package.json

# Layer 3: Install runtime native modules (cached unless package.json changes)
RUN bun install --ignore-scripts

# Layer 4: Download Matrix native binary
RUN cd /app/node_modules/@matrix-org/matrix-sdk-crypto-nodejs && \
    PACKAGE_VERSION=$(grep '"version"' package.json | cut -d'"' -f4) && \
    curl -fsSL -o matrix-sdk-crypto.linux-x64-gnu.node \
        "https://github.com/matrix-org/matrix-rust-sdk/releases/download/matrix-sdk-crypto-nodejs-v${PACKAGE_VERSION}/matrix-sdk-crypto.linux-x64-gnu.node" && \
    chmod +x matrix-sdk-crypto.linux-x64-gnu.node

# Layer 5: Create directories
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

# Layer 6: Copy pre-built bundle (changes frequently - last layer)
COPY dist ./dist
COPY seed-content ./seed-content

EXPOSE 3333

CMD ["bun", "dist/brain.config.js"]
```

### Step 2: Create Runtime Dependencies Package

**File:** `deploy/docker/package.prod.json`

```json
{
  "name": "brain-runtime",
  "dependencies": {
    "@matrix-org/matrix-sdk-crypto-nodejs": "^0.2.0-beta.2",
    "@libsql/client": "^0.14.0",
    "better-sqlite3": "^11.8.1"
  }
}
```

### Step 3: Update Build Script

**File:** `shell/app/scripts/build.ts`

Add copying of `seed-content` folder to dist if it exists.

### Step 4: Create Docker Build Wrapper

**File:** `deploy/scripts/build-docker-image.sh`

```bash
#!/usr/bin/env bash
# Build production Docker image
APP_NAME="${1:-team-brain}"
TAG="${2:-latest}"

# 1. Build the app bundle
echo "Building $APP_NAME..."
cd "apps/$APP_NAME"
bun run build

# 2. Prepare build context
BUILD_DIR=$(mktemp -d)
cp -r dist "$BUILD_DIR/"
[ -d seed-content ] && cp -r seed-content "$BUILD_DIR/"
cp ../../deploy/docker/Dockerfile.prod "$BUILD_DIR/Dockerfile"
cp ../../deploy/docker/package.prod.json "$BUILD_DIR/package.json"

# 3. Build Docker image
docker build -t "personal-brain-$APP_NAME:$TAG" "$BUILD_DIR"

# 4. Cleanup
rm -rf "$BUILD_DIR"
```

### Step 5: Update deploy-docker.sh

**File:** `deploy/scripts/deploy-docker.sh`

Update `build_image()` to use the new wrapper script.

### Step 6: Update Hetzner Deploy

**File:** `deploy/providers/hetzner/deploy.sh`

Update `build_and_push_docker_image()` to use the new build script.

## Files to Create/Modify

| File                                   | Action | Description                   |
| -------------------------------------- | ------ | ----------------------------- |
| `deploy/docker/Dockerfile.prod`        | CREATE | Minimal production Dockerfile |
| `deploy/docker/package.prod.json`      | CREATE | Runtime native module deps    |
| `deploy/scripts/build-docker-image.sh` | CREATE | Build wrapper script          |
| `shell/app/scripts/build.ts`           | MODIFY | Copy seed-content to dist     |
| `deploy/scripts/deploy-docker.sh`      | MODIFY | Use new build flow            |
| `deploy/providers/hetzner/deploy.sh`   | MODIFY | Use new build flow            |

## Verification

1. **Build the app:**

   ```bash
   cd apps/team-brain && bun run build
   ls -la dist/
   ```

2. **Build Docker image:**

   ```bash
   ./deploy/scripts/build-docker-image.sh team-brain
   ```

3. **Test container locally:**

   ```bash
   docker run --rm -it -p 3333:3333 \
     -v ~/.env.brain:/app/.env:ro \
     personal-brain-team-brain:latest
   ```

4. **Deploy to Hetzner:**
   ```bash
   bun run brain:deploy team-brain hetzner update
   ```

## Benefits

| Metric            | Before   | After                |
| ----------------- | -------- | -------------------- |
| Docker build time | ~60-90s  | ~10-15s              |
| Image size        | ~2GB+    | ~300-500MB           |
| Layer caching     | None     | Excellent            |
| Workspace issues  | Frequent | None                 |
| CI/CD ready       | No       | Yes (build artifact) |
