# Deployment Guide

This guide covers various deployment strategies for the Personal Brain application, from local development to production cloud deployments.

## Deployment Options

The Personal Brain application supports multiple deployment strategies:

1. **Local Development** - Run directly with Bun
2. **Docker Container** - Single container deployment
3. **Docker Compose** - Multi-service orchestration
4. **Binary Executable** - Standalone compiled binary
5. **Cloud Deployment** - Hetzner Cloud with Terraform

## Local Development

The simplest way to run the application for development:

```bash
# Using the team-brain app
cd apps/team-brain
bun run dev

# Or using the collective-brain app
cd apps/collective-brain
bun run dev
```

This starts all interfaces (CLI, MCP, Matrix, Webserver) simultaneously with hot-reloading enabled.

## Docker Deployment

### Building the Docker Image

```bash
# Build the Docker image
docker build -t personal-brain:latest .

# Or use the build script
./scripts/docker-build.sh personal-brain
```

### Running with Docker

```bash
# Run with environment file
docker run -d \
  --name personal-brain \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  personal-brain:latest

# Or use docker-compose
docker-compose up -d
```

### Docker Compose Configuration

Create a `docker-compose.yml` file:

```yaml
version: "3.8"

services:
  brain:
    image: personal-brain:latest
    container_name: personal-brain
    ports:
      - "3000:3000" # Web server
      - "8080:8080" # MCP HTTP
    volumes:
      - ./data:/app/data
      - ./public:/app/public
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Binary Deployment

### Creating a Standalone Binary

```bash
# Compile to single executable
bun build apps/team-brain/brain.config.ts \
  --compile \
  --outfile dist/personal-brain

# Make it executable
chmod +x dist/personal-brain

# Run the binary
./dist/personal-brain
```

### Systemd Service

Create a systemd service for automatic startup:

```ini
# /etc/systemd/system/personal-brain.service
[Unit]
Description=Personal Brain Application
After=network.target

[Service]
Type=simple
User=brain
Group=brain
WorkingDirectory=/opt/personal-brain
ExecStart=/opt/personal-brain/personal-brain
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
EnvironmentFile=/opt/personal-brain/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable personal-brain
sudo systemctl start personal-brain
```

## Cloud Deployment (Hetzner)

### Prerequisites

- Terraform installed locally
- Hetzner Cloud account and API token
- Docker Registry account (optional)

### Infrastructure Setup

The deployment uses Terraform to manage infrastructure:

```bash
cd deployment/terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan \
  -var="hcloud_token=YOUR_HETZNER_TOKEN" \
  -var="app_name=personal-brain"

# Apply the configuration
terraform apply \
  -var="hcloud_token=YOUR_HETZNER_TOKEN" \
  -var="app_name=personal-brain"
```

### Deployment Script

Use the automated deployment script:

```bash
# Deploy to Hetzner Cloud
./scripts/deploy-hetzner.sh \
  --app personal-brain \
  --env production \
  --registry registry.example.com

# Options:
# --app       Application name
# --env       Environment (staging/production)
# --registry  Docker registry URL
# --no-build  Skip Docker build
# --no-push   Skip registry push
```

### Hetzner Infrastructure Details

The Terraform configuration creates:

- **Server**: CX11 instance (1 vCPU, 2GB RAM)
- **Firewall**: Configured for HTTP/HTTPS and SSH
- **Volume**: 10GB persistent storage
- **Networking**: Public IPv4 and IPv6

### Caddy Reverse Proxy

The deployment includes Caddy for automatic HTTPS:

```caddyfile
# /etc/caddy/Caddyfile
brain.example.com {
    reverse_proxy localhost:3000

    # Automatic HTTPS with Let's Encrypt
    tls {
        email admin@example.com
    }

    # Health check endpoint
    handle /health {
        respond "OK" 200
    }

    # Security headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }
}
```

## Production Configuration

### Environment Variables

For production deployments, configure these environment variables:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
NODE_ENV=production

# Database
DATABASE_PATH=/data/brain.db
DATABASE_BACKUP_PATH=/data/backups

# Server Configuration
HOST=0.0.0.0
PORT=3000

# Security
SESSION_SECRET=generate-secure-random-string
API_KEY=generate-secure-api-key

# Optional Services
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@bot:matrix.org
MATRIX_ACCESS_TOKEN=syt_...
MATRIX_DEVICE_ID=DEVICE123

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
LOG_LEVEL=info
```

