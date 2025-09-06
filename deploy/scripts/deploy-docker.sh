#!/usr/bin/env bash
# Simplified Docker deployment script

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/docker.sh"
source "$SCRIPT_DIR/lib/platform.sh"

# Set error handling
set_error_trap cleanup_on_error

# Global variables
LOCAL_IMAGE_NAME=""
REGISTRY_IMAGE_NAME=""

# Cleanup function
cleanup_on_error() {
    # No cleanup needed with simplified approach
    :
}

# Usage
usage() {
    cat << EOF
Usage: $0 <app-name> [server] [options]

Arguments:
  app-name    Name of the app to deploy
  server      Target server (optional, defaults to local)

Options:
  --registry <url>    Docker registry URL (e.g., ghcr.io/username)
  --tag <tag>         Docker image tag (default: latest)
  --no-build          Skip building, use existing image
  --push-only         Only push to registry, don't deploy
  --help              Show this help message
  --debug             Enable debug output

Examples:
  $0 test-brain                                    # Local deployment
  $0 test-brain user@server                        # Remote deployment
  $0 test-brain --registry ghcr.io/myuser         # Build and push to registry
  $0 test-brain user@server --registry ghcr.io/myuser --tag v1.0.0

EOF
    exit 1
}

# Parse arguments
if [ $# -lt 1 ] || [ "$1" = "--help" ]; then
    usage
fi

APP_NAME="$1"
SERVER="${2:-local}"
shift  # Remove app name
if [ -n "$SERVER" ] && [[ "$SERVER" != --* ]]; then
    shift  # Remove server if it's not an option
fi

# Default options
REGISTRY=""
TAG="latest"
SKIP_BUILD=false
PUSH_ONLY=false

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
        --push-only)
            PUSH_ONLY=true
            shift
            ;;
        --debug)
            export DEBUG=1
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Ensure we're in project root
ensure_project_root

# Load app configuration
load_app_config "$APP_NAME"

# Set image names
LOCAL_IMAGE_NAME="personal-brain-$APP_NAME:$TAG"
REGISTRY_IMAGE_NAME=$(get_docker_image_name "$APP_NAME" "$REGISTRY" "$TAG")

# Build Docker image
build_image() {
    log_step "Building Docker image"
    
    # With the new simplified Dockerfile, we don't need to build releases
    # or prepare complex build directories
    log_info "Building Docker image for $APP_NAME..."
    
    # Build Docker image using the new simple Dockerfile
    if ! docker build \
        -f "deploy/docker-v2/Dockerfile.simple" \
        --build-arg APP_NAME="$APP_NAME" \
        -t "$LOCAL_IMAGE_NAME" \
        . ; then
        log_error "Docker build failed"
        return 1
    fi
    
    log_info "Docker image built: $LOCAL_IMAGE_NAME"
    
    # Tag for registry if needed
    if [ -n "$REGISTRY" ] && [ "$LOCAL_IMAGE_NAME" != "$REGISTRY_IMAGE_NAME" ]; then
        log_info "Tagging for registry: $REGISTRY_IMAGE_NAME"
        docker tag "$LOCAL_IMAGE_NAME" "$REGISTRY_IMAGE_NAME"
    fi
}

# Deploy locally
deploy_local() {
    log_step "Deploying locally"
    
    # Stop existing container
    cleanup_docker "$APP_NAME"
    
    # Create directories
    mkdir -p "$HOME/personal-brain-data/"{data,brain-repo,website,matrix-storage,brain-data}
    
    # Get environment file
    local env_file="$APP_DIR/deploy/.env.production"
    [ ! -f "$env_file" ] && env_file="$APP_DIR/deploy/.env.production.example"
    
    # Run container
    log_info "Starting container..."
    docker run -d \
        --name "personal-brain-$APP_NAME" \
        --restart unless-stopped \
        -p "$APP_DEFAULT_PORT:3333" \
        -v "$HOME/personal-brain-data/data:/app/data" \
        -v "$HOME/personal-brain-data/brain-repo:/app/brain-repo" \
        -v "$HOME/personal-brain-data/website:/app/website" \
        -v "$HOME/personal-brain-data/matrix-storage:/app/.matrix-storage" \
        -v "$HOME/personal-brain-data/brain-data:/app/brain-data" \
        -v "$env_file:/app/.env:ro" \
        --user "$(id -u):$(id -g)" \
        "$LOCAL_IMAGE_NAME"
    
    # Check status
    sleep 2
    if docker ps --filter "name=personal-brain-$APP_NAME" --format "table {{.Names}}\t{{.Status}}" | grep -q "Up"; then
        log_info "Container started successfully"
        log_info "Access at: http://localhost:$APP_DEFAULT_PORT"
    else
        log_error "Container failed to start"
        docker logs "personal-brain-$APP_NAME"
        return 1
    fi
}

# Deploy to remote server
deploy_remote() {
    local server="$1"
    
    log_step "Deploying to $server"
    
    # TODO: Implement remote deployment
    # This would use SSH to:
    # 1. Transfer image or pull from registry
    # 2. Create directories
    # 3. Copy environment file
    # 4. Run container
    
    log_error "Remote deployment not yet implemented in v2"
    log_info "Use the original deploy-docker.sh for now"
    return 1
}

# Main execution
main() {
    # Ensure Docker is available
    ensure_docker
    
    # Build image if needed
    if [ "$SKIP_BUILD" = false ]; then
        build_image
    else
        log_info "Using existing image: $REGISTRY_IMAGE_NAME"
    fi
    
    # Push to registry if specified
    if [ -n "$REGISTRY" ]; then
        push_docker_image "$REGISTRY_IMAGE_NAME" "$REGISTRY"
    fi
    
    # Handle push-only mode
    if [ "$PUSH_ONLY" = true ]; then
        log_info "Push-only mode - skipping deployment"
        return 0
    fi
    
    # Deploy
    if [ "$SERVER" = "local" ]; then
        deploy_local
    else
        deploy_remote "$SERVER"
    fi
}

# Run main
main