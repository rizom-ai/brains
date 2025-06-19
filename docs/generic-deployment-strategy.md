# Generic Deployment Strategy for Brain Apps

## Overview

This document defines a reusable deployment strategy that works for any brain app in the monorepo, whether it's `test-brain`, `work-brain`, `personal-brain`, or future apps.

## Design Principles

1. **App-agnostic**: Scripts detect and work with any app in `apps/` directory
2. **Configuration-driven**: Each app defines its own deployment config
3. **Provider-independent**: Core scripts with provider-specific adapters
4. **Reusable components**: Shared infrastructure modules
5. **DRY (Don't Repeat Yourself)**: Common functionality abstracted

## Architecture

### Directory Structure

```
brains/
├── scripts/                      # Generic deployment scripts
│   ├── build-release.sh         # Works with any app (already generic!)
│   ├── deploy.sh                # Works with any server (already generic!)
│   └── setup-server.sh          # Generic server setup
├── deploy/                      # Deployment infrastructure
│   ├── common/                  # Shared components
│   │   ├── scripts/            # Reusable shell scripts
│   │   └── templates/          # Config templates
│   ├── providers/              # Provider-specific code
│   │   ├── hetzner/           # Hetzner Cloud
│   │   ├── digitalocean/      # DigitalOcean (future)
│   │   ├── aws/               # AWS EC2 (future)
│   │   └── local/             # Local/VM deployment
│   └── apps/                   # App-specific overrides
│       ├── test-brain/        # Test brain specific config
│       └── work-brain/        # Work brain specific config
└── apps/
    ├── test-brain/
    │   └── deploy/             # App deployment config
    │       ├── deploy.config.json
    │       ├── .env.production.example
    │       └── custom/         # App-specific scripts/configs
    └── work-brain/
        └── deploy/             # Same structure
```

## Generic Components

### 1. App Deployment Configuration

Each app must have `deploy/deploy.config.json`:

```json
{
  "name": "app-name",
  "displayName": "Human Readable Name",
  "serviceName": "systemd-service-name",
  "binaryName": "executable-name",
  "description": "App description",
  "defaultPort": 3333,
  "installPath": "/opt/app-name",
  "dataPath": "/opt/app-name/data",
  "user": "app-user",
  "group": "app-group",
  "build": {
    "entryPoint": "src/index.ts",
    "outputName": "app"
  },
  "platforms": ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"],
  "resources": {
    "minMemory": "512M",
    "maxMemory": "2G",
    "cpuQuota": "100%"
  },
  "features": {
    "gitSync": false,
    "matrix": false,
    "webserver": false
  },
  "deployment": {
    "providers": ["hetzner", "digitalocean", "local"],
    "preferredProvider": "hetzner",
    "serverSize": {
      "hetzner": "cx11",
      "digitalocean": "s-1vcpu-1gb"
    }
  }
}
```

### 2. Generic Deployment Script

`scripts/deploy-generic.sh`:

```bash
#!/usr/bin/env bash
# Generic deployment orchestrator for any brain app

set -euo pipefail

# Parse arguments
APP_NAME="${1:-}"
PROVIDER="${2:-}"
ACTION="${3:-deploy}"

# Validate app exists
if [ -z "$APP_NAME" ] || [ ! -d "apps/$APP_NAME" ]; then
    echo "Usage: $0 <app-name> <provider> [action]"
    echo "Available apps:"
    ls -1 apps/
    echo ""
    echo "Available providers:"
    ls -1 deploy/providers/
    exit 1
fi

# Load app configuration
APP_CONFIG="apps/$APP_NAME/deploy/deploy.config.json"
if [ ! -f "$APP_CONFIG" ]; then
    echo "Error: $APP_CONFIG not found"
    exit 1
fi

# Extract deployment preferences
if [ -z "$PROVIDER" ]; then
    PROVIDER=$(jq -r '.deployment.preferredProvider // "local"' "$APP_CONFIG")
fi

# Validate provider
PROVIDER_DIR="deploy/providers/$PROVIDER"
if [ ! -d "$PROVIDER_DIR" ]; then
    echo "Error: Provider '$PROVIDER' not found"
    exit 1
fi

# Load provider-specific deployment script
PROVIDER_SCRIPT="$PROVIDER_DIR/deploy.sh"
if [ ! -f "$PROVIDER_SCRIPT" ]; then
    echo "Error: $PROVIDER_SCRIPT not found"
    exit 1
fi

# Export app configuration for provider script
export APP_NAME
export APP_CONFIG_PATH="$APP_CONFIG"
export DEPLOY_ACTION="$ACTION"

# Execute provider-specific deployment
exec "$PROVIDER_SCRIPT"
```

### 3. Provider Interface

Each provider implements a standard interface in `deploy/providers/<provider>/deploy.sh`:

```bash
#!/usr/bin/env bash
# Provider-specific deployment script interface

# Required environment variables from generic script:
# - APP_NAME: Name of the app to deploy
# - APP_CONFIG_PATH: Path to app's deploy.config.json
# - DEPLOY_ACTION: deploy|update|destroy|status

# Provider must implement these functions:
deploy_infrastructure() {
    # Create servers, networks, etc.
    # Output: SERVER_IP, SERVER_USER
}

setup_application() {
    # Install app on server
    # Uses generic scripts/setup-server.sh
}

update_application() {
    # Update existing deployment
}

destroy_infrastructure() {
    # Tear down servers, cleanup
}

get_status() {
    # Return current deployment status
}

# Main execution
case "$DEPLOY_ACTION" in
    deploy) deploy_infrastructure && setup_application ;;
    update) update_application ;;
    destroy) destroy_infrastructure ;;
    status) get_status ;;
    *) echo "Unknown action: $DEPLOY_ACTION"; exit 1 ;;
esac
```

### 4. Shared Templates

`deploy/common/templates/`:

- `systemd.service.template` - Generic systemd service
- `caddy.template` - Generic Caddy configuration
- `nginx.template` - Generic Nginx configuration
- `backup.sh.template` - Generic backup script

Templates use variables from `deploy.config.json`:

```ini
[Unit]
Description={{description}}
After=network.target

[Service]
Type=simple
ExecStart={{installPath}}/{{binaryName}}
Restart=always
User={{user}}
Group={{group}}
Environment="NODE_ENV=production"
EnvironmentFile={{installPath}}/.env
WorkingDirectory={{installPath}}

# Resource limits from config
MemoryMax={{resources.maxMemory}}
CPUQuota={{resources.cpuQuota}}

[Install]
WantedBy=multi-user.target
```

## Usage Examples

### Deploy Any App to Any Provider

```bash
# Deploy test-brain to Hetzner
./scripts/deploy-generic.sh test-brain hetzner deploy

# Deploy work-brain to DigitalOcean
./scripts/deploy-generic.sh work-brain digitalocean deploy

# Deploy personal-brain locally
./scripts/deploy-generic.sh personal-brain local deploy

# Update existing deployment
./scripts/deploy-generic.sh test-brain hetzner update

# Destroy infrastructure
./scripts/deploy-generic.sh test-brain hetzner destroy
```

### Provider-Specific Features

Providers can offer additional features:

```bash
# Hetzner: Enable floating IP
HETZNER_FLOATING_IP=true ./scripts/deploy-generic.sh test-brain hetzner deploy

# DigitalOcean: Enable backups
DO_ENABLE_BACKUPS=true ./scripts/deploy-generic.sh work-brain digitalocean deploy

# AWS: Use specific region
AWS_REGION=us-west-2 ./scripts/deploy-generic.sh personal-brain aws deploy
```

## Adding New Apps

1. Create app structure:

   ```bash
   apps/my-brain/
   └── deploy/
       ├── deploy.config.json
       ├── .env.production.example
       └── my-brain.service  # Optional custom service
   ```

2. Configure `deploy.config.json` with app-specific settings

3. Deploy using generic scripts:
   ```bash
   ./scripts/deploy-generic.sh my-brain hetzner deploy
   ```

## Adding New Providers

1. Create provider directory:

   ```bash
   deploy/providers/mynewcloud/
   ├── deploy.sh          # Implements standard interface
   ├── terraform/         # Optional: IaC files
   ├── config.example     # Provider-specific config
   └── README.md          # Provider documentation
   ```

2. Implement required functions in `deploy.sh`

3. Test with any app:
   ```bash
   ./scripts/deploy-generic.sh test-brain mynewcloud deploy
   ```

## Benefits

1. **Write Once, Deploy Anywhere**: Any app can use any provider
2. **Consistent Interface**: Same commands regardless of app or provider
3. **Easy Testing**: Deploy apps to local environment first
4. **Provider Choice**: Choose based on cost, features, or location
5. **App Independence**: Each app defines its own requirements

## Migration Path

To migrate existing scripts:

1. Keep current scripts as-is (they work!)
2. Gradually refactor to use generic structure
3. Move Hetzner-specific code to `deploy/providers/hetzner/`
4. Update apps to include `deploy.config.json`

## Future Enhancements

1. **Multi-provider deployments**: Deploy same app to multiple providers
2. **Blue-green deployments**: Using provider-specific features
3. **Cost calculator**: Estimate costs based on app requirements
4. **Provider feature matrix**: Compare provider capabilities
5. **Deployment profiles**: Dev, staging, production configs

## Conclusion

This generic deployment strategy provides:

- ✅ **True reusability** across all brain apps
- ✅ **Provider flexibility** without vendor lock-in
- ✅ **Consistent experience** regardless of deployment target
- ✅ **Easy extensibility** for new apps and providers
- ✅ **Gradual adoption** without breaking existing scripts

The strategy grows with your needs while maintaining simplicity for basic use cases.
