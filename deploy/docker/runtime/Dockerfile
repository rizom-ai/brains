# Runtime container for Personal Brain
# Uses minimal Debian image for running compiled Bun binaries
FROM debian:bullseye-slim

# Download ONNX Runtime library first
ADD https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-1.21.0.tgz /tmp/onnxruntime.tgz

# Install runtime dependencies and ONNX Runtime in one layer
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    git \
    && cd /tmp && tar -xzf onnxruntime.tgz \
    && cp onnxruntime-linux-x64-1.21.0/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so.1.21.0 \
    && ln -s /usr/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so.1 \
    && ln -s /usr/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so \
    && rm -rf /tmp/onnxruntime* \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -r -s /bin/false -d /app personal-brain

# Create necessary directories
RUN mkdir -p /app/data /app/brain-repo /app/website /app/brain-data \
    && chown -R personal-brain:personal-brain /app

# Set working directory
WORKDIR /app

# Copy the compiled binary and wrapper
COPY --chown=personal-brain:personal-brain brain /app/brain
COPY --chown=personal-brain:personal-brain brain-wrapper.sh /app/brain-wrapper.sh

# Copy package.json for native module installation
COPY --chown=personal-brain:personal-brain package.json /app/package.json

# Make executables
RUN chmod +x /app/brain /app/brain-wrapper.sh

# Pre-install native modules for faster startup
# Install bun in the runtime image for dependency installation
RUN curl -fsSL https://bun.sh/install | bash && \
    /root/.bun/bin/bun install --production --cwd /app && \
    rm -rf /root/.bun && \
    chown -R personal-brain:personal-brain /app/node_modules

# Copy default environment file
COPY --chown=personal-brain:personal-brain .env.example /app/.env

# Switch to non-root user
USER personal-brain

# Expose the MCP server port
EXPOSE 3333

# Set environment variables
ENV DATABASE_URL="file:/app/data/brain.db"
ENV DATA_DIR="/app/data"
ENV BRAIN_REPO_PATH="/app/brain-repo"
ENV PUBLIC_WEBSITE_PATH="/app/website"
ENV NODE_ENV="production"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3333/health || exit 1

# Start the application using wrapper
CMD ["/app/brain-wrapper.sh"]