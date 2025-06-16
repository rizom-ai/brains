#!/usr/bin/env bash
# Deploy brain app to server

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check arguments
if [ $# -lt 2 ]; then
    log_error "Usage: $0 <user@host> <release-tarball> [--skip-backup]"
    log_error "Example: $0 deploy@myserver.com apps/test-brain/dist/test-brain-v1.0.0-linux-x64.tar.gz"
    exit 1
fi

SERVER="$1"
RELEASE_FILE="$2"
SKIP_BACKUP="${3:-}"

# Validate release file exists
if [ ! -f "$RELEASE_FILE" ]; then
    log_error "Release file not found: $RELEASE_FILE"
    exit 1
fi

# Extract app info from filename
RELEASE_NAME=$(basename "$RELEASE_FILE" .tar.gz)
log_info "Deploying $RELEASE_NAME to $SERVER"

# Test SSH connection
log_info "Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 "$SERVER" "echo 'SSH connection successful'" > /dev/null 2>&1; then
    log_error "Failed to connect to $SERVER"
    log_error "Make sure you have SSH access and the server is reachable"
    exit 1
fi

# Check if service exists on remote
SERVICE_EXISTS=$(ssh "$SERVER" "systemctl list-unit-files | grep -c personal-brain.service || true")

if [ "$SERVICE_EXISTS" -eq 0 ]; then
    log_warn "Service not found on server. This appears to be a first-time deployment."
    log_warn "Please run setup-server.sh first or use the setup.sh script included in the release."
    echo ""
    echo "To set up the server:"
    echo "  1. Copy and extract the release: scp $RELEASE_FILE $SERVER:~/"
    echo "  2. SSH to server: ssh $SERVER"
    echo "  3. Extract: tar -xzf $(basename $RELEASE_FILE)"
    echo "  4. Run setup: cd $RELEASE_NAME && ./setup.sh"
    exit 1
fi

# Create temporary directory on server
log_info "Preparing deployment..."
TEMP_DIR=$(ssh "$SERVER" "mktemp -d")

# Upload release
log_info "Uploading release..."
scp "$RELEASE_FILE" "$SERVER:$TEMP_DIR/"

# Deploy on server
log_info "Deploying on server..."
ssh "$SERVER" << EOF
set -euo pipefail

# Extract release
cd "$TEMP_DIR"
tar -xzf "$(basename $RELEASE_FILE)"
cd "$RELEASE_NAME"

# Stop service
echo "Stopping service..."
sudo systemctl stop personal-brain || true

# Backup current deployment
if [ "$SKIP_BACKUP" != "--skip-backup" ] && [ -f "/opt/personal-brain/brain" ]; then
    echo "Backing up current deployment..."
    sudo cp "/opt/personal-brain/brain" "/opt/personal-brain/brain.backup.\$(date +%Y%m%d_%H%M%S)"
fi

# Find binary name
BINARY_NAME=\$(ls brain* 2>/dev/null | head -1 || echo "brain")
echo "Deploying binary: \$BINARY_NAME"

# Copy new binary
sudo cp "\$BINARY_NAME" "/opt/personal-brain/brain"
sudo chmod +x "/opt/personal-brain/brain"
sudo chown personal-brain:personal-brain "/opt/personal-brain/brain"

# Update systemd service if needed
if [ -f "personal-brain.service" ]; then
    if ! diff -q "personal-brain.service" "/etc/systemd/system/personal-brain.service" > /dev/null 2>&1; then
        echo "Updating systemd service..."
        sudo cp "personal-brain.service" "/etc/systemd/system/"
        sudo systemctl daemon-reload
    fi
fi

# Run any database migrations
# The binary will handle this on startup

# Start service
echo "Starting service..."
sudo systemctl start personal-brain

# Wait for service to be ready
sleep 3

# Check status
if sudo systemctl is-active --quiet personal-brain; then
    echo "✅ Service started successfully"
else
    echo "❌ Service failed to start"
    sudo journalctl -u personal-brain -n 50 --no-pager
    exit 1
fi

# Clean up
cd /
rm -rf "$TEMP_DIR"
EOF

# Verify deployment
log_info "Verifying deployment..."
if ssh "$SERVER" "sudo systemctl is-active --quiet personal-brain"; then
    log_info "✅ Deployment successful!"
    
    # Get service info
    ssh "$SERVER" << 'EOF'
echo ""
echo "Service Status:"
sudo systemctl status personal-brain --no-pager | head -n 10
echo ""
echo "Recent logs:"
sudo journalctl -u personal-brain -n 5 --no-pager
EOF
else
    log_error "❌ Deployment verification failed"
    exit 1
fi

log_info "Deployment complete!"
echo ""
echo "Useful commands:"
echo "  Check status: ssh $SERVER 'sudo systemctl status personal-brain'"
echo "  View logs: ssh $SERVER 'sudo journalctl -u personal-brain -f'"
echo "  Restart: ssh $SERVER 'sudo systemctl restart personal-brain'"