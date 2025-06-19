#!/usr/bin/env bash
# Hetzner provider deployment script
# This implements the standard provider interface for Hetzner Cloud

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${GREEN}[HETZNER]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[HETZNER]${NC} $1"; }
log_error() { echo -e "${RED}[HETZNER]${NC} $1"; }
log_step() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Required environment variables from generic script:
# - APP_NAME: Name of the app to deploy
# - APP_CONFIG_PATH: Path to app's deploy.config.json
# - DEPLOY_ACTION: deploy|update|destroy|status
# - PROJECT_ROOT: Root of the project
# - SCRIPT_DIR: Scripts directory

# Hetzner-specific configuration
TERRAFORM_DIR="$PROJECT_ROOT/deploy/providers/hetzner/terraform"
HETZNER_CONFIG_FILE="$PROJECT_ROOT/deploy/providers/hetzner/config.env"
DEPLOY_DIR="$PROJECT_ROOT/deploy"

# Load Hetzner configuration if exists
if [ -f "$HETZNER_CONFIG_FILE" ]; then
    source "$HETZNER_CONFIG_FILE"
fi

# Check prerequisites
check_prerequisites() {
    log_step "Checking Hetzner Prerequisites"
    
    # Check for Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform not found!"
        log_info "Install terraform: https://www.terraform.io/downloads"
        exit 1
    fi
    
    # Check for Hetzner token
    if [ -z "${HCLOUD_TOKEN:-}" ]; then
        log_error "HCLOUD_TOKEN not set!"
        log_info "Set your Hetzner Cloud API token:"
        log_info "  export HCLOUD_TOKEN=your-token"
        log_info "  Or create $HETZNER_CONFIG_FILE with:"
        log_info "  HCLOUD_TOKEN=your-token"
        exit 1
    fi
    
    # Check for SSH key - auto-detect if not specified
    if [ -z "${SSH_PUBLIC_KEY_PATH:-}" ]; then
        # Try common SSH key locations in order of preference
        for key_type in id_ed25519.pub id_rsa.pub id_ecdsa.pub; do
            if [ -f "$HOME/.ssh/$key_type" ]; then
                SSH_KEY_PATH="$HOME/.ssh/$key_type"
                SSH_PRIVATE_KEY_PATH="$HOME/.ssh/${key_type%.pub}"
                log_info "Auto-detected SSH key: $SSH_KEY_PATH"
                break
            fi
        done
        
        if [ -z "$SSH_KEY_PATH" ]; then
            log_error "No SSH public key found. Checked for: id_ed25519.pub, id_rsa.pub, id_ecdsa.pub in ~/.ssh/"
            log_error "Generate one with: ssh-keygen -t ed25519"
            exit 1
        fi
    else
        SSH_KEY_PATH="$SSH_PUBLIC_KEY_PATH"
        SSH_PRIVATE_KEY_PATH="${SSH_KEY_PATH%.pub}"
        if [ ! -f "$SSH_KEY_PATH" ]; then
            log_error "SSH public key not found at specified path: $SSH_KEY_PATH"
            exit 1
        fi
    fi
    
    # Verify private key exists
    if [ ! -f "$SSH_PRIVATE_KEY_PATH" ]; then
        log_error "SSH private key not found at: $SSH_PRIVATE_KEY_PATH"
        exit 1
    fi
    
    log_info "✅ Prerequisites checked"
}

# Initialize Terraform
init_terraform() {
    log_info "Initializing Terraform..."
    
    # Create terraform directory if needed
    mkdir -p "$TERRAFORM_DIR"
    
    # Copy terraform files if not present
    if [ ! -f "$TERRAFORM_DIR/main.tf" ]; then
        log_info "Setting up Terraform configuration..."
        # In a real implementation, these would be proper files
        # For now, we'll create them inline
        create_terraform_files
    fi
    
    cd "$TERRAFORM_DIR"
    terraform init
    cd - > /dev/null
}

