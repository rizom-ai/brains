# Simple working Dockerfile - just run with Bun, no compilation
FROM oven/bun:1.2.13-debian

# Accept app name as build argument (defaults to test-brain)
ARG APP_NAME=test-brain

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN bun install

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