### Security Considerations

1. **API Keys**: Store securely, never commit to repository
2. **Network Security**: Use firewall rules to restrict access
3. **HTTPS**: Always use HTTPS in production (handled by Caddy)
4. **Updates**: Regularly update dependencies and base images
5. **Backups**: Implement regular database backups

### Database Backups

Automated backup script:

```bash
#!/bin/bash
# /opt/personal-brain/backup.sh

BACKUP_DIR="/data/backups"
DB_PATH="/data/brain.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
sqlite3 $DB_PATH ".backup $BACKUP_DIR/brain_$TIMESTAMP.db"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "brain_*.db" -mtime +7 -delete
```

Add to crontab for daily backups:

```bash
0 2 * * * /opt/personal-brain/backup.sh
```

## Monitoring and Health Checks

### Health Check Endpoint

The application provides health check endpoints:

- `/health` - Basic health check
- `/api/health` - Detailed health status

### Monitoring with Prometheus

Add Prometheus metrics endpoint:

```typescript
// In your app configuration
import { PrometheusExporter } from "@brains/monitoring";

app.use("/metrics", PrometheusExporter.middleware());
```

### Logging

Configure structured logging for production:

```typescript
// Logger configuration
const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: "json",
  destination: process.env.LOG_PATH || "/var/log/personal-brain.log",
});
```

## Scaling Considerations

### Horizontal Scaling

For high-availability deployments:

1. **Database**: Use PostgreSQL instead of SQLite
2. **Load Balancer**: Deploy multiple instances behind a load balancer
3. **Session Store**: Use Redis for shared session storage
4. **File Storage**: Use S3-compatible object storage

### Performance Optimization

1. **Caching**: Implement Redis caching for frequently accessed data
2. **CDN**: Use a CDN for static assets
3. **Database Indexes**: Ensure proper indexing on frequently queried fields
4. **Connection Pooling**: Use database connection pooling

## Troubleshooting

### Common Issues

**Container won't start**

- Check logs: `docker logs personal-brain`
- Verify environment variables are set
- Ensure ports are not already in use

**Database connection errors**

- Check database file permissions
- Verify DATABASE_PATH is correct
- Ensure volume is properly mounted

**Memory issues**

- Increase Docker memory limit
- Check for memory leaks with `docker stats`
- Consider upgrading server instance

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Set in environment
DEBUG=* LOG_LEVEL=debug bun run dev

# Or in Docker
docker run -e DEBUG=* -e LOG_LEVEL=debug personal-brain:latest
```

## CI/CD Integration

### GitHub Actions Workflow

Example workflow for automatic deployment:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker image
        run: |
          docker build -t ${{ secrets.REGISTRY }}/personal-brain:${{ github.sha }} .
          docker tag ${{ secrets.REGISTRY }}/personal-brain:${{ github.sha }} \
                     ${{ secrets.REGISTRY }}/personal-brain:latest

      - name: Push to registry
        run: |
          echo "${{ secrets.REGISTRY_PASSWORD }}" | docker login -u ${{ secrets.REGISTRY_USER }} --password-stdin ${{ secrets.REGISTRY }}
          docker push ${{ secrets.REGISTRY }}/personal-brain:${{ github.sha }}
          docker push ${{ secrets.REGISTRY }}/personal-brain:latest

      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /opt/personal-brain
            docker-compose pull
            docker-compose up -d
```

## Support and Resources

- [Architecture Documentation](./architecture-overview.md)
- [Plugin Development](./plugin-system.md)
- [Development Workflow](./development-workflow.md)
- [GitHub Issues](https://github.com/your-org/brains/issues)
