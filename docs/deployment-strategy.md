# Personal Brain Deployment Strategy

## Overview
Leverage Bun's native compilation to create standalone executables for easy deployment without Docker or complex dependencies.

## Architecture Decision
We chose to use Bun's compilation feature over containerization because:
- **No runtime dependencies** - Single binary deployment
- **Smaller deployment size** - No Node.js, npm, or container overhead
- **Faster startup** - Direct execution without container initialization
- **Simpler operations** - No Docker daemon or orchestration needed

Note: We may consider Kamal in the future if we need multi-server deployments, load balancing, or zero-downtime updates.

## Components

### 1. Build Script (`scripts/build-release.sh`)
Compiles optimized production executable and creates release archive.

**Features:**
- Compile with `--minify` for smaller size
- Bundle necessary configuration templates
- Create platform-specific builds
- Generate release notes from git log

**Output structure:**
```
personal-brain-v1.0.0-linux-x64.tar.gz
├── brain                      # Compiled executable
├── .env.example              # Environment template
├── personal-brain.service    # Systemd service file
├── setup.sh                  # Quick setup script
└── README.md                 # Deployment instructions
```

### 2. Deployment Script (`scripts/deploy.sh`)
Automates deployment to a configured server.

**Features:**
- Upload binary via SCP
- Backup existing deployment
- Update environment variables
- Run database migrations
- Restart systemd service
- Health check verification

### 3. Systemd Service (`scripts/personal-brain.service`)
Manages the brain as a system service.

**Configuration:**
```ini
[Unit]
Description=Personal Brain MCP Server
After=network.target

[Service]
Type=simple
ExecStart=/opt/personal-brain/brain
Restart=always
RestartSec=10
User=personal-brain
Group=personal-brain
Environment="NODE_ENV=production"
EnvironmentFile=/opt/personal-brain/.env

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=personal-brain

[Install]
WantedBy=multi-user.target
```

### 4. GitHub Actions Workflow (`.github/workflows/release.yml`)
Automates releases on version tags.

**Triggers:**
- Push to tags matching `v*`
- Manual workflow dispatch

**Jobs:**
1. Build and test
2. Create platform binaries (linux-x64, darwin-x64, darwin-arm64)
3. Create GitHub release with binaries
4. Optional: Deploy to staging/production

### 5. Server Setup Script (`scripts/setup-server.sh`)
Initial server configuration for new deployments.

**Tasks:**
- Create system user
- Set up directory structure
- Configure systemd service
- Set up log rotation
- Initialize database
- Configure firewall rules

### 6. Environment Configuration
Production environment variables template.

**Required variables:**
```bash
# Database
DATABASE_URL=file:/opt/personal-brain/data/brain.db

# AI Provider
ANTHROPIC_API_KEY=sk-ant-...

# Server Configuration
BRAIN_SERVER_PORT=3333
BRAIN_SERVER_HOST=0.0.0.0

# Optional: Matrix Interface
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@brain:matrix.org
MATRIX_ACCESS_TOKEN=...
MATRIX_ANCHOR_USER_ID=@admin:matrix.org

# Optional: Git Sync
GIT_REPO_PATH=/opt/personal-brain/brain-repo
GIT_REMOTE_URL=git@github.com:user/brain-data.git
```

## Deployment Process

### First-time Setup
1. Run `setup-server.sh` on target server
2. Configure `.env` with credentials
3. Deploy initial binary with `deploy.sh`
4. Verify service is running

### Updates
1. Tag new version: `git tag v1.0.1`
2. Push tag: `git push origin v1.0.1`
3. GitHub Actions builds release
4. Run `deploy.sh` or download from releases

### Manual Deployment
```bash
# Build release locally
./scripts/build-release.sh

# Deploy to server
./scripts/deploy.sh user@server.com

# Or manually
scp dist/brain user@server:/opt/personal-brain/
ssh user@server "sudo systemctl restart personal-brain"
```

## Monitoring and Maintenance

### Health Checks
- Systemd status: `systemctl status personal-brain`
- Logs: `journalctl -u personal-brain -f`
- HTTP health endpoint: `http://localhost:3333/health`

### Backups
- Database: `/opt/personal-brain/data/brain.db`
- Git repo: `/opt/personal-brain/brain-repo`
- Environment: `/opt/personal-brain/.env`

### Updates
- Zero-downtime not required for single-user deployment
- Simple binary replacement and restart
- Database migrations run automatically

## Security Considerations

1. **User Isolation**: Run as dedicated system user
2. **File Permissions**: Restrict access to data directory
3. **Environment Variables**: Secure `.env` file (mode 600)
4. **Network**: Bind to localhost if using reverse proxy
5. **Secrets**: Never commit credentials to git

## Future Enhancements

### Phase 2: Multi-instance Support
- Add HAProxy or Caddy for load balancing
- Implement session affinity for Matrix connections
- Consider SQLite replication or PostgreSQL

### Phase 3: Kamal Integration (if needed)
- Containerize for consistency across environments
- Leverage Kamal's zero-downtime deployments
- Add health checks and rolling updates
- Multi-region deployment support

## Troubleshooting

### Common Issues
1. **Binary won't start**: Check execute permissions
2. **Database locked**: Ensure single instance running
3. **Port already in use**: Check for zombie processes
4. **Missing environment**: Verify `.env` file exists

### Debug Commands
```bash
# Check service status
sudo systemctl status personal-brain

# View recent logs
sudo journalctl -u personal-brain -n 100

# Test binary directly
sudo -u personal-brain /opt/personal-brain/brain

# Check port binding
sudo netstat -tlnp | grep 3333
```