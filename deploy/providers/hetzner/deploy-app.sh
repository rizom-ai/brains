#!/usr/bin/env bash
# Application deployment script for Hetzner servers
# This handles Docker, docker-compose, and Caddy deployment after infrastructure is created

set -euo pipefail

# Get the directory where this script is located
PROVIDER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common utilities
LOG_PREFIX="DEPLOY" source "$PROVIDER_DIR/../../scripts/lib/common.sh"

# Script arguments
SERVER_IP="${1:-}"
APP_NAME="${2:-}"
DOCKER_IMAGE="${3:-}"
ENV_FILE="${4:-}"
DOMAIN="${5:-}"
REGISTRY_USER="${6:-}"
REGISTRY_TOKEN="${7:-}"

# Validate arguments
if [ -z "$SERVER_IP" ] || [ -z "$APP_NAME" ] || [ -z "$DOCKER_IMAGE" ] || [ -z "$ENV_FILE" ]; then
    log_error "Usage: $0 <server-ip> <app-name> <docker-image> <env-file> [domain] [registry-user] [registry-token]"
    exit 1
fi

# SSH options for connection
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
SSH_CMD="ssh $SSH_OPTS root@$SERVER_IP"
SCP_CMD="scp $SSH_OPTS"

# Application directories on server
APP_DIR="/opt/personal-brain"
DATA_DIR="$APP_DIR/data"

# Wait for server to be ready
wait_for_server() {
    log_info "Waiting for server to be ready..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if $SSH_CMD "echo 'SSH ready'" &> /dev/null; then
            log_info "✅ Server is ready"
            return 0
        fi

        attempt=$((attempt + 1))
        log_info "Waiting for SSH... (attempt $attempt/$max_attempts)"
        sleep 10
    done

    log_error "Server failed to become ready"
    exit 1
}

# Install Docker on the server
install_docker() {
    log_step "Installing Docker"

    $SSH_CMD << 'EOF'
# Update system
apt-get update -qq

# Install Docker prerequisites
apt-get install -y -qq curl ca-certificates gnupg lsb-release

# Add Docker GPG key (handle TTY issues)
install -m 0755 -d /etc/apt/keyrings
export DEBIAN_FRONTEND=noninteractive
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
systemctl start docker
systemctl enable docker

echo "Docker installed successfully"
EOF
}

# Setup application directories and user
setup_app_environment() {
    log_step "Setting up application environment"

    $SSH_CMD << EOF
# Create dedicated user for the app
useradd -r -m -d $APP_DIR -s /bin/false personal-brain || true

# Create data directories with correct ownership
mkdir -p $DATA_DIR $APP_DIR/brain-repo $APP_DIR/website $APP_DIR/matrix-storage $APP_DIR/brain-data $APP_DIR/site-production $APP_DIR/site-preview
chown -R personal-brain:personal-brain $APP_DIR

# Create docker network
docker network create personal-brain-net || true

echo "Application environment ready"
EOF
}

# Pull Docker image
pull_docker_image() {
    log_step "Pulling Docker image"

    # Extract registry info from image name
    if [[ "$DOCKER_IMAGE" == ghcr.io/* ]]; then
        REGISTRY="ghcr.io"
        REGISTRY_USER=$(echo "$DOCKER_IMAGE" | cut -d'/' -f2)
    elif [[ "$DOCKER_IMAGE" == */* ]]; then
        # Docker Hub or other registry
        REGISTRY="docker.io"
        REGISTRY_USER=$(echo "$DOCKER_IMAGE" | cut -d'/' -f1)
    fi

    # Registry token is passed as argument, no need to extract from env file

    $SSH_CMD << EOF
set -e
echo "Pulling image: $DOCKER_IMAGE"

# Login to registry if credentials are available
if [ -n "${REGISTRY_TOKEN:-}" ]; then
    if [ "$REGISTRY" = "ghcr.io" ]; then
        echo "$REGISTRY_TOKEN" | docker login ghcr.io -u "$REGISTRY_USER" --password-stdin
    elif [ "$REGISTRY" = "docker.io" ]; then
        echo "$REGISTRY_TOKEN" | docker login -u "$REGISTRY_USER" --password-stdin
    fi
fi

# Pull the image
docker pull "$DOCKER_IMAGE"

# Verify image was pulled
docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${DOCKER_IMAGE}$" || {
    echo "ERROR: Image not found after pull"
    exit 1
}

# Logout from registry
docker logout || true
EOF
}

