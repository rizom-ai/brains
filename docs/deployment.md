# Personal Brain Deployment Guide

This guide covers multiple deployment methods for your Personal Brain application.

## Deployment Methods

1. **Hetzner Cloud** (Recommended) - Automated cloud deployment with HTTPS
2. **Docker Deployment** - Simple containerized deployment
3. **Manual Server Deployment** - Traditional Linux server setup
4. **Local Development** - Run directly with Bun

## Prerequisites

### For Hetzner Cloud (Recommended)

- Hetzner Cloud account and API token
- Terraform installed locally
- Docker registry account (GitHub Container Registry or Docker Hub)
- SSH key for server access

### For Docker Deployment

- Docker installed locally or on target server
- Docker Compose v2 (included with modern Docker)

### For Manual Deployment

- A Linux server (Ubuntu 20.04+ or Debian 11+ recommended)
- SSH access with sudo privileges
- Git installed on your local machine
- Bun installed on your local machine

## Hetzner Cloud Deployment (Recommended)

### Quick Start

1. **Configure Hetzner Provider**:

```bash
# Create configuration file
cp deploy/providers/hetzner/config.env.example deploy/providers/hetzner/config.env

# Edit with your credentials:
vim deploy/providers/hetzner/config.env
```

Required configuration:
```bash
# Hetzner Cloud API token (get from console.hetzner.cloud)
HCLOUD_TOKEN=your-hetzner-api-token

# Docker Registry (GitHub Container Registry recommended)
DOCKER_REGISTRY=ghcr.io
REGISTRY_USER=your-github-username
REGISTRY_TOKEN=your-github-token  # needs write:packages scope
```

2. **Configure App Environment**:

```bash
# Create production environment file
cp apps/test-brain/deploy/.env.example apps/test-brain/deploy/.env.production

# Edit with your app settings:
vim apps/test-brain/deploy/.env.production
```

3. **Deploy**:

```bash
# Deploy new infrastructure and application
bun run brain:deploy test-brain hetzner deploy

# Update existing deployment
bun run brain:deploy test-brain hetzner update

# Check deployment status
bun run brain:deploy test-brain hetzner status

# Destroy infrastructure
bun run brain:deploy test-brain hetzner destroy
```

### Features

- ✅ Automatic HTTPS with Caddy and Let's Encrypt
- ✅ Terraform infrastructure as code
- ✅ Per-app isolated deployments
- ✅ Shared SSH key management
- ✅ GitHub Container Registry or Docker Hub support
- ✅ Automated Docker image builds and pushes
- ✅ Custom domains with automatic SSL
- ✅ Idempotent deployments (handles existing infrastructure)
- ✅ Server sizes from €3.29/month (cx22) to €50+/month (cx51)

### Architecture

```
┌─────────────────┐
│  Local Machine  │
│   (Terraform)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│  Hetzner Cloud  │────▶│ Docker Reg.  │
│     Server      │     │ (ghcr.io)    │
└────────┬────────┘     └──────────────┘
         │
    ┌────▼─────┐
    │  Caddy   │ (Reverse Proxy + HTTPS)
    └────┬─────┘
         │
    ┌────▼─────┐
    │  Brain   │ (Main app on port 8080)
    │   App    │ (Preview on port 4321)
    └──────────┘
```

### Custom Domain Configuration

In your app's `.env.production`:

```bash
# Optional - enables HTTPS with your domain
DOMAIN=yourdomain.com

# The deployment will automatically set up:
# - https://yourdomain.com (main site)
# - https://preview.yourdomain.com (preview site)
```

Point your domain's DNS to the server IP shown after deployment.

### Multiple Apps

Each app gets its own isolated server:

```bash
# Deploy different apps to separate servers
bun run brain:deploy test-brain hetzner deploy
bun run brain:deploy team-brain hetzner deploy
bun run brain:deploy personal-brain hetzner deploy

# Each app has its own:
# - Hetzner server instance
# - Terraform state in apps/{app-name}/deploy/terraform-state/
# - Docker container and volumes
# - Domain configuration
```

