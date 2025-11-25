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
PROVIDER_DIR="$PROJECT_ROOT/deploy/providers/hetzner"
TERRAFORM_DIR="$PROVIDER_DIR/terraform"
TERRAFORM_STATE_DIR="$PROJECT_ROOT/apps/$APP_NAME/deploy/terraform-state"
HETZNER_CONFIG_FILE="$PROVIDER_DIR/config.env"
SHARED_STATE_DIR="$PROVIDER_DIR/shared"

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
    
    # Ensure shared resources are configured (idempotent)
    log_info "Ensuring shared resources are configured..."

    # Auto-detect SSH key if not specified
    if [ -z "${SSH_PUBLIC_KEY_PATH:-}" ]; then
        for key_type in id_ed25519.pub id_rsa.pub id_ecdsa.pub; do
            if [ -f "$HOME/.ssh/$key_type" ]; then
                SSH_PUBLIC_KEY_PATH="$HOME/.ssh/$key_type"
                log_info "Auto-detected SSH key: $SSH_PUBLIC_KEY_PATH"
                break
            fi
        done

        if [ -z "$SSH_PUBLIC_KEY_PATH" ]; then
            log_error "No SSH public key found!"
            log_error "Generate one with: ssh-keygen -t ed25519"
            exit 1
        fi
    fi

    # Initialize and apply shared resources (idempotent)
    cd "$SHARED_STATE_DIR"

    # Initialize Terraform
    if ! terraform init -upgrade >/dev/null 2>&1; then
        log_error "Failed to initialize shared resources Terraform"
        terraform init -upgrade  # Run again to show error
        exit 1
    fi

    # Apply shared resources
    if ! terraform apply \
        -var="hcloud_token=$HCLOUD_TOKEN" \
        -var="ssh_public_key_path=$SSH_PUBLIC_KEY_PATH" \
        -auto-approve >/dev/null 2>&1; then
        log_error "Failed to setup shared resources. Running with output for debugging:"
        terraform apply \
            -var="hcloud_token=$HCLOUD_TOKEN" \
            -var="ssh_public_key_path=$SSH_PUBLIC_KEY_PATH" \
            -auto-approve
        exit 1
    fi

    # Get SSH key name from shared resources
    SSH_KEY_NAME=$(terraform output -raw ssh_key_name 2>/dev/null)
    if [ -z "$SSH_KEY_NAME" ]; then
        log_error "Failed to get SSH key name from shared resources"
        exit 1
    fi

    log_info "✅ Shared resources ready (SSH key: $SSH_KEY_NAME)"
    cd - > /dev/null
    
    log_info "✅ Prerequisites checked"
}

