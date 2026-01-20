# Deploy Script Consolidation

## Problem

Deployment scripts have duplication and dead code:

| Script                              | Lines | Issue                                                     |
| ----------------------------------- | ----- | --------------------------------------------------------- |
| `deploy/scripts/deploy.sh`          | 310   | Dead code (legacy tarball)                                |
| `deploy/providers/docker/deploy.sh` | 165   | Split logic - destroy/status here, deploy/update forwards |
| `deploy/scripts/deploy-docker.sh`   | 223   | Missing destroy/status                                    |

Volume paths are also wrong in multiple files.

## Solution

1. Delete `deploy/scripts/deploy.sh` (dead code)
2. Move destroy/status into `deploy-docker.sh`
3. Simplify `deploy/providers/docker/deploy.sh` to ~20 line forwarder
4. Fix volume paths

## Files to Modify

| File                                                                        | Action                          |
| --------------------------------------------------------------------------- | ------------------------------- |
| `deploy/scripts/deploy.sh`                                                  | DELETE                          |
| `deploy/scripts/deploy-docker.sh`                                           | ADD destroy/status, FIX volumes |
| `deploy/providers/docker/deploy.sh`                                         | REPLACE with thin forwarder     |
| `deploy/providers/hetzner/templates/docker-compose-standalone.yml.template` | REMOVE wrong volume             |

## Implementation

### 1. Delete legacy script

```bash
rm deploy/scripts/deploy.sh
```

### 2. Update deploy-docker.sh

Add `--destroy` and `--status` flags. Add functions:

```bash
destroy_local() {
    log_step "Destroying local deployment"
    docker stop "personal-brain-$APP_NAME" 2>/dev/null || true
    docker rm "personal-brain-$APP_NAME" 2>/dev/null || true
    log_info "Local deployment removed"
}

status_local() {
    log_step "Docker Deployment Status"
    if docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "personal-brain-$APP_NAME"; then
        docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "personal-brain-$APP_NAME"
        docker logs --tail 10 "personal-brain-$APP_NAME" 2>&1 || true
    else
        log_warn "No container found"
    fi
}
```

Fix volume paths (line 153-157):

```bash
# Old
-v "$HOME/personal-brain-data/website:/app/website" \

# New
-v "$HOME/personal-brain-data/site-production:/app/dist/site-production" \
-v "$HOME/personal-brain-data/site-preview:/app/dist/site-preview" \
```

### 3. Replace docker provider

`deploy/providers/docker/deploy.sh` becomes:

```bash
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
```

### 4. Fix standalone template

Remove wrong volume from `docker-compose-standalone.yml.template`:

```yaml
# Delete this line:
- ${APP_DIR}/website:/app/apps/shell/dist
```

## Verification

```bash
# Unified interface
./deploy/scripts/deploy-brain.sh test-brain docker deploy
./deploy/scripts/deploy-brain.sh test-brain docker status
./deploy/scripts/deploy-brain.sh test-brain docker destroy

# Direct call
./deploy/scripts/deploy-docker.sh test-brain local
./deploy/scripts/deploy-docker.sh test-brain local --status
./deploy/scripts/deploy-docker.sh test-brain local --destroy
```
