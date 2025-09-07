# Personal Brain Deployment Guide

This guide covers multiple deployment methods for your Personal Brain application.

## Deployment Methods

1. **Docker Deployment** (Recommended) - Simple containerized deployment
2. **Hetzner Cloud** - Terraform-based cloud deployment with HTTPS
3. **Manual Server Deployment** - Traditional Linux server setup
4. **Local Development** - Run directly with Bun

## Prerequisites

### For Docker Deployment
- Docker installed locally or on target server
- Docker Compose v2 (included with modern Docker)

### For Hetzner Cloud
- Hetzner Cloud account and API token
- Terraform installed locally
- SSH key for server access

### For Manual Deployment
- A Linux server (Ubuntu 20.04+ or Debian 11+ recommended)
- SSH access with sudo privileges
- Git installed on your local machine
- Bun installed on your local machine

## Docker Deployment (Recommended)

### Quick Start

```bash
# Build and run with Docker
bun run brain:deploy test-brain

# Or manually:
docker build -f deploy/docker-v2/Dockerfile.simple \
  --build-arg APP_NAME=test-brain \
  -t personal-brain:latest .

docker run -d \
  --name personal-brain \
  -p 3333:3333 \
  -v ~/personal-brain-data:/app/data \
  -v ~/personal-brain-config/.env:/app/.env:ro \
  personal-brain:latest
```

### Docker Compose

```yaml
services:
  brain:
    build:
      context: .
      dockerfile: deploy/docker-v2/Dockerfile.simple
      args:
        APP_NAME: test-brain
    ports:
      - "3333:3333"
    volumes:
      - ./data:/app/data
      - ./brain-data:/app/brain-data
      - ./.env:/app/.env:ro
    restart: unless-stopped
```

## Hetzner Cloud Deployment

### Setup

1. **Configure Provider**:
```bash
cp deploy/providers/hetzner/config.env.example deploy/providers/hetzner/config.env
# Edit config.env with your Hetzner API token
```

2. **Deploy**:
```bash
bun run brain:deploy test-brain hetzner deploy
```

3. **Features**:
- Automatic HTTPS with Caddy reverse proxy
- Terraform infrastructure as code
- GitHub Container Registry support
- Automated backups
- Server sizes from €3.29/month

### Custom Domain

Set in your app's `.env`:
```bash
PRODUCTION_DOMAIN=yourdomain.com
PREVIEW_DOMAIN=preview.yourdomain.com
```

### Architecture

The Hetzner deployment uses:
- **Terraform** for infrastructure as code
- **Docker Compose** for container orchestration  
- **Caddy** for automatic HTTPS with Let's Encrypt
- **GitHub Container Registry** for image storage

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
