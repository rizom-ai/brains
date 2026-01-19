#!/usr/bin/env bash
# Build production Docker image using pre-built bundle
#
# Usage: ./build-docker-image.sh <app-name> [tag]
# Example: ./build-docker-image.sh team-brain latest

set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_PREFIX="BUILD" source "$SCRIPT_DIR/lib/common.sh"

# Arguments
APP_NAME="${1:-}"
TAG="${2:-latest}"

if [ -z "$APP_NAME" ]; then
    log_error "Usage: $0 <app-name> [tag]"
    log_error "Example: $0 team-brain latest"
    exit 1
fi

# Find project root (directory containing bun.lock)
PROJECT_ROOT="$SCRIPT_DIR/../.."
cd "$PROJECT_ROOT"

if [ ! -f "bun.lock" ]; then
    log_error "Could not find project root (no bun.lock)"
    exit 1
fi

APP_DIR="apps/$APP_NAME"
if [ ! -d "$APP_DIR" ]; then
    log_error "App directory not found: $APP_DIR"
    exit 1
fi

log_step "Building $APP_NAME"

# Step 1: Build the app bundle
log_info "Building app bundle for $APP_DIR..."
cd "$APP_DIR"
# Call the build script directly (avoid relying on bin linking)
bun "$PROJECT_ROOT/shell/app/scripts/build.ts"
cd "$PROJECT_ROOT"

# Step 2: Prepare build context
log_info "Preparing Docker build context..."
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

# Copy dist folder
cp -r "$APP_DIR/dist" "$BUILD_DIR/"

# Copy seed-content if it exists (also copied by build script, but ensure it's in context root)
if [ -d "$APP_DIR/dist/seed-content" ]; then
    cp -r "$APP_DIR/dist/seed-content" "$BUILD_DIR/"
elif [ -d "$APP_DIR/seed-content" ]; then
    cp -r "$APP_DIR/seed-content" "$BUILD_DIR/"
else
    # Create empty seed-content to avoid COPY failure
    mkdir -p "$BUILD_DIR/seed-content"
fi

# Copy Dockerfile and package.json
cp deploy/docker/Dockerfile.prod "$BUILD_DIR/Dockerfile"
cp deploy/docker/package.prod.json "$BUILD_DIR/package.json"

# Step 3: Build Docker image
log_step "Building Docker Image"
log_info "Image: personal-brain-$APP_NAME:$TAG"

docker build -t "personal-brain-$APP_NAME:$TAG" "$BUILD_DIR"

log_info "Build complete: personal-brain-$APP_NAME:$TAG"
