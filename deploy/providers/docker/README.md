# Docker Provider

Deploy Personal Brain apps as Docker containers locally or on remote servers.

## Quick Start

```bash
# Deploy to local Docker
./scripts/deploy-brain.sh test-brain docker deploy

# Deploy to remote server
./scripts/deploy-brain.sh test-brain docker deploy user@server.com

# Check status
./scripts/deploy-brain.sh test-brain docker status user@server.com

# Update deployment
./scripts/deploy-brain.sh test-brain docker update user@server.com

# Remove deployment
./scripts/deploy-brain.sh test-brain docker destroy user@server.com
```

## How It Works

1. **Build Phase**: Creates a release with external native modules
2. **Image Creation**: Multi-stage Docker build with pre-installed dependencies
3. **Deployment**: Runs container with docker-compose
4. **Environment**: Uses `.env.production` from app's deploy directory

## Architecture

The Docker provider:
- Uses the standard provider interface from deploy-brain.sh
- Delegates to `deploy/scripts/deploy-docker.sh` for actual deployment
- Supports both local and remote Docker deployments
- Handles native modules via multi-stage builds

## Configuration

### Optional: config.env

Create `deploy/providers/docker/config.env` for defaults:

```bash
# Docker registry (optional)
DOCKER_REGISTRY=ghcr.io/myorg

# Default tag
DOCKER_TAG=latest

# Default server (if not specified)
DOCKER_SERVER=docker.example.com
```

### App Configuration

Each app needs:
1. `apps/<name>/deploy/deploy.config.json` - Standard deployment config
2. `apps/<name>/deploy/.env.production` - Production environment variables

## Deployment Methods

### Local Docker
```bash
./scripts/deploy-brain.sh test-brain docker deploy
# or explicitly:
./scripts/deploy-brain.sh test-brain docker deploy local
```

Deploys to Docker on your local machine.

### Remote Docker
```bash
./scripts/deploy-brain.sh test-brain docker deploy user@server.com
```

Requirements:
- SSH access to server
- Docker and docker-compose installed on server
- User has Docker permissions

### With Registry
```bash
# Set registry in config.env or environment
export DOCKER_REGISTRY=ghcr.io/myorg
./scripts/deploy-brain.sh test-brain docker deploy server.com
```

## Native Modules

Native modules (LibSQL, Matrix crypto) are handled automatically:
- Build process marks them as external
- Docker build installs them in first stage
- Final image has pre-installed dependencies
- No runtime installation needed

## Volumes

The deployment creates volumes for:
- `/app/data` - Database and persistent data
- `/app/brain-repo` - Git repository for brain content
- `/app/website` - Generated website files

## Networking

Default port mapping: `<app-port>:3333`

The app's default port (from deploy.config.json) is mapped to the container's port 3333.

## Health Checks

Containers include health checks:
- Endpoint: `http://localhost:3333/health`
- Interval: 30s
- Timeout: 3s
- Retries: 3

## Troubleshooting

### View Logs
```bash
# Local
docker logs personal-brain

# Remote
ssh user@server.com 'docker logs personal-brain'
```

### Shell Access
```bash
# Local
docker exec -it personal-brain /bin/bash

# Remote
ssh user@server.com 'docker exec -it personal-brain /bin/bash'
```

### Common Issues

1. **Permission denied**: Ensure user has Docker access
2. **Port already in use**: Change port in deploy.config.json
3. **Out of space**: Check Docker disk usage with `docker system df`

## Comparison with Hetzner Provider

| Feature | Docker Provider | Hetzner Provider |
|---------|----------------|------------------|
| Infrastructure | Existing server | Creates new VPS |
| Cost | $0 (uses existing) | ~€5/month |
| Setup Time | ~1 minute | ~5 minutes |
| Isolation | Container | Full VM |
| Resource Usage | Shared | Dedicated |
| Best For | Development, small deployments | Production, isolation needed |