### Infrastructure Management

The deployment is split into two phases:

1. **Shared Resources** (managed centrally):
   - SSH keys (one per Hetzner account)
   - Managed in `deploy/providers/hetzner/shared/`

2. **App Resources** (per-app isolation):
   - Server instance
   - Firewall rules
   - Docker containers
   - Managed in `apps/{app-name}/deploy/terraform-state/`

## Docker Deployment

### Local Docker

For local testing or simple deployments:

```bash
# Build Docker image
docker build -f deploy/docker/Dockerfile \
  --build-arg APP_NAME=test-brain \
  -t personal-brain:latest .

# Run container
docker run -d \
  --name personal-brain \
  -p 3333:3333 \
  -v ~/personal-brain-data:/app/data \
  -v ~/personal-brain-brain-data:/app/brain-data \
  -v ~/personal-brain-config/.env:/app/.env:ro \
  personal-brain:latest
```

### Docker Compose

Use the provided docker-compose files:

```bash
# Development (local testing)
cd deploy/docker
docker-compose up -d

# Production (with Caddy for HTTPS)
cd deploy/docker
docker-compose -f docker-compose.prod.yml up -d
```

The docker-compose.yml mounts local directories:
- `./data:/app/data` - Database files
- `./brain-data:/app/brain-data` - Entity storage
- `./brain-repo:/app/brain-repo` - Git repository (if using git-sync)
- `./.env:/app/.env:ro` - Environment configuration

## Manual Server Deployment

### 1. Build the Release

From your local development machine:

```bash
# Build a release for Linux x64
./scripts/build-release.sh test-brain linux-x64

# For other platforms:
# ./scripts/build-release.sh test-brain darwin-x64    # macOS Intel
# ./scripts/build-release.sh test-brain darwin-arm64  # macOS Apple Silicon
# ./scripts/build-release.sh test-brain linux-arm64   # Linux ARM64
```

This creates a release archive at: `apps/test-brain/dist/test-brain-v{VERSION}-{PLATFORM}.tar.gz`

### 2. Initial Server Setup

For first-time deployment, prepare your server:

```bash
# Copy setup script to server
scp scripts/setup-server.sh user@your-server:~/

# SSH to server and run setup
ssh user@your-server
./setup-server.sh
```

This script will:

- Create the `personal-brain` system user
- Set up directory structure at `/opt/personal-brain`
- Configure systemd service
- Set up log rotation
- Create backup scripts

### 3. Deploy the Application

#### Option A: Using the Deploy Script (Recommended)

```bash
# From your local machine
./scripts/deploy.sh user@your-server apps/test-brain/dist/test-brain-v0.1.0-linux-x64.tar.gz
```

#### Option B: Manual Deployment

```bash
# Copy release to server
scp apps/test-brain/dist/test-brain-v0.1.0-linux-x64.tar.gz user@your-server:~/

# SSH to server
ssh user@your-server

# Extract release
tar -xzf test-brain-v0.1.0-linux-x64.tar.gz
cd test-brain-v0.1.0-linux-x64

# Run setup (first time only)
./setup.sh

# Or manually copy files (for updates)
sudo systemctl stop personal-brain
sudo cp brain /opt/personal-brain/
sudo systemctl start personal-brain
```

### 4. Configure Environment

Edit the environment file with your settings:

```bash
sudo nano /opt/personal-brain/.env
```

Required configuration:

```bash
# AI Provider Key (required)
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE

# Database (default is fine for most cases)
DATABASE_URL=file:/opt/personal-brain/data/brain.db

# Server binding (use 127.0.0.1 if behind reverse proxy)
BRAIN_SERVER_HOST=127.0.0.1
BRAIN_SERVER_PORT=3333
```

Optional features:

```bash
# Matrix Bot Interface
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@your-bot:matrix.org
MATRIX_ACCESS_TOKEN=syt_YOUR_TOKEN
MATRIX_ANCHOR_USER_ID=@you:matrix.org

# Git Sync
GIT_REPO_PATH=/opt/personal-brain/brain-repo
GIT_REMOTE_URL=git@github.com:username/brain-data.git
```

