#!/usr/bin/env bash
# Docker and registry utilities

# Source common utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

# Determine Docker image name based on registry
get_docker_image_name() {
    local app_name="$1"
    local registry="${2:-}"
    local tag="${3:-latest}"
    local user="${REGISTRY_USER:-$USER}"
    
    if [ -z "$registry" ]; then
        echo "personal-brain-$app_name:$tag"
        return
    fi
    
    # Handle different registry formats
    case "$registry" in
        ghcr.io)
            echo "$registry/$user/personal-brain-$app_name:$tag"
            ;;
        docker.io)
            echo "$user/personal-brain-$app_name:$tag"
            ;;
        ghcr.io/*)
            # Already includes username
            echo "$registry/personal-brain-$app_name:$tag"
            ;;
        */*)
            # Other registries with namespace
            echo "$registry/personal-brain-$app_name:$tag"
            ;;
        *)
            # Just registry URL
            echo "$registry/personal-brain-$app_name:$tag"
            ;;
    esac
}

# Authenticate with Docker registry
authenticate_docker_registry() {
    local registry="${1:-}"
    local user="${REGISTRY_USER:-}"
    local token="${REGISTRY_TOKEN:-}"
    
    if [ -z "$registry" ] || [ -z "$token" ]; then
        log_debug "No registry authentication configured"
        return 0
    fi
    
    case "$registry" in
        ghcr.io*)
            log_info "Logging into GitHub Container Registry..."
            echo "$token" | docker login ghcr.io -u "$user" --password-stdin
            ;;
        docker.io*|hub.docker.com*)
            log_info "Logging into Docker Hub..."
            echo "$token" | docker login -u "$user" --password-stdin
            ;;
        *)
            log_warn "Unknown registry type: $registry"
            if [ -n "$user" ] && [ -n "$token" ]; then
                echo "$token" | docker login "$registry" -u "$user" --password-stdin
            fi
            ;;
    esac
}

# Build Docker image
build_docker_image() {
    local dockerfile="$1"
    local context="$2"
    local image_name="$3"
    local build_args=("${@:4}")
    
    log_info "Building Docker image: $image_name"
    log_debug "Dockerfile: $dockerfile"
    log_debug "Context: $context"
    
    local cmd=(env DOCKER_BUILDKIT=1 docker build -f "$dockerfile" -t "$image_name")
    
    # Add any build args
    for arg in "${build_args[@]}"; do
        cmd+=(--build-arg "$arg")
    done
    
    cmd+=("$context")
    
    if ! "${cmd[@]}"; then
        log_error "Docker build failed"
        return 1
    fi
    
    log_info "Docker image built successfully: $image_name"
}

# Push Docker image to registry
push_docker_image() {
    local image_name="$1"
    local registry="${2:-}"
    
    if [ -z "$registry" ]; then
        log_warn "No registry specified, skipping push"
        return 0
    fi
    
    # Authenticate if needed
    authenticate_docker_registry "$registry"
    
    log_info "Pushing image: $image_name"
    if docker push "$image_name"; then
        log_info "Image pushed successfully"
        
        # Get image digest
        local digest=$(docker inspect "$image_name" --format='{{index .RepoDigests 0}}' 2>/dev/null || true)
        if [ -n "$digest" ]; then
            log_info "Image digest: ${digest#*@}"
        fi
    else
        log_error "Failed to push image"
        return 1
    fi
}

# Check if Docker is available
ensure_docker() {
    if ! command_exists docker; then
        log_error "Docker is not installed"
        log_info "Please install Docker: https://docs.docker.com/get-docker/"
        return 1
    fi
    
    if ! docker ps &>/dev/null; then
        log_error "Docker daemon is not running or you don't have permissions"
        log_info "Try: sudo usermod -aG docker $USER"
        return 1
    fi
}

# Clean up Docker resources
cleanup_docker() {
    local app_name="${1:-}"
    
    if [ -n "$app_name" ]; then
        # Stop and remove specific container
        docker stop "personal-brain-$app_name" 2>/dev/null || true
        docker rm "personal-brain-$app_name" 2>/dev/null || true
    else
        # Clean up dangling images
        docker image prune -f
    fi
}

# Export functions
export -f get_docker_image_name authenticate_docker_registry build_docker_image
export -f push_docker_image ensure_docker cleanup_docker