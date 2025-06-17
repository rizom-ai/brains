#!/usr/bin/env bash
# Generic deployment orchestrator for any brain app to any provider

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
APP_NAME="${1:-}"
PROVIDER="${2:-}"
ACTION="${3:-deploy}"

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Show usage
show_usage() {
    echo "Usage: $0 <app-name> <provider> [action]"
    echo ""
    echo "Available apps:"
    if [ -d "apps" ]; then
        ls -1 apps/ | grep -v '^\.' | sed 's/^/  - /'
    fi
    echo ""
    echo "Available providers:"
    if [ -d "deploy/providers" ]; then
        ls -1 deploy/providers/ 2>/dev/null | grep -v '^\.' | sed 's/^/  - /'
    fi
    echo ""
    echo "Actions: deploy, update, destroy, status"
    echo ""
    echo "Examples:"
    echo "  $0 test-brain hetzner deploy    # Deploy test-brain to Hetzner"
    echo "  $0 work-brain aws deploy         # Deploy work-brain to AWS"
    echo "  $0 personal-brain local deploy   # Deploy personal-brain locally"
    exit 1
}

# Validate app exists
if [ -z "$APP_NAME" ] || [ ! -d "apps/$APP_NAME" ]; then
    log_error "App '$APP_NAME' not found!"
    echo ""
    show_usage
fi

# Check for app deployment configuration
APP_CONFIG="apps/$APP_NAME/deploy/deploy.config.json"
if [ ! -f "$APP_CONFIG" ]; then
    log_error "Missing deployment configuration: $APP_CONFIG"
    log_info "Create a deploy.config.json file for your app. Example:"
    cat << 'EOF'
{
  "name": "app-name",
  "serviceName": "systemd-service-name",
  "binaryName": "executable-name",
  "defaultPort": 3333,
  "installPath": "/opt/app-name",
  "platforms": ["linux-x64", "linux-arm64"],
  "deployment": {
    "preferredProvider": "hetzner"
  }
}
EOF
    exit 1
fi

# Extract deployment preferences if provider not specified
if [ -z "$PROVIDER" ]; then
    PROVIDER=$(jq -r '.deployment.preferredProvider // "local"' "$APP_CONFIG" 2>/dev/null || echo "local")
    log_info "No provider specified, using preferred: $PROVIDER"
fi

# Validate provider
PROVIDER_DIR="deploy/providers/$PROVIDER"
if [ ! -d "$PROVIDER_DIR" ]; then
    log_error "Provider '$PROVIDER' not implemented yet!"
    echo ""
    show_usage
fi

# Check for provider deployment script
PROVIDER_SCRIPT="$PROVIDER_DIR/deploy.sh"
if [ ! -f "$PROVIDER_SCRIPT" ]; then
    log_error "Provider script not found: $PROVIDER_SCRIPT"
    exit 1
fi

# Extract app metadata
APP_SERVICE_NAME=$(jq -r '.serviceName // .name' "$APP_CONFIG")
APP_BINARY_NAME=$(jq -r '.binaryName // "brain"' "$APP_CONFIG")
APP_INSTALL_PATH=$(jq -r '.installPath // "/opt/personal-brain"' "$APP_CONFIG")
APP_DEFAULT_PORT=$(jq -r '.defaultPort // 3333' "$APP_CONFIG")

# Display deployment plan
log_info "Deployment Plan:"
echo "  App: $APP_NAME"
echo "  Provider: $PROVIDER"
echo "  Action: $ACTION"
echo "  Service: $APP_SERVICE_NAME"
echo "  Install Path: $APP_INSTALL_PATH"
echo ""

# Export variables for provider script
export APP_NAME
export APP_CONFIG_PATH="$APP_CONFIG"
export APP_SERVICE_NAME
export APP_BINARY_NAME
export APP_INSTALL_PATH
export APP_DEFAULT_PORT
export DEPLOY_ACTION="$ACTION"
export SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validate action
case "$ACTION" in
    deploy|update|destroy|status)
        ;;
    *)
        log_error "Unknown action: $ACTION"
        echo "Valid actions: deploy, update, destroy, status"
        exit 1
        ;;
esac

# Execute provider-specific deployment
log_info "Executing $PROVIDER provider for $ACTION..."
exec "$PROVIDER_SCRIPT"