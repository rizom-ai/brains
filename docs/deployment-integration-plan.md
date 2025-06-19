# Deployment Integration and Organization Plan

## Overview

This document outlines the complete plan for integrating Docker deployment into the existing deployment system and cleaning up the project structure.

## Current State

### Issues

1. **Root directory clutter** - Docker files scattered in root
2. **Inconsistent deployment** - Docker deployment is separate from provider system
3. **Native modules handling** - Recently solved but needs integration

### Existing Structure

```
brains/
├── Dockerfile.optimized        # In root (needs moving)
├── test-docker/               # Test directory (needs removal)
├── scripts/
│   ├── deploy-brain.sh        # Main orchestrator
│   ├── build-release.sh       # Build with native modules
│   └── deploy-docker.sh       # Wrapper to deploy/scripts/
└── deploy/
    ├── scripts/
    │   └── deploy-docker.sh   # Actual Docker deployment
    └── providers/
        └── hetzner/           # Cloud provider
```

## Proposed Solution

### 1. Directory Organization

```
brains/
├── apps/                      # Applications (unchanged)
├── packages/                  # Shared packages (unchanged)
├── scripts/                   # Development scripts only
│   ├── build-release.sh      # Build script
│   ├── extract-native-deps.js # Native deps extractor
│   ├── sync-versions.ts      # Version sync
│   └── deploy-brain.sh       # Main deployment orchestrator
├── deploy/
│   ├── docker/               # All Docker-related files
│   │   ├── Dockerfile.build
│   │   ├── Dockerfile.runtime
│   │   ├── Dockerfile.standalone
│   │   ├── docker-compose.yml
│   │   └── .dockerignore
│   ├── scripts/              # Deployment scripts
│   │   ├── deploy.sh         # Traditional deployment
│   │   ├── deploy-docker.sh  # Docker deployment
│   │   └── setup-server.sh   # Server setup
│   └── providers/            # Provider implementations
│       ├── docker/           # NEW: Docker as a provider
│       │   ├── deploy.sh
│       │   └── README.md
│       └── hetzner/
│           ├── deploy.sh
│           └── terraform/
└── [config files only]       # .gitignore, package.json, etc.
```

### 2. Docker Provider Implementation

Create `deploy/providers/docker/deploy.sh` as a thin adapter:

```bash
#!/usr/bin/env bash
# Docker provider adapter for deploy-brain.sh

set -euo pipefail

# Standard provider interface variables come from deploy-brain.sh:
# APP_NAME, DEPLOY_ACTION, PROJECT_ROOT, etc.

# Parse additional arguments (server address)
shift 3  # Remove app-name, provider, action
SERVER="${1:-local}"

case "$DEPLOY_ACTION" in
    deploy|update)
        # Use existing Docker deployment script
        exec "$PROJECT_ROOT/deploy/scripts/deploy-docker.sh" \
            "$APP_NAME" "$SERVER"
        ;;
    destroy)
        # Stop and remove containers
        if [ "$SERVER" = "local" ]; then
            docker-compose -p "$APP_SERVICE_NAME" down
        else
            ssh "$SERVER" "docker-compose -p $APP_SERVICE_NAME down"
        fi
        ;;
    status)
        # Check container status
        if [ "$SERVER" = "local" ]; then
            docker ps -a | grep "$APP_SERVICE_NAME" || echo "Not running"
        else
            ssh "$SERVER" "docker ps -a | grep $APP_SERVICE_NAME" || echo "Not running"
        fi
        ;;
    *)
        echo "Unknown action: $DEPLOY_ACTION"
        exit 1
        ;;
esac
```

### 3. Deployment Flows

#### A. Traditional Deployment (Existing)

```bash
./scripts/deploy-brain.sh test-brain hetzner deploy
```

- Provisions VM with Terraform
- Builds release with external native modules
- Deploys tarball
- First run auto-installs dependencies

#### B. Docker Deployment (New Integration)

```bash
./scripts/deploy-brain.sh test-brain docker deploy server.com
```

- Builds release with external native modules
- Creates Docker image with pre-installed deps
- Deploys container to specified server

#### C. Local Docker Deployment

```bash
./scripts/deploy-brain.sh test-brain docker deploy local
```

- Builds and runs container locally

### 4. Native Modules Strategy

Both deployment methods use the same approach:

- Build marks native modules as external
- Generate package.json with exact versions
- Traditional: wrapper script installs on first run
- Docker: multi-stage build pre-installs

### 5. Environment Variables

- Apps store `.env.production` in `apps/<name>/deploy/`
- Traditional: copied during deployment
- Docker: baked into image as `/app/.env`

### 6. Implementation Steps

1. **Clean root directory**

   - Move Dockerfile.optimized → deploy/docker/Dockerfile.standalone
   - Remove test-docker directory
   - Remove scripts/deploy-docker.sh wrapper

2. **Create Docker provider**

   - Create deploy/providers/docker/deploy.sh
   - Add README.md with Docker-specific docs

3. **Update references**

   - Update any hardcoded paths
   - Ensure all scripts use correct locations

4. **Test both flows**
   - Traditional: deploy-brain.sh test-brain hetzner deploy
   - Docker: deploy-brain.sh test-brain docker deploy

### 7. Benefits

1. **Unified interface** - Same command for all deployment types
2. **Clean structure** - Everything organized logically
3. **No duplication** - Reuses existing scripts
4. **Native modules handled** - Both methods support external deps
5. **Flexible** - Can still use scripts directly if needed

### 8. Future Enhancements

- Add `local` provider for systemd without cloud
- Add `aws` provider for EC2 deployments
- Add `k8s` provider for Kubernetes
- Support Docker registry configuration
- Add health check monitoring

## Conclusion

This plan creates a clean, consistent deployment system that supports both traditional and containerized deployments while properly handling native modules and maintaining a well-organized project structure.
