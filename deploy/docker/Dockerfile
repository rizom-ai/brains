# Simple working Dockerfile - just run with Bun, no compilation
FROM oven/bun:1.2.13-debian

# Accept app name as build argument (defaults to test-brain)
ARG APP_NAME=test-brain

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies (skip postinstall scripts to avoid slow Matrix download)
RUN bun install --ignore-scripts

# CRITICAL: Download Matrix native binary for Linux and install git for git-sync plugin
# We skipped postinstall scripts to save time, so we need to download the binary manually
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git && \
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

# Copy seed-content to /app so it's available at ./seed-content when running from /app
RUN if [ -d "/app/apps/${APP_NAME}/seed-content" ]; then \
        cp -r "/app/apps/${APP_NAME}/seed-content" /app/seed-content; \
    fi

# Expose port (can be overridden at runtime)
EXPOSE 3333

# Set the app name as environment variable for runtime
ENV APP_NAME=${APP_NAME}

# Run the app directly - let it handle its own database setup
# Set JSX runtime for runtime execution
CMD ["sh", "-c", "bun run --jsx-import-source=preact apps/${APP_NAME}/brain.config.ts"]