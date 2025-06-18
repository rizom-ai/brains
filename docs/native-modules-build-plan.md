# Native Modules Build Plan

## Problem Statement

Bun's `--compile` flag cannot properly bundle native modules like LibSQL (which provides vector embeddings and replication features). When attempting to create a standalone binary, native modules need to be available at runtime.

## Current Approach Issues

1. Copying entire node_modules directories is inefficient and error-prone
2. Manual copying of specific modules can miss dependencies
3. Large release archives due to duplicated modules
4. Platform-specific module handling is complex

## Proposed Solution

Use a generated `package.json` that includes only the required native modules, allowing them to be installed during Docker build or deployment.

## Implementation Plan

### 1. Build Script Changes (`scripts/build-release.sh`)

#### Phase 1: Compile with External Modules
```bash
# Always use external flags for native modules
bun build "$ENTRY_POINT" \
    --compile \
    --minify \
    --target=bun-linux-x64 \
    --external=@libsql/client \
    --external=libsql \
    --external=@matrix-org/matrix-sdk-crypto-nodejs \
    --outfile "$TEMP_BINARY"
```

#### Phase 2: Generate Minimal package.json
Instead of copying node_modules, generate a package.json with exact versions:

```javascript
// Extract actual versions from the monorepo
const rootPackageJson = require('../../package.json');
const workspacePackageJson = require('./package.json');

// Combine dependencies that are marked as external
const externalDeps = {
  "@libsql/client": getVersion("@libsql/client"),
  "libsql": getVersion("libsql"),
  "@matrix-org/matrix-sdk-crypto-nodejs": getVersion("@matrix-org/matrix-sdk-crypto-nodejs")
};

// Generate minimal package.json
const minimalPackage = {
  "name": appName,
  "version": version,
  "type": "module",
  "dependencies": externalDeps
};
```

### 2. Release Package Structure

The release tarball will contain:
```
test-brain-v0.1.0-linux-x64/
├── brain                    # Compiled binary
├── brain-wrapper.sh         # Runtime wrapper
├── package.json            # Minimal deps for native modules
├── .env.example            # Environment template
├── personal-brain.service  # Systemd service
├── setup.sh               # Installation script
└── README.md              # Documentation
```

### 3. Docker Build Strategy

#### Option A: Install at Docker Build Time
```dockerfile
# Copy the binary and package.json
COPY --chown=personal-brain:personal-brain brain /app/brain
COPY --chown=personal-brain:personal-brain package.json /app/

# Install only production native modules
RUN cd /app && bun install --production
```

#### Option B: Multi-stage Build
```dockerfile
# Stage 1: Install native modules
FROM oven/bun:1-debian AS modules
WORKDIR /app
COPY package.json .
RUN bun install --production

# Stage 2: Final image
FROM debian:bullseye-slim
# ... other setup ...
COPY --from=modules /app/node_modules /app/node_modules
```

### 4. Wrapper Script Updates

The wrapper script needs to ensure node_modules can be found:
```bash
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure node_modules is in NODE_PATH
export NODE_PATH="$SCRIPT_DIR/node_modules:$NODE_PATH"

# Execute the binary
cd "$SCRIPT_DIR"
exec "./brain" "$@"
```

### 5. Version Management

To ensure compatibility, we need to extract exact versions:

1. Read from the monorepo's lock file (`bun.lockb`)
2. Or parse from current node_modules
3. Include platform-specific versions when needed

### 6. Benefits

1. **Smaller release packages** - Only binary + package.json, no node_modules
2. **Reproducible builds** - Package.json ensures exact versions
3. **Platform flexibility** - Native modules installed for target platform
4. **Cleaner Docker images** - Dependencies installed in controlled environment
5. **Easier updates** - Just update package.json versions

### 7. Rollout Plan

1. Update build-release.sh to generate package.json
2. Test with local builds
3. Update Dockerfile to install dependencies
4. Test Docker builds and runtime
5. Update deployment documentation

### 8. Potential Issues & Mitigations

**Issue**: Bun.lockb binary format makes version extraction difficult
**Mitigation**: Use `bun pm ls` or read from node_modules package.json files

**Issue**: Platform-specific modules might not install correctly
**Mitigation**: Ensure Docker build uses same platform as target

**Issue**: Network access required during Docker build
**Mitigation**: Document this requirement, consider vendoring for air-gapped environments

## Example Implementation

```bash
# In build-release.sh, after compilation:

# Extract versions of external modules
LIBSQL_VERSION=$(cd "$NODE_MODULES_PATH/@libsql/client" && cat package.json | jq -r .version)
MATRIX_VERSION=$(cd "$NODE_MODULES_PATH/@matrix-org/matrix-sdk-crypto-nodejs" && cat package.json | jq -r .version)

# Generate package.json
cat > "$RELEASE_DIR/package.json" << EOF
{
  "name": "$APP_NAME",
  "version": "$VERSION",
  "type": "module",
  "dependencies": {
    "@libsql/client": "$LIBSQL_VERSION",
    "libsql": "$LIBSQL_VERSION",
    "@matrix-org/matrix-sdk-crypto-nodejs": "$MATRIX_VERSION"
  }
}
EOF
```

## Decision Required

Should we:
1. Install dependencies at Docker build time (cleaner, requires network)
2. Install dependencies at first run (faster build, slower first start)
3. Provide both options with a build flag