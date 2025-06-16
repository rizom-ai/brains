#!/usr/bin/env bash
# Build release binaries for brain apps

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

# Check if app name is provided
if [ $# -eq 0 ]; then
    log_error "Usage: $0 <app-name> [platform]"
    log_error "Example: $0 test-brain linux-x64"
    log_error "Available apps:"
    ls -1 apps/
    exit 1
fi

APP_NAME="$1"
APP_DIR="apps/$APP_NAME"
PLATFORM="${2:-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)}"

# Normalize platform names
case "$PLATFORM" in
    "darwin-arm64"|"darwin-aarch64")
        PLATFORM="darwin-arm64"
        ;;
    "darwin-x86_64"|"darwin-amd64")
        PLATFORM="darwin-x64"
        ;;
    "linux-x86_64"|"linux-amd64")
        PLATFORM="linux-x64"
        ;;
    "linux-aarch64")
        PLATFORM="linux-arm64"
        ;;
esac

# Check if app exists
if [ ! -d "$APP_DIR" ]; then
    log_error "App '$APP_NAME' not found in apps/"
    exit 1
fi

# Check if deploy config exists
DEPLOY_CONFIG="$APP_DIR/deploy/deploy.config.json"
if [ ! -f "$DEPLOY_CONFIG" ]; then
    log_error "Deploy config not found: $DEPLOY_CONFIG"
    exit 1
fi

# Read configuration
log_info "Reading deploy configuration..."
BINARY_NAME=$(jq -r '.binaryName' "$DEPLOY_CONFIG")
ENTRY_POINT=$(jq -r '.build.entryPoint' "$DEPLOY_CONFIG")
VERSION=$(jq -r '.version' "$APP_DIR/package.json")

log_info "Building $APP_NAME v$VERSION for $PLATFORM"

# Get absolute paths
PROJECT_ROOT=$(pwd)
APP_DIR_ABS="$PROJECT_ROOT/$APP_DIR"
DIST_DIR="$APP_DIR_ABS/dist"

# Create dist directory
mkdir -p "$DIST_DIR"

# Run pre-build tasks
log_info "Running pre-build tasks..."
cd "$APP_DIR"

# Run database migrations if needed
if [ -f "../../packages/db/src/migrate.ts" ]; then
    log_info "Running database migrations..."
    DATABASE_URL="file:./build-test.db" bun run db:migrate || true
    rm -f build-test.db*
fi

# Build the binary
log_info "Compiling binary..."
TEMP_BINARY="$DIST_DIR/temp-binary"
case "$PLATFORM" in
    linux-*)
        bun build "$ENTRY_POINT" \
            --compile \
            --minify \
            --target=bun-linux-x64 \
            --outfile "$TEMP_BINARY"
        ;;
    darwin-x64)
        bun build "$ENTRY_POINT" \
            --compile \
            --minify \
            --target=bun-darwin-x64 \
            --outfile "$TEMP_BINARY"
        ;;
    darwin-arm64)
        bun build "$ENTRY_POINT" \
            --compile \
            --minify \
            --target=bun-darwin-arm64 \
            --outfile "$TEMP_BINARY"
        ;;
    *)
        log_error "Unsupported platform: $PLATFORM"
        exit 1
        ;;
esac

# Create release directory
RELEASE_NAME="${APP_NAME}-v${VERSION}-${PLATFORM}"
RELEASE_DIR="$DIST_DIR/$RELEASE_NAME"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Copy files to release
log_info "Preparing release package..."
if [ ! -f "$TEMP_BINARY" ]; then
    log_error "Binary not found: $TEMP_BINARY"
    exit 1
fi
mv "$TEMP_BINARY" "$RELEASE_DIR/$BINARY_NAME"
cp deploy/.env.production.example "$RELEASE_DIR/.env.example"
cp deploy/personal-brain.service "$RELEASE_DIR/"
log_info "Files copied to release directory"

# Create setup script
cat > "$RELEASE_DIR/setup.sh" << 'EOF'
#!/usr/bin/env bash
# Quick setup script for Personal Brain

set -euo pipefail

echo "Personal Brain Setup"
echo "==================="

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Please run as a normal user with sudo access"
   exit 1
fi

# Get binary name from current directory
BINARY_NAME=$(ls brain* 2>/dev/null | head -1 || echo "brain")
SERVICE_FILE="personal-brain.service"

echo "Found binary: $BINARY_NAME"

