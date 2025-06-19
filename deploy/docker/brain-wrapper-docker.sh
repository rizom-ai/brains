#!/usr/bin/env bash
# Docker-specific wrapper script for Personal Brain

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set NODE_PATH to include our modules
export NODE_PATH="$SCRIPT_DIR/node_modules:$NODE_PATH"

# Ensure data directory exists
mkdir -p /app/data

# Install dependencies if package.json exists and node_modules doesn't
if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing dependencies for migrations..."
    cd "$SCRIPT_DIR"
    bun install --production || {
        echo "WARNING: Failed to install dependencies"
    }
fi

# Run migrations if migrate.ts exists
if [ -f "$SCRIPT_DIR/migrate.ts" ] && command -v bun >/dev/null 2>&1; then
    echo "Running database migrations..."
    cd "$SCRIPT_DIR"
    # Set migration folder path - default to ./drizzle for Docker
    export DRIZZLE_MIGRATION_FOLDER="${DRIZZLE_MIGRATION_FOLDER:-./drizzle}"
    DATABASE_URL="file:/app/data/brain.db" bun migrate.ts || {
        echo "WARNING: Migration failed, but continuing anyway"
        # Continue anyway as the database might already be migrated
    }
fi

# Execute the binary from its directory
cd "$SCRIPT_DIR"
exec "./brain" "$@"