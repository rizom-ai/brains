#!/usr/bin/env bash
# Setup shared Hetzner resources (SSH key) using Terraform

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${GREEN}[SHARED]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[SHARED]${NC} $1"; }
log_error() { echo -e "${RED}[SHARED]${NC} $1"; }
log_step() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_DIR="$SCRIPT_DIR/shared"
CONFIG_FILE="$SCRIPT_DIR/config.env"

# Load configuration
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Check prerequisites
check_prerequisites() {
    log_step "Checking Prerequisites"

    # Check for Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform not found!"
        log_info "Install terraform: https://www.terraform.io/downloads"
        exit 1
    fi

    # Check for Hetzner token
    if [ -z "${HCLOUD_TOKEN:-}" ]; then
        log_error "HCLOUD_TOKEN not set!"
        log_info "Set in $CONFIG_FILE or environment"
        exit 1
    fi

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

    if [ ! -f "$SSH_PUBLIC_KEY_PATH" ]; then
        log_error "SSH public key not found at: $SSH_PUBLIC_KEY_PATH"
        exit 1
    fi

    log_info "✅ Prerequisites checked"
}

# Initialize Terraform
init_terraform() {
    log_info "Initializing Terraform..."
    cd "$SHARED_DIR"
    terraform init
    cd - > /dev/null
}

# Apply or destroy shared resources
manage_resources() {
    local action="${1:-apply}"

    cd "$SHARED_DIR"

    if [ "$action" = "destroy" ]; then
        log_step "Destroying Shared Resources"
        terraform destroy \
            -var="hcloud_token=$HCLOUD_TOKEN" \
            -var="ssh_public_key_path=$SSH_PUBLIC_KEY_PATH" \
            -auto-approve
    else
        log_step "Managing Shared Resources"

        # Plan first
        log_info "Planning changes..."
        terraform plan \
            -var="hcloud_token=$HCLOUD_TOKEN" \
            -var="ssh_public_key_path=$SSH_PUBLIC_KEY_PATH" \
            -out=tfplan

        # Apply
        log_info "Applying changes..."
        terraform apply tfplan

        # Show outputs
        log_info ""
        log_info "Shared resources ready:"
        terraform output
    fi

    cd - > /dev/null
}

# Show usage
usage() {
    echo "Usage: $0 [apply|destroy|status]"
    echo ""
    echo "Commands:"
    echo "  apply    - Create or update shared resources (default)"
    echo "  destroy  - Remove shared resources"
    echo "  status   - Show current state"
    exit 1
}

# Main execution
main() {
    local action="${1:-apply}"

    case "$action" in
        apply)
            check_prerequisites
            init_terraform
            manage_resources apply
            log_info "✅ Shared resources ready"
            ;;
        destroy)
            check_prerequisites
            init_terraform
            manage_resources destroy
            log_info "✅ Shared resources removed"
            ;;
        status)
            cd "$SHARED_DIR"
            if [ -f "terraform.tfstate" ]; then
                log_info "Current shared resources:"
                terraform output
            else
                log_info "No shared resources deployed"
            fi
            cd - > /dev/null
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown action: $action"
            usage
            ;;
    esac
}

main "$@"