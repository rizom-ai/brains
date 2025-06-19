# Docker Build with Native Modules

## Overview

The Personal Brain application uses native modules (LibSQL for vector embeddings and replication, Matrix crypto for secure messaging) that cannot be bundled into the Bun standalone binary. This document describes the build and deployment strategy.

## Build Process

### 1. Compilation Phase

The build script compiles with native modules marked as external:

```bash
bun build src/index.ts \
  --compile \
  --minify \
  --target=bun-linux-x64 \
  --external=@libsql/client \
  --external=libsql \
  --external=@matrix-org/matrix-sdk-crypto-nodejs \
  --outfile brain
```

### 2. Package.json Generation

Instead of copying node_modules, we generate a minimal package.json with exact versions:

```json
{
  "name": "test-brain",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@libsql/client": "0.15.7",
    "libsql": "0.5.11",
    "@matrix-org/matrix-sdk-crypto-nodejs": "0.1.0-beta.6"
  }
}
```

### 3. Release Package Structure

```
test-brain-v0.1.0-linux-x64/
├── brain                    # Compiled binary (external deps)
├── brain-wrapper.sh         # Runtime wrapper with auto-install
├── package.json            # Minimal deps (exact versions)
├── .env.example            # Environment template
├── personal-brain.service  # Systemd service
├── setup.sh               # Installation script
└── README.md              # Documentation
```

## Docker Strategies

### Option 1: Multi-stage Build (Recommended)

```dockerfile
# Stage 1: Install native modules
FROM oven/bun:1-debian AS modules
WORKDIR /app
COPY package.json .
RUN bun install --production

# Stage 2: Runtime
FROM debian:bullseye-slim
# ... setup ...
COPY --from=modules /app/node_modules /app/node_modules
```

**Pros:**

- Efficient layer caching
- Clean separation of concerns
- Smaller final image

**Cons:**

- Requires network during build

### Option 2: Runtime Installation

```dockerfile
FROM debian:bullseye-slim
# ... setup ...
COPY package.json /app/
# Install bun temporarily
RUN curl -fsSL https://bun.sh/install | bash && \
    /root/.bun/bin/bun install --production && \
    rm -rf /root/.bun
```

**Pros:**

- Single stage build
- Direct installation

**Cons:**

- Larger image (includes bun temporarily)
- Slower builds

### Option 3: Lazy Installation

The wrapper script checks and installs on first run:

```bash
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing native dependencies..."
    bun install --production
fi
```

**Pros:**

- Smallest Docker image
- Flexible deployment

**Cons:**

- Slower first startup
- Requires bun/npm at runtime

## Deployment Scenarios

### 1. Standard VPS Deployment

```bash
# Extract release
tar -xzf test-brain-v0.1.0-linux-x64.tar.gz
cd test-brain-v0.1.0-linux-x64

# Dependencies installed by wrapper on first run
./brain-wrapper.sh
```

### 2. Docker Deployment

```bash
# Build with multi-stage Dockerfile
docker build -f Dockerfile.optimized -t personal-brain .

# Run container
docker run -d \
  -p 3333:3333 \
  -v brain-data:/app/data \
  personal-brain
```

### 3. Air-gapped Deployment

For environments without internet:

1. Pre-install dependencies locally
2. Include node_modules in deployment package
3. Skip auto-install in wrapper

## Benefits of This Approach

1. **Smaller Releases**: ~45MB tarball vs ~200MB with node_modules
2. **Platform Flexibility**: Native modules installed for target platform
3. **Version Control**: Exact versions ensure compatibility
4. **Cache Efficiency**: Docker layer caching for dependencies
5. **Simple Updates**: Just update package.json versions

## Troubleshooting

### Native Module Errors

If you see errors like:

```
Cannot find module '@libsql/linux-x64-gnu'
```

Ensure:

1. package.json includes the module
2. Dependencies are installed for the correct platform
3. NODE_PATH includes the node_modules directory

### Platform Mismatches

Build and runtime platforms must match:

- Linux x64 → linux-x64-gnu modules
- macOS ARM64 → darwin-arm64 modules

### Permission Issues

Ensure the personal-brain user owns:

- `/app/node_modules`
- `/app/brain`
- `/app/data`

## Future Improvements

1. **Bundle Analysis**: Identify which modules truly need to be external
2. **Module Vendoring**: Pre-package platform-specific modules
3. **Bun Improvements**: Watch for better native module support
4. **Alternative Runtimes**: Consider Deno or Node.js compatibility layer
