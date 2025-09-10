# Simple working Dockerfile - just run with Bun, no compilation
FROM oven/bun:1.2.13-debian

# Accept app name as build argument (defaults to test-brain)
ARG APP_NAME=test-brain

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies (skip postinstall scripts to avoid slow Matrix download)
RUN bun install --ignore-scripts

# CRITICAL: Download Matrix native binary for Linux
# We skipped postinstall scripts to save time, so we need to download the binary manually
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    cd /app/node_modules/@matrix-org/matrix-sdk-crypto-nodejs && \
    PACKAGE_VERSION=$(cat package.json | grep '"version"' | cut -d'"' -f4) && \
    echo "Downloading Matrix SDK crypto binary v${PACKAGE_VERSION}..." && \
    curl -L -o matrix-sdk-crypto.linux-x64-gnu.node \
        "https://github.com/matrix-org/matrix-rust-sdk/releases/download/matrix-sdk-crypto-nodejs-v${PACKAGE_VERSION}/matrix-sdk-crypto.linux-x64-gnu.node" && \
    chmod +x matrix-sdk-crypto.linux-x64-gnu.node && \
    echo "Matrix binary downloaded successfully" && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Verify the binary exists
RUN ls -la /app/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/*.node || \
    (echo "ERROR: Matrix native binary not found!" && exit 1)

# Build all packages
RUN bun run build

# Create required directories with proper permissions
RUN mkdir -p /app/data /app/cache /app/cache/embeddings /app/dist /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/dist /app/brain-data

# Copy brain-data from the app directory to the expected location
# This ensures the brain-data is available at /app/brain-data where the app expects it
RUN if [ -d "/app/apps/${APP_NAME}/brain-data" ]; then \
        cp -r /app/apps/${APP_NAME}/brain-data/* /app/brain-data/ 2>/dev/null || true; \
    fi

# Expose port (can be overridden at runtime)
EXPOSE 3333

# Set the app name as environment variable for runtime
ENV APP_NAME=${APP_NAME}

# Run the app directly - let it handle its own database setup
# Set JSX runtime for runtime execution
CMD ["sh", "-c", "bun run --jsx-import-source=preact apps/${APP_NAME}/brain.config.ts"]