# Initialize Terraform
init_terraform() {
    log_info "Initializing Terraform..."

    # Create state directory if needed
    mkdir -p "$TERRAFORM_STATE_DIR"

    # Only copy .tf files if they don't exist or if state doesn't exist
    # This preserves existing state
    # TODO: Refactor to run Terraform from source dir with -state flag instead of copying
    #       This would be cleaner: terraform apply -state=apps/<app>/deploy/terraform-state/terraform.tfstate
    if [ ! -f "$TERRAFORM_STATE_DIR/terraform.tfstate" ] || [ ! -f "$TERRAFORM_STATE_DIR/main.tf" ]; then
        log_info "Setting up Terraform configuration..."
        cp "$TERRAFORM_DIR"/main.tf "$TERRAFORM_STATE_DIR/" 2>/dev/null || true
        cp "$TERRAFORM_DIR"/variables.tf "$TERRAFORM_STATE_DIR/" 2>/dev/null || true
        # Copy modules directory for Bunny CDN and Route53 DNS
        if [ -d "$TERRAFORM_DIR/modules" ]; then
            mkdir -p "$TERRAFORM_STATE_DIR/modules"
            cp -r "$TERRAFORM_DIR/modules"/* "$TERRAFORM_STATE_DIR/modules/" 2>/dev/null || true
        fi
    fi

    # Initialize in the state directory
    cd "$TERRAFORM_STATE_DIR"
    terraform init -upgrade
    cd - > /dev/null
}


# Build and push Docker image
build_and_push_docker_image() {
    # Check if registry is configured
    DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
    REGISTRY_USER="${REGISTRY_USER:-}"
    REGISTRY_TOKEN="${REGISTRY_TOKEN:-}"

    if [ -n "$DOCKER_REGISTRY" ]; then
        # Build and push to registry
        log_info "Using Docker registry: $DOCKER_REGISTRY"

        # Set full image name with registry
        case "$DOCKER_REGISTRY" in
            ghcr.io)
                DOCKER_IMAGE="$DOCKER_REGISTRY/$REGISTRY_USER/personal-brain-$APP_NAME:latest"
                ;;
            docker.io)
                DOCKER_IMAGE="$REGISTRY_USER/personal-brain-$APP_NAME:latest"
                ;;
            *)
                DOCKER_IMAGE="$DOCKER_REGISTRY/personal-brain-$APP_NAME:latest"
                ;;
        esac

        # Always build (Docker will use cache if no changes)
        # The deploy-docker.sh script handles the build and push
        log_info "Building and pushing Docker image..."
        cd "$PROJECT_ROOT"
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
        log_error "Docker registry not configured!"
        exit 1
    fi
}

# Deploy application to server
deploy_application_to_server() {
    local server_ip="$1"

    # Get environment file path
    ENV_FILE="$PROJECT_ROOT/apps/$APP_NAME/deploy/.env.production"
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi

    # Load domain from env file
    DOMAIN=$(docker run --rm --env-file="$ENV_FILE" alpine sh -c 'echo $DOMAIN' 2>/dev/null || echo "")
    if [ -n "$DOMAIN" ]; then
        log_info "Domain configured: $DOMAIN"
    fi

    # Deploy application using the separate script
    log_step "Deploying Application"
    "$PROVIDER_DIR/deploy-app.sh" "$server_ip" "$APP_NAME" "$DOCKER_IMAGE" "$ENV_FILE" "$DOMAIN" "$REGISTRY_USER" "$REGISTRY_TOKEN"

    log_info "✅ Application deployed successfully"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_step "Deploying Hetzner Infrastructure"

    check_prerequisites
    init_terraform

    # Check if infrastructure already exists
    cd "$TERRAFORM_STATE_DIR"
    if [ -f "terraform.tfstate" ] && terraform state list 2>/dev/null | grep -q "hcloud_server.main"; then
        log_info "Infrastructure already exists, checking status..."

        # Refresh state to ensure it's current
        terraform refresh \
            -var="hcloud_token=$HCLOUD_TOKEN" \
            -var="app_name=$APP_NAME" \
            -var="ssh_key_name=$SSH_KEY_NAME" \
            -var="domain=${DOMAIN:-}" \
            -var="bunny_api_key=${BUNNY_API_KEY:-}" \
            >/dev/null 2>&1

        # Get server IP
        SERVER_IP=$(terraform output -raw server_ip 2>/dev/null)
        if [ -n "$SERVER_IP" ]; then
            log_info "✅ Using existing infrastructure at $SERVER_IP"
            cd - > /dev/null

            # Skip to application deployment
            # Build and push Docker image if needed
            build_and_push_docker_image

            # Deploy application
            deploy_application_to_server "$SERVER_IP"
            return 0
        fi
    fi
    cd - > /dev/null

    # Continue with new infrastructure deployment
    # Extract app configuration
    SERVER_TYPE=$(jq -r '.deployment.serverSize.hetzner // "cx33"' "$APP_CONFIG_PATH" 2>/dev/null || echo "cx33")

    # Load DOMAIN from app's environment file (needed for CDN configuration)
    ENV_FILE="$PROJECT_ROOT/apps/$APP_NAME/deploy/.env.production"
    if [ -f "$ENV_FILE" ]; then
        DOMAIN=$(docker run --rm --env-file="$ENV_FILE" alpine sh -c 'echo $DOMAIN' 2>/dev/null || echo "")
        if [ -n "$DOMAIN" ]; then
            log_info "Domain configured: $DOMAIN"
        fi
    fi

    # Build and push Docker image
    build_and_push_docker_image
    
    # Refresh state first to sync with reality
    log_info "Refreshing Terraform state..."
    # Ensure state directory exists before cd
    mkdir -p "$TERRAFORM_STATE_DIR"
    cd "$TERRAFORM_STATE_DIR"

    # Refresh to update state from actual infrastructure
    terraform refresh \
        -var="hcloud_token=$HCLOUD_TOKEN" \
        -var="app_name=$APP_NAME" \
        -var="server_type=$SERVER_TYPE" \
        -var="ssh_key_name=$SSH_KEY_NAME" \
        -var="domain=${DOMAIN:-}" \
        -var="bunny_api_key=${BUNNY_API_KEY:-}" \
        >/dev/null 2>&1 || true

    # Plan deployment
    log_info "Planning infrastructure..."
    terraform plan \
        -var="hcloud_token=$HCLOUD_TOKEN" \
        -var="app_name=$APP_NAME" \
        -var="server_type=$SERVER_TYPE" \
        -var="ssh_key_name=$SSH_KEY_NAME" \
        -var="domain=${DOMAIN:-}" \
        -var="bunny_api_key=${BUNNY_API_KEY:-}" \
        -out=tfplan

    # Apply deployment (Terraform will handle existing resources properly)
    log_info "Applying infrastructure changes..."
    terraform apply tfplan
    
    # Get server IP
    SERVER_IP=$(terraform output -raw server_ip)
    cd - > /dev/null
    
    log_info "✅ Infrastructure created at $SERVER_IP"

    # Deploy application to the new server
    deploy_application_to_server "$SERVER_IP"
}



# Update existing deployment
update_application() {
    log_step "Updating $APP_NAME deployment"

    cd "$TERRAFORM_STATE_DIR"
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

    check_prerequisites

    # Check if registry is configured
    DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
    REGISTRY_USER="${REGISTRY_USER:-}"
    REGISTRY_TOKEN="${REGISTRY_TOKEN:-}"

    # Build and push new Docker image
    log_info "Building and pushing new Docker image..."
    cd "$PROJECT_ROOT"

    if [ -n "$DOCKER_REGISTRY" ]; then
        # Set full image name with registry
        case "$DOCKER_REGISTRY" in
            ghcr.io)
                DOCKER_IMAGE="$DOCKER_REGISTRY/$REGISTRY_USER/personal-brain-$APP_NAME:latest"
                ;;
            docker.io)
                DOCKER_IMAGE="$REGISTRY_USER/personal-brain-$APP_NAME:latest"
                ;;
            *)
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
        log_error "Docker registry not configured!"
        exit 1
    fi

    # Get environment file and domain
    ENV_FILE="$PROJECT_ROOT/apps/$APP_NAME/deploy/.env.production"
    DOMAIN=$(docker run --rm --env-file="$ENV_FILE" alpine sh -c 'echo $DOMAIN' 2>/dev/null || echo "")

    # Deploy the update
    log_info "Deploying update to $SERVER_IP..."
    "$PROVIDER_DIR/deploy-app.sh" "$SERVER_IP" "$APP_NAME" "$DOCKER_IMAGE" "$ENV_FILE" "$DOMAIN" "$REGISTRY_USER" "$REGISTRY_TOKEN"

    log_info "✅ Update complete"
}

# Destroy infrastructure
destroy_infrastructure() {
    log_step "Destroying Hetzner Infrastructure"

    check_prerequisites
    
    cd "$TERRAFORM_STATE_DIR"
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
    
    # Destroy infrastructure
    log_info "Destroying infrastructure..."

    terraform destroy \
        -var="hcloud_token=$HCLOUD_TOKEN" \
        -var="app_name=$APP_NAME" \
        -var="server_type=cx33" \
        -var="ssh_key_name=$SSH_KEY_NAME" \
        -var="domain=${DOMAIN:-}" \
        -var="bunny_api_key=${BUNNY_API_KEY:-}" \
        -auto-approve
    
    cd - > /dev/null
    
    log_info "✅ Infrastructure destroyed"
}

# Get deployment status
get_status() {
    log_step "Hetzner Deployment Status"
    
    # Check if terraform state directory exists
    if [ ! -d "$TERRAFORM_STATE_DIR" ]; then
        log_info "No deployment found for $APP_NAME"
        exit 0
    fi
    
    cd "$TERRAFORM_STATE_DIR"

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
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "root@$SERVER_IP" "echo 'Connected'" &> /dev/null; then
            log_info "Server: ✅ Reachable"

            # Check Docker container status
            CONTAINER_STATUS=$(ssh -o StrictHostKeyChecking=no "root@$SERVER_IP" \
                "cd /opt/personal-brain && docker compose ps --format json" 2>/dev/null || echo "")

            if [ -n "$CONTAINER_STATUS" ]; then
                log_info "Containers running:"
                echo "$CONTAINER_STATUS" | jq -r '.Name + ": " + .State'
            else
                log_info "Containers: Not running or not deployed"
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