# Create user if doesn't exist
if ! id "personal-brain" &>/dev/null; then
    echo "Creating personal-brain user..."
    sudo useradd -r -s /bin/false -d /opt/personal-brain personal-brain
fi

# Create directories
echo "Creating directories..."
sudo mkdir -p /opt/personal-brain/{data,brain-repo,website}
sudo chown -R personal-brain:personal-brain /opt/personal-brain

# Copy binary
echo "Installing binary..."
sudo cp "$BINARY_NAME" /opt/personal-brain/
sudo chmod +x "/opt/personal-brain/$BINARY_NAME"
sudo chown personal-brain:personal-brain "/opt/personal-brain/$BINARY_NAME"

# Copy environment file if it doesn't exist
if [ ! -f "/opt/personal-brain/.env" ]; then
    echo "Creating environment file..."
    sudo cp .env.example /opt/personal-brain/.env
    sudo chmod 600 /opt/personal-brain/.env
    sudo chown personal-brain:personal-brain /opt/personal-brain/.env
    echo ""
    echo "IMPORTANT: Edit /opt/personal-brain/.env with your configuration"
    echo "At minimum, set your ANTHROPIC_API_KEY"
fi

# Install systemd service
echo "Installing systemd service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable personal-brain

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit /opt/personal-brain/.env with your configuration"
echo "2. Start the service: sudo systemctl start personal-brain"
echo "3. Check status: sudo systemctl status personal-brain"
echo "4. View logs: sudo journalctl -u personal-brain -f"
EOF

chmod +x "$RELEASE_DIR/setup.sh"

# Create README
cat > "$RELEASE_DIR/README.md" << EOF
# Personal Brain v$VERSION

## Quick Start

1. Run the setup script:
   \`\`\`bash
   ./setup.sh
   \`\`\`

2. Configure your environment:
   \`\`\`bash
   sudo nano /opt/personal-brain/.env
   \`\`\`

3. Start the service:
   \`\`\`bash
   sudo systemctl start personal-brain
   \`\`\`

## Manual Installation

1. Create user and directories:
   \`\`\`bash
   sudo useradd -r -s /bin/false -d /opt/personal-brain personal-brain
   sudo mkdir -p /opt/personal-brain/{data,brain-repo,website}
   sudo chown -R personal-brain:personal-brain /opt/personal-brain
   \`\`\`

2. Copy files:
   \`\`\`bash
   sudo cp $BINARY_NAME /opt/personal-brain/
   sudo chmod +x /opt/personal-brain/$BINARY_NAME
   sudo cp .env.example /opt/personal-brain/.env
   sudo chmod 600 /opt/personal-brain/.env
   sudo chown -R personal-brain:personal-brain /opt/personal-brain
   \`\`\`

3. Install systemd service:
   \`\`\`bash
   sudo cp personal-brain.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable personal-brain
   sudo systemctl start personal-brain
   \`\`\`

## Configuration

Edit \`/opt/personal-brain/.env\` to configure:
- AI provider credentials
- Matrix bot settings (optional)
- Git sync settings (optional)
- Web server settings (optional)

## Commands

- Start: \`sudo systemctl start personal-brain\`
- Stop: \`sudo systemctl stop personal-brain\`
- Restart: \`sudo systemctl restart personal-brain\`
- Status: \`sudo systemctl status personal-brain\`
- Logs: \`sudo journalctl -u personal-brain -f\`

## Platform

This binary is built for: **$PLATFORM**
EOF

# Create tarball
log_info "Creating release archive..."
cd "$DIST_DIR"

if [ -d "$RELEASE_NAME" ]; then
    tar -czf "$RELEASE_NAME.tar.gz" "$RELEASE_NAME" || {
        log_error "Failed to create tarball"
        exit 1
    }
    cd "$PROJECT_ROOT"
    
    # Clean up only on success
    rm -rf "$RELEASE_DIR"
else
    log_error "Release directory not found: $RELEASE_NAME"
    exit 1
fi

# Output summary
cd "$PROJECT_ROOT"
FINAL_ARCHIVE="$APP_DIR/dist/$RELEASE_NAME.tar.gz"
if [ -f "$FINAL_ARCHIVE" ]; then
    log_info "✅ Build complete!"
    echo ""
    echo "Release: $FINAL_ARCHIVE"
    echo "Size: $(du -h "$FINAL_ARCHIVE" | cut -f1)"
    echo ""
    echo "To deploy:"
    echo "  ./scripts/deploy.sh user@server $FINAL_ARCHIVE"
else
    log_error "Failed to create release archive"
    exit 1
fi