#!/usr/bin/env bash
# Simplified deployment script using common libraries

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/platform.sh"

# Set error handling
set_error_trap

# Usage
usage() {
    cat << EOF
Usage: $0 <app-name> <provider> <action> [options]

Arguments:
  app-name    Name of the app to deploy
  provider    Deployment provider (docker, hetzner, aws, local)
  action      Action to perform (deploy, update, destroy, status)

Options:
  --help      Show this help message
  --debug     Enable debug output

Examples:
  $0 test-brain local deploy
  $0 test-brain hetzner deploy
  $0 test-brain docker update user@server

EOF
    exit 1
}

# Parse arguments
if [ $# -lt 3 ]; then
    usage
fi

APP_NAME="$1"
PROVIDER="$2"
ACTION="$3"
shift 3

# Parse options
while [ $# -gt 0 ]; do
    case "$1" in
        --help)
            usage
            ;;
        --debug)
            export DEBUG=1
            ;;
        *)
            # Provider-specific arguments
            PROVIDER_ARGS+=("$1")
            ;;
    esac
    shift
done

# Ensure we're in project root
ensure_project_root

# Load app configuration
load_app_config "$APP_NAME"

# Load provider configuration
load_provider_config "$PROVIDER"

# Validate provider script exists
PROVIDER_SCRIPT="$SCRIPT_DIR/../providers/$PROVIDER/deploy.sh"
if [ ! -f "$PROVIDER_SCRIPT" ]; then
    log_error "Provider '$PROVIDER' not found"
    log_info "Available providers:"
    ls -1 deploy/providers/ 2>/dev/null | grep -v README
    exit 1
fi

# Validate action
case "$ACTION" in
    deploy|update|destroy|status)
        ;;
    *)
        log_error "Invalid action: $ACTION"
        log_info "Valid actions: deploy, update, destroy, status"
        exit 1
        ;;
esac

# Display deployment plan
log_info "Deployment Plan:"
echo "  App: $APP_NAME (v$APP_VERSION)"
echo "  Provider: $PROVIDER"
echo "  Action: $ACTION"
echo "  Service: $APP_SERVICE_NAME"
echo "  Port: $APP_DEFAULT_PORT"
echo ""

# Confirm destructive actions
if [ "$ACTION" = "destroy" ]; then
    echo -n "⚠️  This will destroy the infrastructure. Type 'yes' to confirm: "
    read confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        exit 0
    fi
fi

# Export variables for provider script
export DEPLOY_ACTION="$ACTION"
export PROJECT_ROOT="$(pwd)"

# Execute provider script
log_info "Executing $PROVIDER provider..."
exec "$PROVIDER_SCRIPT" "${PROVIDER_ARGS[@]}"