# Deploy application files
deploy_app_files() {
    log_step "Deploying application files"

    # Copy environment file
    log_info "Copying environment file..."
    $SCP_CMD "$ENV_FILE" "root@$SERVER_IP:$APP_DIR/.env"

    # Copy memory monitor script
    log_info "Copying memory monitor script..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts"
    if [ -f "$SCRIPT_DIR/memory-monitor.sh" ]; then
        $SCP_CMD "$SCRIPT_DIR/memory-monitor.sh" "root@$SERVER_IP:$APP_DIR/memory-monitor.sh"
        $SSH_CMD "chmod +x $APP_DIR/memory-monitor.sh"
        log_info "Memory monitor script deployed to $APP_DIR/memory-monitor.sh"
        log_info "To enable: Add to crontab: 0 */6 * * * $APP_DIR/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1"
    fi

    # Create docker-compose.yml from template
    log_info "Creating docker-compose.yml..."

    # Get the user and group IDs first
    USER_ID=$($SSH_CMD "id -u personal-brain")
    GROUP_ID=$($SSH_CMD "id -g personal-brain")

    # Path to templates
    TEMPLATE_DIR="$PROVIDER_DIR/templates"

    if [ -n "$DOMAIN" ]; then
        # With domain - use Caddy for SSL
        sed -e "s|\${DOCKER_IMAGE}|$DOCKER_IMAGE|g" \
            -e "s|\${APP_DIR}|$APP_DIR|g" \
            -e "s|\${DATA_DIR}|$DATA_DIR|g" \
            -e "s|\${USER_ID}|$USER_ID|g" \
            -e "s|\${GROUP_ID}|$GROUP_ID|g" \
            "$TEMPLATE_DIR/docker-compose-with-caddy.yml.template" | $SSH_CMD "cat > $APP_DIR/docker-compose.yml"

        # Create Caddyfile from template
        log_info "Creating Caddyfile from template..."

        # Check if preview is configured in env file
        PREVIEW_DOMAIN=$(grep -E "^PREVIEW_DOMAIN=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "")

        CADDY_TEMPLATE="$TEMPLATE_DIR/Caddyfile.template"
        PREVIEW_TEMPLATE="$TEMPLATE_DIR/Caddyfile-preview.template"

        # Generate Caddyfile from template
        sed "s|{{domain}}|$DOMAIN|g" "$CADDY_TEMPLATE" | $SSH_CMD "cat > $APP_DIR/Caddyfile"

        # Add preview block only if configured
        if [ -n "$PREVIEW_DOMAIN" ]; then
            log_info "Preview environment detected, adding preview subdomain..."
            sed "s|{{preview_domain}}|$PREVIEW_DOMAIN|g" "$PREVIEW_TEMPLATE" | $SSH_CMD "cat >> $APP_DIR/Caddyfile"
        fi
    else
        # Without domain - direct port access
        sed -e "s|\${DOCKER_IMAGE}|$DOCKER_IMAGE|g" \
            -e "s|\${APP_DIR}|$APP_DIR|g" \
            -e "s|\${DATA_DIR}|$DATA_DIR|g" \
            -e "s|\${USER_ID}|$USER_ID|g" \
            -e "s|\${GROUP_ID}|$GROUP_ID|g" \
            "$TEMPLATE_DIR/docker-compose-standalone.yml.template" | $SSH_CMD "cat > $APP_DIR/docker-compose.yml"
    fi
}

# Start containers
start_containers() {
    log_step "Starting containers"

    $SSH_CMD << EOF
cd $APP_DIR

# Stop any existing containers
docker compose down || true

# Start new containers
docker compose up -d

# Wait for services to be ready
sleep 5

# Show status
docker compose ps

echo "Containers started successfully"
EOF
}

# Main deployment flow
main() {
    log_step "Deploying $APP_NAME to $SERVER_IP"

    wait_for_server
    install_docker
    setup_app_environment
    pull_docker_image
    deploy_app_files
    start_containers

    # Check if preview is configured (read from env file)
    PREVIEW_DOMAIN=$(grep -E "^PREVIEW_DOMAIN=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" || echo "")

    if [ -n "$DOMAIN" ]; then
        log_info "✅ Deployment complete!"
        log_info "Production site: https://$DOMAIN"
        if [ -n "$PREVIEW_DOMAIN" ]; then
            log_info "Preview site: https://$PREVIEW_DOMAIN"
        fi
        log_info "MCP API: https://$DOMAIN/mcp"
        log_info ""
        log_info "API requires Bearer token authentication if MCP_AUTH_TOKEN is set"
    else
        log_info "✅ Deployment complete!"
        log_info "MCP API: http://$SERVER_IP:3333/mcp"
        log_info "Production site: http://$SERVER_IP:8080"
        if [ -n "$PREVIEW_DOMAIN" ]; then
            log_info "Preview site: http://$SERVER_IP:4321"
        fi
        log_info ""
        log_info "API requires Bearer token authentication if MCP_AUTH_TOKEN is set"
    fi
}

main