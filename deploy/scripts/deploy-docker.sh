#!/usr/bin/env bash
# Docker deployment script for Personal Brain apps
# This script handles Docker-based deployments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}==>${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "turbo.json" ]; then
    log_error "This script must be run from the project root"
    exit 1
fi

PROJECT_ROOT=$(pwd)
DOCKER_DIR="$PROJECT_ROOT/deploy/docker"

# Usage
usage() {
    echo "Usage: $0 <app-name> <server> [options]"
    echo ""
    echo "Arguments:"
    echo "  app-name    Name of the app to deploy (e.g., test-brain)"
    echo "  server      Server address (user@host or host)"
    echo ""
    echo "Options:"
    echo "  --registry <url>    Docker registry URL (default: local transfer)"
    echo "  --tag <tag>         Docker image tag (default: latest)"
    echo "  --no-build          Skip building, use existing image"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 test-brain deploy@192.168.1.100"
    echo "  $0 test-brain server.example.com --registry ghcr.io/myorg"
    exit 1
}

# Parse arguments
if [ $# -lt 2 ]; then
    usage
fi

APP_NAME="$1"
SERVER="$2"
shift 2

# Default options
REGISTRY=""
TAG="latest"
SKIP_BUILD=false

# Parse options
while [ $# -gt 0 ]; do
    case "$1" in
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --no-build)
            SKIP_BUILD=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate app exists
APP_DIR="$PROJECT_ROOT/apps/$APP_NAME"
if [ ! -d "$APP_DIR" ]; then
    log_error "App '$APP_NAME' not found in apps/"
    exit 1
fi

# Load app configuration
DEPLOY_CONFIG="$APP_DIR/deploy/deploy.config.json"
if [ ! -f "$DEPLOY_CONFIG" ]; then
    log_error "Deploy config not found: $DEPLOY_CONFIG"
    exit 1
fi

# Extract configuration
BINARY_NAME=$(jq -r '.binaryName' "$DEPLOY_CONFIG")
SERVICE_NAME=$(jq -r '.serviceName' "$DEPLOY_CONFIG")
INSTALL_PATH=$(jq -r '.installPath' "$DEPLOY_CONFIG")
DEFAULT_PORT=$(jq -r '.defaultPort' "$DEPLOY_CONFIG")

# Image naming
if [ -n "$REGISTRY" ]; then
    IMAGE_NAME="$REGISTRY/$SERVICE_NAME:$TAG"
else
    IMAGE_NAME="$SERVICE_NAME:$TAG"
fi

# Build Docker image
build_docker_image() {
    log_step "Building Docker image for $APP_NAME"
    
    # First, build the release
    log_info "Building release binary..."
    # Always use Docker build for Docker deployments to ensure compatibility
    "$PROJECT_ROOT/scripts/build-release.sh" "$APP_NAME" linux-x64 --docker
    
    # Find the latest release
    RELEASE_TAR=$(ls -t "$APP_DIR/dist/"*.tar.gz | head -1)
    if [ ! -f "$RELEASE_TAR" ]; then
        log_error "No release tarball found"
        exit 1
    fi
    
    # Extract release to temp directory
    TEMP_BUILD=$(mktemp -d)
    log_info "Extracting release..."
    tar -xzf "$RELEASE_TAR" -C "$TEMP_BUILD"
    
    # Find extracted directory
    RELEASE_DIR=$(ls -d "$TEMP_BUILD"/*/ | head -1)
    
    # Copy required files for Docker build
    cp "$RELEASE_DIR/$BINARY_NAME" "$DOCKER_DIR/brain"
    cp "$RELEASE_DIR/${BINARY_NAME}-wrapper.sh" "$DOCKER_DIR/brain-wrapper.sh"
    cp "$RELEASE_DIR/package.json" "$DOCKER_DIR/"
    
    # Copy production environment file if it exists
    if [ -f "$APP_DIR/deploy/.env.production" ]; then
        cp "$APP_DIR/deploy/.env.production" "$DOCKER_DIR/.env.production"
    else
        log_warn "No .env.production found at $APP_DIR/deploy/.env.production"
        # Create empty .env.production so Docker build doesn't fail
        touch "$DOCKER_DIR/.env.production"
    fi
    
    # Debug: Check files before Docker build
    log_info "Files in Docker directory before build:"
    ls -la "$DOCKER_DIR" | grep -E "brain|package.json|.env" || true
    
    # Build Docker image
    log_info "Building Docker image: $IMAGE_NAME"
    docker build -f "$DOCKER_DIR/Dockerfile.standalone" -t "$IMAGE_NAME" "$DOCKER_DIR" || {
        # Clean up on failure
        rm -rf "$TEMP_BUILD"
        rm -f "$DOCKER_DIR/brain" "$DOCKER_DIR/brain-wrapper.sh" "$DOCKER_DIR/package.json" "$DOCKER_DIR/.env.production"
        exit 1
    }
    
    # Clean up after successful build
    rm -rf "$TEMP_BUILD"
    rm -f "$DOCKER_DIR/brain" "$DOCKER_DIR/brain-wrapper.sh" "$DOCKER_DIR/package.json" "$DOCKER_DIR/.env.production"
    
    log_info "✅ Docker image built successfully"
}

# Transfer image to server
transfer_image() {
    # Skip transfer for local deployments
    if [ "$SERVER" = "local" ]; then
        log_info "Local deployment - image already available"
        return
    fi
    
    log_step "Transferring Docker image to server"
    
    if [ -n "$REGISTRY" ]; then
        # Push to registry
        log_info "Pushing image to registry..."
        docker push "$IMAGE_NAME"
        
        # Pull on server
        log_info "Pulling image on server..."
        ssh "$SERVER" "docker pull $IMAGE_NAME"
    else
        # Save and transfer directly
        log_info "Saving image locally..."
        docker save "$IMAGE_NAME" | gzip > "/tmp/${SERVICE_NAME}-${TAG}.tar.gz"
        
        log_info "Transferring image to server..."
        scp "/tmp/${SERVICE_NAME}-${TAG}.tar.gz" "$SERVER:~/"
        
        log_info "Loading image on server..."
        ssh "$SERVER" "gunzip -c ~/${SERVICE_NAME}-${TAG}.tar.gz | docker load && rm ~/${SERVICE_NAME}-${TAG}.tar.gz"
        
        rm -f "/tmp/${SERVICE_NAME}-${TAG}.tar.gz"
    fi
    
    log_info "✅ Image transferred successfully"
}

# Deploy on server
deploy_on_server() {
    log_step "Deploying application on server"
    
    if [ "$SERVER" = "local" ]; then
        # Local deployment
        log_info "Deploying locally..."
        
        # Stop existing container if running
        if docker ps -a --format '{{.Names}}' | grep -q "^${SERVICE_NAME}$"; then
            log_info "Stopping existing container..."
            docker stop "$SERVICE_NAME" || true
            docker rm "$SERVICE_NAME" || true
        fi
        
        # Create local directories
        mkdir -p "$HOME/personal-brain-data/data"
        mkdir -p "$HOME/personal-brain-data/brain-repo"
        mkdir -p "$HOME/personal-brain-data/website"
        mkdir -p "$HOME/personal-brain-data/matrix-storage"
        
        # Run container locally
        log_info "Starting container..."
        docker run -d \
            --name "$SERVICE_NAME" \
            --restart unless-stopped \
            -p "$DEFAULT_PORT:3333" \
            -v "$HOME/personal-brain-data/data:/app/data" \
            -v "$HOME/personal-brain-data/brain-repo:/app/brain-repo" \
            -v "$HOME/personal-brain-data/website:/app/website" \
            -v "$HOME/personal-brain-data/matrix-storage:/app/.matrix-storage" \
            -e NODE_ENV=production \
            --user "$(id -u):$(id -g)" \
            "$IMAGE_NAME"
        
        # Show status
        sleep 2
        docker ps --filter "name=$SERVICE_NAME"
        
        log_info "✅ Local deployment complete!"
        log_info "Access the service at: http://localhost:$DEFAULT_PORT"
        return
    fi
    
    # Remote deployment
    # Create deployment directory
    ssh "$SERVER" "sudo mkdir -p $INSTALL_PATH/{data,brain-repo,website} && sudo chmod 755 $INSTALL_PATH"
    
    # Create docker-compose.yml
    log_info "Creating docker-compose configuration..."
    ssh "$SERVER" "cat > ~/docker-compose.yml" << EOF
version: '3.8'

services:
  $SERVICE_NAME:
    image: $IMAGE_NAME
    container_name: $SERVICE_NAME
    restart: unless-stopped
    ports:
      - "$DEFAULT_PORT:3333"
    volumes:
      - $INSTALL_PATH/data:/app/data
      - $INSTALL_PATH/brain-repo:/app/brain-repo
      - $INSTALL_PATH/website:/app/website
      - $INSTALL_PATH/.env:/app/.env:ro
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3333/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
EOF
    
    # Environment file is already baked into the Docker image
    # If you need to override it, mount a different .env file in docker-compose.yml
    
    # Start the service
    log_info "Starting service..."
    ssh "$SERVER" "cd ~ && docker-compose up -d"
    
    # Wait for health check
    log_info "Waiting for service to be healthy..."
    sleep 10
    
    # Check status
    ssh "$SERVER" "docker-compose ps"
    
    log_info "✅ Deployment complete!"
    log_info ""
    log_info "Service is running at: http://${SERVER#*@}:$DEFAULT_PORT"
    log_info "View logs: ssh $SERVER 'docker-compose logs -f'"
}

# Main execution
main() {
    log_step "Docker Deployment: $APP_NAME → $SERVER"
    
    # Check Docker availability
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Build image (unless skipped)
    if [ "$SKIP_BUILD" = false ]; then
        build_docker_image
    else
        log_info "Skipping build, using existing image: $IMAGE_NAME"
    fi
    
    # Transfer image
    transfer_image
    
    # Deploy
    deploy_on_server
    
    log_info ""
    log_info "🎉 Docker deployment completed successfully!"
}

# Run main
main