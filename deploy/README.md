# Brain Apps Deployment System

This directory contains the generic deployment infrastructure for all brain apps.

## Quick Start

Deploy any brain app to any provider:

```bash
# Deploy to Hetzner Cloud VM
./scripts/deploy-brain.sh test-brain hetzner deploy

# Deploy to Docker (local)
./scripts/deploy-brain.sh test-brain docker deploy

# Deploy to Docker (remote server)
./scripts/deploy-brain.sh test-brain docker deploy user@server.com

# Update existing deployment
./scripts/deploy-brain.sh test-brain hetzner update

# Check status
./scripts/deploy-brain.sh test-brain docker status

# Destroy deployment
./scripts/deploy-brain.sh test-brain docker destroy
```

## Directory Structure

```
deploy/
├── README.md           # This file
├── common/            # Shared resources
│   └── templates/     # Template files for all providers
├── providers/         # Provider implementations
│   ├── docker/       # Docker container deployment
│   ├── hetzner/      # Hetzner Cloud provider
│   ├── digitalocean/ # DigitalOcean (future)
│   ├── aws/          # AWS EC2 (future)
│   └── local/        # Local systemd (future)
└── apps/             # App-specific overrides (optional)
```

## For App Developers

To make your app deployable:

1. Create `apps/your-app/deploy/deploy.config.json`:

```json
{
  "name": "your-app",
  "serviceName": "your-app-service",
  "binaryName": "your-app",
  "defaultPort": 3333,
  "installPath": "/opt/your-app",
  "platforms": ["linux-x64", "linux-arm64"],
  "deployment": {
    "preferredProvider": "hetzner",
    "serverSize": {
      "hetzner": "cx11",
      "digitalocean": "s-1vcpu-1gb"
    }
  }
}
```

2. Create `apps/your-app/deploy/.env.production.example` with required environment variables

3. Deploy: `./scripts/deploy-brain.sh your-app hetzner deploy`

## For Provider Developers

To add a new provider:

1. Create `deploy/providers/yourprovider/` directory
2. Implement `deploy/providers/yourprovider/deploy.sh` with required functions:

   - `deploy_infrastructure()` - Create servers
   - `update_application()` - Update existing deployment
   - `destroy_infrastructure()` - Tear down servers
   - `get_status()` - Check deployment status

3. Test with any app: `./scripts/deploy-brain.sh test-brain yourprovider deploy`

## Hetzner Provider

### Prerequisites

1. Install Terraform: https://www.terraform.io/downloads
2. Get Hetzner API token: https://console.hetzner.cloud/
3. Configure provider:

```bash
cp deploy/providers/hetzner/config.env.example deploy/providers/hetzner/config.env
# Edit config.env with your HCLOUD_TOKEN
```

### Usage

```bash
# First deployment
./scripts/deploy-brain.sh test-brain hetzner deploy

# Update application
./scripts/deploy-brain.sh test-brain hetzner update

# Destroy (creates backup first)
./scripts/deploy-brain.sh test-brain hetzner destroy
```

## Templates

Common templates in `deploy/common/templates/`:

- `systemd.service.template` - Systemd service configuration
- `caddy.template` - Caddy reverse proxy configuration
- `backup.sh.template` - Backup script template

Templates use `{{variable}}` syntax and are populated from `deploy.config.json`.

## Security

- SSH keys are required for all deployments
- Environment files (.env) are secured with 600 permissions
- Systemd services run as dedicated users
- Automatic security updates are configured

## Troubleshooting

- Check provider prerequisites (Terraform, API tokens)
- Ensure SSH key exists at `~/.ssh/id_rsa.pub`
- Verify app has `deploy/deploy.config.json`
- Check provider logs for detailed errors
