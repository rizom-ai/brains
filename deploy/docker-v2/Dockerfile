# Simplified working Dockerfile for compiled binary
FROM oven/bun:1-debian AS builder

WORKDIR /build

# Copy entire repository
COPY . .

# Install dependencies and download native modules
RUN apt-get update && apt-get install -y npm && \
    bun install --ignore-scripts && \
    npm rebuild && \
    cd node_modules/@matrix-org/matrix-sdk-crypto-nodejs && \
    node download-lib.js

# Compile the app
WORKDIR /build/apps/test-brain
RUN bun run compile:prod

# Runtime stage
FROM debian:bullseye-slim

# Install runtime dependencies and ONNX Runtime
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    git \
    wget \
    && wget https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-1.21.0.tgz \
    && tar -xzf onnxruntime-linux-x64-1.21.0.tgz \
    && cp onnxruntime-linux-x64-1.21.0/lib/libonnxruntime.so* /usr/lib/ \
    && ldconfig \
    && rm -rf onnxruntime-linux-x64-1.21.0* \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -d /app -s /bin/bash brain

WORKDIR /app

# Copy the compiled binary
COPY --from=builder --chown=brain:brain /build/apps/test-brain/dist/test-brain /app/brain

# Copy all node_modules from builder
COPY --from=builder --chown=brain:brain /build/node_modules /app/node_modules

# Switch to non-root user
USER brain

# Expose port
EXPOSE 3333

# Run the compiled binary
CMD ["/app/brain"]