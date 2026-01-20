#!/usr/bin/env bash
# Docker provider - thin forwarder to deploy-docker.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../scripts/lib/common.sh"

DOCKER_SCRIPT="$PROJECT_ROOT/deploy/scripts/deploy-docker.sh"

case "$DEPLOY_ACTION" in
    deploy|update)
        exec "$DOCKER_SCRIPT" "$APP_NAME" local
        ;;
    destroy)
        exec "$DOCKER_SCRIPT" "$APP_NAME" local --destroy
        ;;
    status)
        exec "$DOCKER_SCRIPT" "$APP_NAME" local --status
        ;;
    *)
        log_error "Unknown action: $DEPLOY_ACTION"
        exit 1
        ;;
esac
