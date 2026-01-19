#!/usr/bin/env bash
# Docker provider deployment script
# This implements the standard provider interface for Docker deployments

set -euo pipefail

# Source common utilities
PROVIDER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_PREFIX="DOCKER" source "$PROVIDER_DIR/../../scripts/lib/common.sh"

# Required environment variables from deploy-brain.sh:
# - APP_NAME: Name of the app to deploy
# - DEPLOY_ACTION: deploy|update|destroy|status
# - PROJECT_ROOT: Root of the project
# - APP_SERVICE_NAME: Service name
# - APP_BINARY_NAME: Binary name
# - APP_INSTALL_PATH: Install path
# - APP_DEFAULT_PORT: Default port

# Docker-specific configuration
DOCKER_DEPLOY_SCRIPT="$PROJECT_ROOT/deploy/scripts/deploy-docker.sh"
DOCKER_CONFIG_FILE="$PROJECT_ROOT/deploy/providers/docker/config.env"

# Load Docker configuration if exists
if [ -f "$DOCKER_CONFIG_FILE" ]; then
    source "$DOCKER_CONFIG_FILE"
fi

# Get additional arguments (server address)
# The deploy-brain.sh script passes: app-name provider action [additional-args]
# We need to extract the server from additional args
SERVER="${DOCKER_SERVER:-}"

# Parse remaining arguments
for arg in "$@"; do
    case "$arg" in
        --server=*)
            SERVER="${arg#*=}"
            ;;
        *)
            # If no --server flag, assume first extra arg is server
            if [ -z "$SERVER" ] && [ "$arg" != "$APP_NAME" ] && [ "$arg" != "docker" ] && [ "$arg" != "$DEPLOY_ACTION" ]; then
                SERVER="$arg"
            fi
            ;;
    esac
done

# Default to local if no server specified
SERVER="${SERVER:-local}"

# Helper function to check Docker availability
check_docker() {
    if [ "$SERVER" = "local" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker is not installed locally"
            exit 1
        fi
    else
        if ! ssh -o ConnectTimeout=5 "$SERVER" "command -v docker" &> /dev/null; then
            log_error "Docker is not installed on $SERVER"
            exit 1
        fi
    fi
}

# Deploy action
deploy_docker() {
    log_step "Deploying $APP_NAME to Docker"
    
    check_docker
    
    # Use the existing Docker deployment script
    if [ -f "$DOCKER_DEPLOY_SCRIPT" ]; then
        exec "$DOCKER_DEPLOY_SCRIPT" "$APP_NAME" "$SERVER" ${DOCKER_REGISTRY:+--registry "$DOCKER_REGISTRY"} ${DOCKER_TAG:+--tag "$DOCKER_TAG"}
    else
        log_error "Docker deployment script not found: $DOCKER_DEPLOY_SCRIPT"
        exit 1
    fi
}

# Update action (same as deploy for Docker)
update_docker() {
    log_step "Updating $APP_NAME Docker deployment"
    deploy_docker
}

# Destroy action
destroy_docker() {
    log_step "Destroying $APP_NAME Docker deployment"
    
    check_docker
    
    if [ "$SERVER" = "local" ]; then
        log_info "Stopping and removing local containers..."
        docker-compose -p "$APP_SERVICE_NAME" down 2>/dev/null || docker stop "$APP_SERVICE_NAME" 2>/dev/null || true
        docker rm "$APP_SERVICE_NAME" 2>/dev/null || true
        log_info "✅ Local deployment removed"
    else
        log_info "Stopping and removing containers on $SERVER..."
        ssh "$SERVER" "cd ~ && docker-compose down 2>/dev/null || docker stop $APP_SERVICE_NAME 2>/dev/null || true"
        ssh "$SERVER" "docker rm $APP_SERVICE_NAME 2>/dev/null || true"
        log_info "✅ Remote deployment removed"
    fi
}

# Status action
status_docker() {
    log_step "Docker Deployment Status"
    
    log_info "App: $APP_NAME"
    log_info "Server: $SERVER"
    
    if [ "$SERVER" = "local" ]; then
        # Check local Docker
        if docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "$APP_SERVICE_NAME"; then
            log_info "Container Status:"
            docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "$APP_SERVICE_NAME"
            
            # Get logs preview
            log_info "Recent logs:"
            docker logs --tail 10 "$APP_SERVICE_NAME" 2>&1 || true
        else
            log_warn "No container found for $APP_SERVICE_NAME"
        fi
    else
        # Check remote Docker
        if ssh -o ConnectTimeout=5 "$SERVER" "docker ps -a" &> /dev/null; then
            log_info "Server: ✅ Reachable"
            
            # Check container
            if ssh "$SERVER" "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -q $APP_SERVICE_NAME"; then
                log_info "Container Status:"
                ssh "$SERVER" "docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep $APP_SERVICE_NAME"
                
                # Get logs preview
                log_info "Recent logs:"
                ssh "$SERVER" "docker logs --tail 10 $APP_SERVICE_NAME 2>&1" || true
            else
                log_warn "No container found for $APP_SERVICE_NAME"
            fi
        else
            log_error "Server: ❌ Not reachable"
        fi
    fi
}

# Main execution based on action
case "$DEPLOY_ACTION" in
    deploy)
        deploy_docker
        ;;
    update)
        update_docker
        ;;
    destroy)
        destroy_docker
        ;;
    status)
        status_docker
        ;;
    *)
        log_error "Unknown action: $DEPLOY_ACTION"
        exit 1
        ;;
esac