# Create Terraform configuration files
create_terraform_files() {
    # This would normally copy from templates
    # For now, creating minimal config
    cat > "$TERRAFORM_DIR/main.tf" << 'EOF'
terraform {
  required_providers {
    hcloud = {
      source = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "deploy" {
  name       = "${var.app_name}-key"
  public_key = file(var.ssh_public_key_path)
}

resource "hcloud_firewall" "main" {
  name = "${var.app_name}-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = var.app_port
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "main" {
  name        = var.app_name
  server_type = var.server_type
  location    = var.location
  image       = "ubuntu-22.04"
  ssh_keys    = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.main.id]
}

output "server_ip" {
  value = hcloud_server.main.ipv4_address
}
EOF

    cat > "$TERRAFORM_DIR/variables.tf" << 'EOF'
variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "app_name" {
  description = "Application name"
  type        = string
}

variable "app_port" {
  description = "Application port"
  type        = string
}

variable "server_type" {
  description = "Server type"
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Server location"
  type        = string
  default     = "fsn1"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key"
  type        = string
}
EOF
}

# Deploy infrastructure
deploy_infrastructure() {
    log_step "Deploying Hetzner Infrastructure"
    
    check_prerequisites
    init_terraform
    
    # Extract app configuration
    APP_PORT=$(jq -r '.defaultPort // 3333' "$APP_CONFIG_PATH")
    SERVER_TYPE=$(jq -r '.deployment.serverSize.hetzner // "cx22"' "$APP_CONFIG_PATH" 2>/dev/null || echo "cx22")
    
    # Check if registry is configured
    DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
    REGISTRY_USER="${REGISTRY_USER:-}"
    REGISTRY_TOKEN="${REGISTRY_TOKEN:-}"
    
    # Build Docker image using deploy-docker.sh
    log_info "Building Docker image..."
    cd "$PROJECT_ROOT"
    
    if [ -n "$DOCKER_REGISTRY" ]; then
        # Build and push to registry
        log_info "Using Docker registry: $DOCKER_REGISTRY"
        
        # Set full image name with registry
        case "$DOCKER_REGISTRY" in
            ghcr.io)
                # For ghcr.io, we need to include the username
                DOCKER_IMAGE="$DOCKER_REGISTRY/$REGISTRY_USER/personal-brain-$APP_NAME:latest"
                ;;
            docker.io)
                # For Docker Hub, include username
                DOCKER_IMAGE="$REGISTRY_USER/personal-brain-$APP_NAME:latest"
                ;;
            *)
                # For other registries
                DOCKER_IMAGE="$DOCKER_REGISTRY/personal-brain-$APP_NAME:latest"
                ;;
        esac
        
        # Build and push
        if ! env GITHUB_TOKEN="$REGISTRY_TOKEN" \
            GITHUB_USER="$REGISTRY_USER" \
            DOCKER_TOKEN="$REGISTRY_TOKEN" \
            DOCKER_USER="$REGISTRY_USER" \
            "$PROJECT_ROOT/deploy/scripts/deploy-docker.sh" "$APP_NAME" local \
            --registry "$DOCKER_REGISTRY" --tag latest --push-only; then
            log_error "Docker build/push failed"
            exit 1
        fi
    else
        # Registry is required
        log_error "Docker registry not configured!"
        log_error ""
        log_error "Please configure a Docker registry in $HETZNER_CONFIG_FILE:"
        log_error ""
        log_error "For GitHub Container Registry (recommended):"
        log_error "  DOCKER_REGISTRY=ghcr.io/yourusername"
        log_error "  REGISTRY_USER=yourusername"
        log_error "  REGISTRY_TOKEN=your-github-personal-access-token"
        log_error ""
        log_error "For Docker Hub:"
        log_error "  DOCKER_REGISTRY=docker.io"
        log_error "  REGISTRY_USER=yourdockerhubusername"
        log_error "  REGISTRY_TOKEN=your-dockerhub-access-token"
        log_error ""
        log_error "See deploy/providers/hetzner/README.md for detailed instructions"
        exit 1
    fi
    
    # Get environment file path
    ENV_FILE="$PROJECT_ROOT/apps/$APP_NAME/deploy/.env.production"
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        log_info "Please create the file with your configuration"
        exit 1
    fi
    
    # Plan deployment
    log_info "Planning infrastructure..."
    cd "$TERRAFORM_DIR"
    terraform plan \
        -var="hcloud_token=$HCLOUD_TOKEN" \
        -var="app_name=$APP_NAME" \
        -var="app_port=$APP_PORT" \
        -var="server_type=$SERVER_TYPE" \
        -var="ssh_public_key_path=$SSH_KEY_PATH" \
        -var="ssh_private_key_path=$SSH_PRIVATE_KEY_PATH" \
        -var="docker_image=$DOCKER_IMAGE" \
        -var="docker_registry=$DOCKER_REGISTRY" \
        -var="registry_user=$REGISTRY_USER" \
        -var="registry_token=$REGISTRY_TOKEN" \
        -var="env_file_path=$ENV_FILE" \
        -out=tfplan
    
    # Apply deployment
    log_info "Creating infrastructure..."
    terraform apply tfplan
    
    # Get server IP
    SERVER_IP=$(terraform output -raw server_ip)
    cd - > /dev/null
    
    log_info "✅ Infrastructure deployed at $SERVER_IP"
    
    # Wait for server to be ready
    wait_for_server "$SERVER_IP"
    
    # Setup application
    setup_application "$SERVER_IP"
}

