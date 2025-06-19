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
BINARY_NAME=\$(ls brain* 2>/dev/null | grep -v wrapper | head -1 || echo "brain")
# Wrapper is always named brain-wrapper.sh
WRAPPER_NAME="brain-wrapper.sh"
echo "Deploying binary: \$BINARY_NAME"
echo "Looking for wrapper: \$WRAPPER_NAME"
ls -la | grep wrapper || echo "No wrapper found"

# Copy binary and related files
sudo cp "\$BINARY_NAME" "/opt/personal-brain/brain"
sudo chmod +x "/opt/personal-brain/brain"

# Copy package.json if it exists (for native dependencies)
if [ -f "package.json" ]; then
    echo "Installing native dependencies..."
    sudo cp "package.json" "/opt/personal-brain/"
    
    # Create node_modules directory with proper permissions
    sudo mkdir -p "/opt/personal-brain/node_modules"
    sudo chown -R personal-brain:personal-brain "/opt/personal-brain"
    
    # Install dependencies as personal-brain user
    # First check which package manager is available
    echo "Checking for package managers..."
    echo "  Checking /usr/local/bin/bun..."
    ls -la /usr/local/bin/bun 2>/dev/null || echo "    Not found"
    echo "  Checking /root/.bun/bin/bun..."
    sudo ls -la /root/.bun/bin/bun 2>/dev/null || echo "    Not found"
    echo "  Checking for bun in PATH..."
    which bun || echo "    Not in PATH"
    echo "  Checking for npm..."
    which npm || echo "    Not in PATH"
    
    # Try to find bun in common locations
    if [ -L "/usr/local/bin/bun" ]; then
        # Check if symlink target is accessible
        TARGET=\$(readlink /usr/local/bin/bun)
        echo "  /usr/local/bin/bun points to: \$TARGET"
        if ! sudo -u personal-brain test -x "\$TARGET"; then
            echo "  Target not accessible by personal-brain user, fixing..."
            if sudo test -x "/root/.bun/bin/bun"; then
                sudo mkdir -p /opt/bun/bin
                sudo cp /root/.bun/bin/bun /opt/bun/bin/
                sudo chmod 755 /opt/bun/bin/bun
                sudo ln -sf /opt/bun/bin/bun /usr/local/bin/bun
                echo "  Bun relocated to /opt/bun/bin/bun"
            fi
        fi
    fi
    
    if [ -x "/usr/local/bin/bun" ] && sudo -u personal-brain test -x "/usr/local/bin/bun"; then
        echo "Using bun from /usr/local/bin/bun..."
        sudo -u personal-brain bash -c "cd /opt/personal-brain && /usr/local/bin/bun install --production"
        # Check if Matrix SDK crypto binary exists
        if [ -d "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs" ]; then
            echo "Checking Matrix SDK crypto module..."
            if ! sudo test -f "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/matrix-sdk-crypto.linux-x64-gnu.node"; then
                echo "Matrix crypto binary missing, downloading..."
                # Run download-lib.js if it exists
                if [ -f "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/download-lib.js" ]; then
                    if command -v node >/dev/null 2>&1; then
                        sudo -u personal-brain bash -c "cd /opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs && node download-lib.js"
                    else
                        echo "ERROR: Node.js required to download Matrix crypto binary"
                        echo "Install with: sudo apt-get install nodejs"
                    fi
                fi
            else
                echo "Matrix crypto binary already present"
            fi
        fi
    elif sudo test -x "/root/.bun/bin/bun"; then
        echo "Found bun in /root/.bun, copying to accessible location..."
        # Copy bun to a location accessible by all users
        sudo mkdir -p /opt/bun/bin
        sudo cp /root/.bun/bin/bun /opt/bun/bin/
        sudo chmod 755 /opt/bun/bin/bun
        sudo ln -sf /opt/bun/bin/bun /usr/local/bin/bun
        echo "Using bun from /opt/bun/bin/bun..."
        sudo -u personal-brain bash -c "cd /opt/personal-brain && /usr/local/bin/bun install --production"
        # Check if Matrix SDK crypto binary exists
        if [ -d "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs" ]; then
            echo "Checking Matrix SDK crypto module..."
            if ! sudo test -f "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/matrix-sdk-crypto.linux-x64-gnu.node"; then
                echo "Matrix crypto binary missing, downloading..."
                # Run download-lib.js if it exists
                if [ -f "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/download-lib.js" ]; then
                    if command -v node >/dev/null 2>&1; then
                        sudo -u personal-brain bash -c "cd /opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs && node download-lib.js"
                    else
                        echo "ERROR: Node.js required to download Matrix crypto binary"
                        echo "Install with: sudo apt-get install nodejs"
                    fi
                fi
            else
                echo "Matrix crypto binary already present"
            fi
        fi
    elif command -v npm >/dev/null 2>&1; then
        echo "Using npm..."
        NPM_PATH=\$(which npm)
        sudo -u personal-brain bash -c "cd /opt/personal-brain && \$NPM_PATH install --production --no-audit --no-fund"
        # Check if Matrix SDK crypto binary exists
        if [ -d "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs" ]; then
            echo "Checking Matrix SDK crypto module..."
            if ! sudo test -f "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/matrix-sdk-crypto.linux-x64-gnu.node"; then
                echo "Matrix crypto binary missing, downloading..."
                # Run download-lib.js if it exists
                if [ -f "/opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs/download-lib.js" ]; then
                    if command -v node >/dev/null 2>&1; then
                        sudo -u personal-brain bash -c "cd /opt/personal-brain/node_modules/@matrix-org/matrix-sdk-crypto-nodejs && node download-lib.js"
                    else
                        echo "ERROR: Node.js required to download Matrix crypto binary"
                        echo "Install with: sudo apt-get install nodejs"
                    fi
                fi
            else
                echo "Matrix crypto binary already present"
            fi
        fi
    else
        echo "ERROR: Neither bun nor npm found"
        echo "Current PATH: \$PATH"
        echo "To install bun, run: curl -fsSL https://bun.sh/install | sudo bash"
        exit 1
    fi
