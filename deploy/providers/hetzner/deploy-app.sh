#!/usr/bin/env bash
# Application deployment script for Hetzner servers
# This handles Docker, docker-compose, and Caddy deployment after infrastructure is created

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[DEPLOY]${NC} $1"; }
log_error() { echo -e "${RED}[DEPLOY]${NC} $1"; }
log_step() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

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
mkdir -p $DATA_DIR $APP_DIR/brain-repo $APP_DIR/website $APP_DIR/matrix-storage $APP_DIR/brain-data
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

    # Create docker-compose.yml
    log_info "Creating docker-compose.yml..."

    # Get the user and group IDs first
    USER_ID=$($SSH_CMD "id -u personal-brain")
    GROUP_ID=$($SSH_CMD "id -g personal-brain")

    if [ -n "$DOMAIN" ]; then
        # With domain - use Caddy for SSL
        cat << EOF | $SSH_CMD "cat > $APP_DIR/docker-compose.yml"
version: '3.8'

services:
  personal-brain:
    image: $DOCKER_IMAGE
    container_name: personal-brain
    restart: unless-stopped
    env_file: $APP_DIR/.env
    user: "$USER_ID:$GROUP_ID"
    volumes:
      - $DATA_DIR:/app/data
      - $APP_DIR/brain-repo:/app/brain-repo
      - $APP_DIR/brain-data:/app/brain-data
      - $APP_DIR/website:/app/apps/shell/dist
      - $APP_DIR/matrix-storage:/app/.matrix-storage
    networks:
      - personal-brain-net
    expose:
      - "3333"
      - "8080"
      - "4321"

  caddy:
    image: caddy:2-alpine
    container_name: personal-brain-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - $APP_DIR/Caddyfile:/etc/caddy/Caddyfile:ro
      - $APP_DIR/caddy-data:/data
      - $APP_DIR/caddy-config:/config
    networks:
      - personal-brain-net
    depends_on:
      - personal-brain

networks:
  personal-brain-net:
    external: true
EOF

        # Create Caddyfile
        log_info "Creating Caddyfile..."
        cat << EOF | $SSH_CMD "cat > $APP_DIR/Caddyfile"
{
    email admin@$DOMAIN
}

# Production site
$DOMAIN {
    reverse_proxy personal-brain:8080

    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}

# Preview site
preview.$DOMAIN {
    reverse_proxy personal-brain:4321

    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}

# MCP API endpoint
mcp.$DOMAIN {
    reverse_proxy personal-brain:3333

    header {
        X-Content-Type-Options "nosniff"
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization, MCP-Session-Id"
    }
}
EOF
    else
        # Without domain - direct port access
        cat << EOF | $SSH_CMD "cat > $APP_DIR/docker-compose.yml"
version: '3.8'

services:
  personal-brain:
    image: $DOCKER_IMAGE
    container_name: personal-brain
    restart: unless-stopped
    env_file: $APP_DIR/.env
    user: "$USER_ID:$GROUP_ID"
    volumes:
      - $DATA_DIR:/app/data
      - $APP_DIR/brain-repo:/app/brain-repo
      - $APP_DIR/brain-data:/app/brain-data
      - $APP_DIR/website:/app/apps/shell/dist
      - $APP_DIR/matrix-storage:/app/.matrix-storage
    ports:
      - "3333:3333"
      - "8080:8080"
      - "4321:4321"
    networks:
      - personal-brain-net

networks:
  personal-brain-net:
    external: true
EOF
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

    if [ -n "$DOMAIN" ]; then
        log_info "✅ Deployment complete!"
        log_info "Production site: https://$DOMAIN"
        log_info "Preview site: https://preview.$DOMAIN"
        log_info "MCP API: https://mcp.$DOMAIN/mcp"
        log_info ""
        log_info "MCP API requires Bearer token authentication if MCP_AUTH_TOKEN is set"
    else
        log_info "✅ Deployment complete!"
        log_info "MCP API: http://$SERVER_IP:3333/mcp"
        log_info "Production site: http://$SERVER_IP:8080"
        log_info "Preview site: http://$SERVER_IP:4321"
        log_info ""
        log_info "MCP API requires Bearer token authentication if MCP_AUTH_TOKEN is set"
    fi
}

main