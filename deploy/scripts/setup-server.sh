#!/usr/bin/env bash
# Initial server setup for Personal Brain deployment

set -euo pipefail

# Check for non-interactive mode
NON_INTERACTIVE=false
if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ] || [ "${BRAIN_SETUP_NON_INTERACTIVE:-}" = "true" ]; then
    NON_INTERACTIVE=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Check if running with appropriate permissions
if [ "$EUID" -eq 0 ]; then 
   log_error "Please run as a normal user with sudo access, not as root"
   exit 1
fi

# Verify sudo access
if ! sudo -n true 2>/dev/null; then
    log_info "This script requires sudo access. Please enter your password:"
    sudo true
fi

# Get configuration
APP_USER="${BRAIN_USER:-personal-brain}"
APP_GROUP="${BRAIN_GROUP:-personal-brain}"
INSTALL_PATH="${BRAIN_INSTALL_PATH:-/opt/personal-brain}"
DATA_PATH="${BRAIN_DATA_PATH:-/opt/personal-brain/data}"

log_step "Personal Brain Server Setup"
echo "Configuration:"
echo "  User/Group: $APP_USER:$APP_GROUP"
echo "  Install Path: $INSTALL_PATH"
echo "  Data Path: $DATA_PATH"
echo ""
if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Continue with setup? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    log_info "Running in non-interactive mode"
fi

# System updates
log_step "System Preparation"
log_info "Updating package lists..."
sudo apt-get update -qq

log_info "Installing required packages..."
sudo apt-get install -y -qq \
    curl \
    git \
    jq \
    unzip \
    build-essential \
    python3 \
    python3-pip \
    nodejs

# Install ONNX Runtime (required for embeddings)
log_step "Installing ONNX Runtime"
if [ ! -f "/usr/lib/libonnxruntime.so.1" ]; then
    log_info "Downloading ONNX Runtime..."
    cd /tmp
    curl -L https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-1.21.0.tgz -o onnxruntime.tgz
    tar -xzf onnxruntime.tgz
    sudo cp onnxruntime-linux-x64-1.21.0/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so.1.21.0
    sudo ln -sf /usr/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so.1
    sudo ln -sf /usr/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so
    sudo ldconfig
    rm -rf /tmp/onnxruntime*
    log_info "ONNX Runtime installed successfully"
else
    log_info "ONNX Runtime already installed"
fi

# Install Bun if not present
if ! command -v bun &> /dev/null && [ ! -x "/opt/bun/bin/bun" ]; then
    log_info "Installing Bun system-wide..."
    # Install bun in a system location accessible to all users
    export BUN_INSTALL="/opt/bun"
    curl -fsSL https://bun.sh/install | sudo -E bash
    # Create symlink in /usr/local/bin for system-wide access
    sudo ln -sf /opt/bun/bin/bun /usr/local/bin/bun
    # Make sure it's executable and accessible
    sudo chmod 755 /opt/bun/bin/bun
    sudo chmod -R 755 /opt/bun
    # Verify installation
    if [ -x "/usr/local/bin/bun" ]; then
        log_info "Bun installed successfully"
        /usr/local/bin/bun --version
    else
        log_warn "Bun installation may have failed"
    fi
elif [ -L "/usr/local/bin/bun" ] && [ ! -r "$(readlink /usr/local/bin/bun)" ]; then
    # Fix broken symlink pointing to inaccessible location
    log_info "Fixing bun installation..."
    if [ -x "/root/.bun/bin/bun" ]; then
        # Copy bun to system location
        sudo mkdir -p /opt/bun/bin
        sudo cp /root/.bun/bin/bun /opt/bun/bin/
        sudo chmod 755 /opt/bun/bin/bun
        sudo ln -sf /opt/bun/bin/bun /usr/local/bin/bun
        log_info "Bun relocated to /opt/bun/bin/bun"
    fi
else
    log_info "Bun is already installed"
    which bun || log_info "Bun path: $(ls -la /usr/local/bin/bun 2>/dev/null || echo 'not found')"
fi

# Create user
log_step "User Setup"
if id "$APP_USER" &>/dev/null; then
    log_info "User $APP_USER already exists"
    # Ensure user has a shell for running commands
    sudo usermod -s /bin/bash "$APP_USER"
else
    log_info "Creating user $APP_USER..."
    # Create with bash shell to allow running commands
    sudo useradd -r -s /bin/bash -d "$INSTALL_PATH" "$APP_USER"
fi

# Create directory structure
log_step "Directory Setup"
log_info "Creating directory structure..."
sudo mkdir -p "$INSTALL_PATH"/{data,brain-repo,website,logs,backups,.npm,.bun,.matrix-storage}

# Set up permissions
log_info "Setting permissions..."
sudo chown -R "$APP_USER:$APP_GROUP" "$INSTALL_PATH"
sudo chmod 750 "$INSTALL_PATH"
sudo chmod 700 "$INSTALL_PATH/data" "$INSTALL_PATH/backups"
# Ensure npm/bun cache directories are writable
sudo chmod 755 "$INSTALL_PATH/.npm" "$INSTALL_PATH/.bun"

# Set up log rotation
log_step "Log Rotation Setup"
log_info "Configuring log rotation..."
sudo tee /etc/logrotate.d/personal-brain > /dev/null << EOF
$INSTALL_PATH/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $APP_USER $APP_GROUP
    sharedscripts
    postrotate
        systemctl reload personal-brain > /dev/null 2>&1 || true
    endscript
}
EOF