# Wait for server to be ready
wait_for_server() {
    local server_ip="$1"
    local user="${2:-root}"
    log_info "Waiting for server to be ready..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$user@$server_ip" "echo 'SSH ready'" &> /dev/null; then
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

# Setup application on server
setup_application() {
    local server_ip="$1"
    log_step "Setting up $APP_NAME on server"
    
    # Run server setup script
    log_info "Running server setup..."
    
    # First, create deploy user as root
    log_info "Creating deploy user..."
    ssh "root@$server_ip" << 'EOF'
# Create deploy user if it doesn't exist
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    usermod -aG sudo deploy
    echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
    chmod 440 /etc/sudoers.d/deploy
fi

# Set up SSH for deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
EOF
    
    # Wait for deploy user SSH to be ready
    log_info "Waiting for deploy user SSH access..."
    wait_for_server "$server_ip" "deploy"
    
    # Docker deployment is handled entirely by Terraform
    log_info "Docker deployment configured in Terraform..."
    log_info "Container will be deployed automatically"
    
    log_info "✅ Application deployed successfully"
    log_info ""
    log_info "Access your brain at: http://$server_ip:$APP_DEFAULT_PORT"
    log_info "SSH access: ssh deploy@$server_ip"
}

# Update existing deployment
update_application() {
    log_step "Updating $APP_NAME deployment"
    
    cd "$TERRAFORM_DIR"
    if [ ! -f "terraform.tfstate" ]; then
        log_error "No existing deployment found!"
        log_info "Run 'deploy' first"
        exit 1
    fi
    
    # Get server IP from state
    SERVER_IP=$(terraform output -raw server_ip 2>/dev/null)
    if [ -z "$SERVER_IP" ]; then
        log_error "Could not get server IP from Terraform state"
        exit 1
    fi
    cd - > /dev/null
    
    # Build new release
    log_info "Building new release..."
    # Use Docker build for compatibility with target server
    "$PROJECT_ROOT/scripts/build-release.sh" "$APP_NAME" linux-x64 --docker
    
    # Find latest release
    RELEASE_FILE=$(ls -t "$PROJECT_ROOT/apps/$APP_NAME/dist/"*.tar.gz | head -1)
    
    # Deploy update
    log_info "Deploying update to $SERVER_IP..."
    "$PROJECT_ROOT/deploy/scripts/deploy.sh" "deploy@$SERVER_IP" "$RELEASE_FILE"
    
    log_info "✅ Update complete"
}

# Destroy infrastructure
destroy_infrastructure() {
    log_step "Destroying Hetzner Infrastructure"
    
    # Check prerequisites to get SSH key paths
    check_prerequisites
    
    cd "$TERRAFORM_DIR"
    if [ ! -f "terraform.tfstate" ]; then
        log_warn "No infrastructure to destroy"
        exit 0
    fi
    
    # Ensure terraform is initialized
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Terraform..."
        terraform init
    else
        # Re-init with upgrade to handle provider version changes
        log_info "Checking Terraform providers..."
        terraform init -upgrade >/dev/null 2>&1 || {
            log_info "Re-initializing Terraform..."
            terraform init -upgrade
        }
    fi
    
    # Get server IP for backup
    SERVER_IP=$(terraform output -raw server_ip 2>/dev/null || true)
    
    if [ -n "$SERVER_IP" ]; then
        # Create backup before destroying
        log_info "Creating backup..."
        ssh "deploy@$SERVER_IP" "sudo $APP_INSTALL_PATH/backup.sh" || true
        
        # Download backup
        BACKUP_DIR="$PROJECT_ROOT/backups/$APP_NAME-$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        scp "deploy@$SERVER_IP:$APP_INSTALL_PATH/backups/*" "$BACKUP_DIR/" || true
        log_info "Backup saved to: $BACKUP_DIR"
    fi
    
    # Destroy infrastructure
    log_info "Destroying infrastructure..."
    
    # Set defaults for destroy to avoid prompts
    terraform destroy \
        -var="hcloud_token=$HCLOUD_TOKEN" \
        -var="app_name=$APP_NAME" \
        -var="app_port=${APP_DEFAULT_PORT:-3333}" \
        -var="ssh_public_key_path=$SSH_KEY_PATH" \
        -var="ssh_private_key_path=$SSH_PRIVATE_KEY_PATH" \
        -var="docker_image=ghcr.io/$REGISTRY_USER/personal-brain-$APP_NAME:latest" \
        -var="docker_registry=${DOCKER_REGISTRY:-ghcr.io}" \
        -var="registry_user=${REGISTRY_USER:-}" \
        -var="registry_token=${REGISTRY_TOKEN:-}" \
        -var="env_file_path=" \
        -auto-approve
    
    cd - > /dev/null
    
    log_info "✅ Infrastructure destroyed"
}

# Get deployment status
get_status() {
    log_step "Hetzner Deployment Status"
    
    # Check if terraform directory exists
    if [ ! -d "$TERRAFORM_DIR" ]; then
        log_info "No deployment found for $APP_NAME"
        exit 0
    fi
    
    cd "$TERRAFORM_DIR"
    
    if [ ! -f "terraform.tfstate" ]; then
        log_info "No deployment found for $APP_NAME"
        exit 0
    fi
    
    # Get server details
    SERVER_IP=$(terraform output -raw server_ip 2>/dev/null || echo "unknown")
    
    log_info "App: $APP_NAME"
    log_info "Server IP: $SERVER_IP"
    
    if [ "$SERVER_IP" != "unknown" ]; then
        # Check if server is reachable
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "deploy@$SERVER_IP" "echo 'Connected'" &> /dev/null; then
            log_info "Server: ✅ Reachable"
            
            # Check service status
            SERVICE_STATUS=$(ssh "deploy@$SERVER_IP" "sudo systemctl is-active $APP_SERVICE_NAME" 2>/dev/null || echo "unknown")
            log_info "Service: $SERVICE_STATUS"
            
            # Get app version if possible
            if ssh "deploy@$SERVER_IP" "test -f $APP_INSTALL_PATH/version.txt" 2>/dev/null; then
                VERSION=$(ssh "deploy@$SERVER_IP" "cat $APP_INSTALL_PATH/version.txt" 2>/dev/null || echo "unknown")
                log_info "Version: $VERSION"
            fi
        else
            log_warn "Server: ❌ Not reachable"
        fi
    fi
    
    cd - > /dev/null
}

# Main execution based on action
case "$DEPLOY_ACTION" in
    deploy)
        deploy_infrastructure
        ;;
    update)
        update_application
        ;;
    destroy)
        destroy_infrastructure
        ;;
    status)
        get_status
        ;;
    *)
        log_error "Unknown action: $DEPLOY_ACTION"
        exit 1
        ;;
esac