### 5. Start the Service

```bash
# Start the service
sudo systemctl start personal-brain

# Enable auto-start on boot
sudo systemctl enable personal-brain

# Check status
sudo systemctl status personal-brain

# View logs
sudo journalctl -u personal-brain -f
```

## Updating

To update to a new version:

1. Build new release: `./scripts/build-release.sh test-brain`
2. Deploy: `./scripts/deploy.sh user@server apps/test-brain/dist/test-brain-vX.X.X-linux-x64.tar.gz`

The deploy script automatically:

- Backs up the current binary
- Stops the service
- Deploys the new binary
- Starts the service
- Verifies deployment

## Management Commands

### Service Management

```bash
# Start/Stop/Restart
sudo systemctl start personal-brain
sudo systemctl stop personal-brain
sudo systemctl restart personal-brain

# Check status
sudo systemctl status personal-brain

# View logs
sudo journalctl -u personal-brain -f
sudo journalctl -u personal-brain -n 100  # Last 100 lines

# Helper commands (if setup-server.sh was used)
brain-status  # Quick status check
brain-logs    # Live log tail
```

### Backup and Restore

Manual backup:

```bash
sudo /opt/personal-brain/backup.sh
```

Backups are stored in `/opt/personal-brain/backups/` and include:

- Database file
- Environment configuration
- Git repository (if configured)

To restore:

```bash
# Stop service
sudo systemctl stop personal-brain

# Extract backup
cd /opt/personal-brain
tar -xzf backups/brain-backup-YYYYMMDD_HHMMSS.tar.gz

# Restore files
cp brain-backup-*/brain.db data/
cp brain-backup-*/.env .

# Start service
sudo systemctl start personal-brain
```

## Security Considerations

1. **API Keys**: Keep your `.env` file secure (mode 600)
2. **Network**: Bind to localhost if using reverse proxy
3. **Firewall**: Only open required ports
4. **Updates**: Regularly update the binary and dependencies

## Reverse Proxy Setup (Optional)

For HTTPS access, use a reverse proxy like Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name brain.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Service won't start

```bash
# Check logs for errors
sudo journalctl -u personal-brain -n 50

# Verify file permissions
ls -la /opt/personal-brain/

# Test binary directly
sudo -u personal-brain /opt/personal-brain/brain
```

### Database locked error

- Ensure only one instance is running
- Check for zombie processes: `ps aux | grep brain`

### Port already in use

```bash
# Find what's using the port
sudo netstat -tlnp | grep 3333

# Kill the process if needed
sudo kill <PID>
```

### Permission denied

- Check file ownership: `chown -R personal-brain:personal-brain /opt/personal-brain`
- Verify systemd service user configuration

## Platform-Specific Builds

The build script supports multiple platforms:

- `linux-x64`: Standard Linux servers (Ubuntu, Debian, CentOS)
- `linux-arm64`: ARM-based servers (Raspberry Pi 4, AWS Graviton)
- `darwin-x64`: macOS Intel
- `darwin-arm64`: macOS Apple Silicon (M1/M2/M3)

Example:

```bash
# Build for Raspberry Pi
./scripts/build-release.sh test-brain linux-arm64
```

## Advanced Configuration

### Multiple Instances

To run multiple brain instances on one server:

1. Use different install paths: `/opt/brain-work`, `/opt/brain-personal`
2. Create separate systemd services with different names
3. Use different ports in each `.env` file
4. Configure reverse proxy with different domains/paths

### High Availability

For critical deployments:

1. Use PostgreSQL instead of SQLite
2. Set up regular backups to external storage
3. Consider load balancing with multiple instances
4. Monitor with tools like Prometheus/Grafana

## Support

For issues or questions:

- Check logs: `sudo journalctl -u personal-brain -f`
- Review this guide's troubleshooting section
- Open an issue on GitHub