# Create environment template
log_step "Environment Configuration"
if [ ! -f "$INSTALL_PATH/.env" ]; then
    log_info "Creating environment template..."
    sudo tee "$INSTALL_PATH/.env" > /dev/null << 'EOF'
# Personal Brain Configuration
# Generated by setup-server.sh

# Database
DATABASE_URL=file:/opt/personal-brain/data/brain.db

# AI Provider (Required - add your key)
ANTHROPIC_API_KEY=

# Server Configuration
BRAIN_SERVER_PORT=3333
BRAIN_SERVER_HOST=127.0.0.1
BRAIN_ENV=production
LOG_LEVEL=info

# Add additional configuration as needed
# See .env.production.example for all options
EOF
    sudo chmod 600 "$INSTALL_PATH/.env"
    sudo chown "$APP_USER:$APP_GROUP" "$INSTALL_PATH/.env"
    
    log_warn "Remember to edit $INSTALL_PATH/.env with your API keys!"
else
    log_info "Environment file already exists"
fi

# Set up backup script
log_step "Backup Configuration"
log_info "Creating backup script..."
sudo tee "$INSTALL_PATH/backup.sh" > /dev/null << 'EOF'
#!/bin/bash
# Personal Brain Backup Script

BACKUP_DIR="/opt/personal-brain/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="brain-backup-$TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Stop service for consistent backup
systemctl stop personal-brain

# Backup database
cp -p /opt/personal-brain/data/brain.db "$BACKUP_DIR/$BACKUP_NAME/"

# Backup git repo if exists
if [ -d "/opt/personal-brain/brain-repo/.git" ]; then
    tar -czf "$BACKUP_DIR/$BACKUP_NAME/brain-repo.tar.gz" -C /opt/personal-brain brain-repo
fi

# Backup environment
cp -p /opt/personal-brain/.env "$BACKUP_DIR/$BACKUP_NAME/"

# Create archive
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

# Start service
systemctl start personal-brain

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/brain-backup-*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup completed: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
EOF

sudo chmod +x "$INSTALL_PATH/backup.sh"
sudo chown "$APP_USER:$APP_GROUP" "$INSTALL_PATH/backup.sh"

# Set up cron for backups
log_info "Setting up daily backups..."
(sudo crontab -l 2>/dev/null || true; echo "0 3 * * * $INSTALL_PATH/backup.sh >> $INSTALL_PATH/logs/backup.log 2>&1") | sudo crontab -

# Firewall setup (if ufw is installed)
if command -v ufw &> /dev/null; then
    log_step "Firewall Configuration"
    log_info "Configuring firewall..."
    
    # Only open port if explicitly requested
    if [ "$NON_INTERACTIVE" = false ]; then
        read -p "Open port 3333 in firewall? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo ufw allow 3333/tcp comment "Personal Brain MCP Server"
            log_info "Port 3333 opened in firewall"
        else
            log_info "Firewall not modified. Access through reverse proxy recommended."
        fi
    else
        log_info "Skipping firewall configuration (non-interactive mode)"
    fi
fi

# Create systemd service placeholder
log_step "Systemd Configuration"
if [ ! -f "/etc/systemd/system/personal-brain.service" ]; then
    log_info "Creating systemd service template..."
    sudo tee /etc/systemd/system/personal-brain.service > /dev/null << EOF
[Unit]
Description=Personal Brain MCP Server
After=network.target

[Service]
Type=simple
ExecStart=/opt/personal-brain/brain
Restart=always
RestartSec=10
User=$APP_USER
Group=$APP_GROUP
Environment="NODE_ENV=production"
EnvironmentFile=$INSTALL_PATH/.env
WorkingDirectory=$INSTALL_PATH
StandardOutput=journal
StandardError=journal
SyslogIdentifier=personal-brain

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    log_info "Systemd service created (not started - waiting for binary)"
else
    log_info "Systemd service already exists"
fi

# Create helper scripts
log_step "Helper Scripts"
log_info "Creating helper scripts..."

# Status script
sudo tee /usr/local/bin/brain-status > /dev/null << 'EOF'
#!/bin/bash
echo "=== Personal Brain Status ==="
systemctl status personal-brain --no-pager
echo ""
echo "=== Recent Logs ==="
journalctl -u personal-brain -n 20 --no-pager
EOF
sudo chmod +x /usr/local/bin/brain-status

# Logs script
sudo tee /usr/local/bin/brain-logs > /dev/null << 'EOF'
#!/bin/bash
journalctl -u personal-brain -f
EOF
sudo chmod +x /usr/local/bin/brain-logs

# Summary
log_step "Setup Complete!"
echo "✅ Server is prepared for Personal Brain deployment"
echo ""
echo "Next steps:"
echo "1. Edit configuration: sudo nano $INSTALL_PATH/.env"
echo "2. Deploy the application using deploy.sh or manually copy the binary"
echo "3. Start the service: sudo systemctl start personal-brain"
echo ""
echo "Useful commands:"
echo "  brain-status  - Check service status"
echo "  brain-logs    - View live logs"
echo "  sudo $INSTALL_PATH/backup.sh - Run manual backup"
echo ""
echo "Directories:"
echo "  Install: $INSTALL_PATH"
echo "  Data: $DATA_PATH"
echo "  Logs: $INSTALL_PATH/logs"
echo "  Backups: $INSTALL_PATH/backups"