fi

# Copy wrapper script if it exists
if [ -f "\$WRAPPER_NAME" ]; then
    echo "Using wrapper script for native module support"
    sudo cp "\$WRAPPER_NAME" "/opt/personal-brain/brain-wrapper.sh"
    sudo chmod +x "/opt/personal-brain/brain-wrapper.sh"
    # Update systemd to use wrapper
    EXEC_PATH="/opt/personal-brain/brain-wrapper.sh"
else
    EXEC_PATH="/opt/personal-brain/brain"
fi

# Set ownership
sudo chown -R personal-brain:personal-brain /opt/personal-brain/

# Update systemd service if needed
if [ -f "personal-brain.service" ]; then
    # If using wrapper, update the service file
    if [ "\$EXEC_PATH" = "/opt/personal-brain/brain-wrapper.sh" ]; then
        echo "Updating systemd service for wrapper script..."
        # Create temporary service file with updated ExecStart
        sed "s|ExecStart=/opt/personal-brain/brain|ExecStart=/opt/personal-brain/brain-wrapper.sh|g" personal-brain.service > personal-brain.service.tmp
        sudo cp personal-brain.service.tmp /etc/systemd/system/personal-brain.service
        rm personal-brain.service.tmp
        sudo systemctl daemon-reload
    elif ! diff -q "personal-brain.service" "/etc/systemd/system/personal-brain.service" > /dev/null 2>&1; then
        echo "Updating systemd service..."
        sudo cp "personal-brain.service" "/etc/systemd/system/"
        sudo systemctl daemon-reload
    fi
fi

# Debug: Show what's in the directory
echo "Contents of /opt/personal-brain:"
sudo ls -la /opt/personal-brain/

# Debug: Show systemd service
echo "Current systemd service:"
sudo cat /etc/systemd/system/personal-brain.service | grep ExecStart

# Run any database migrations
# The binary will handle this on startup

# Check for ONNX Runtime (required for embeddings)
if ! sudo test -f "/usr/lib/libonnxruntime.so.1"; then
    echo "Installing ONNX Runtime..."
    cd /tmp
    sudo curl -L https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-1.21.0.tgz -o onnxruntime.tgz
    sudo tar -xzf onnxruntime.tgz
    sudo cp onnxruntime-linux-x64-1.21.0/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so.1.21.0
    sudo ln -sf /usr/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so.1
    sudo ln -sf /usr/lib/libonnxruntime.so.1.21.0 /usr/lib/libonnxruntime.so
    sudo ldconfig
    sudo rm -rf /tmp/onnxruntime*
    cd - > /dev/null
fi

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