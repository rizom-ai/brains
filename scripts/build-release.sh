#!/usr/bin/env bash
# Simplified build script for brain apps

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source libraries
source "$PROJECT_ROOT/deploy/scripts/lib/common.sh"
source "$PROJECT_ROOT/deploy/scripts/lib/config.sh"
source "$PROJECT_ROOT/deploy/scripts/lib/platform.sh"

# Set error handling
set_error_trap cleanup_on_error

# Global variables
TEMP_BINARY=""
RELEASE_DIR=""

# Cleanup function
cleanup_on_error() {
    [ -n "$TEMP_BINARY" ] && [ -f "$TEMP_BINARY" ] && rm -f "$TEMP_BINARY"
    [ -n "$RELEASE_DIR" ] && [ -d "$RELEASE_DIR" ] && rm -rf "$RELEASE_DIR"
}

# Usage
usage() {
    cat << EOF
Usage: $0 <app-name> [platform] [options]

Arguments:
  app-name    Name of the app to build
  platform    Target platform (default: current platform)
              Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64

Options:
  --docker    Use Docker build environment (recommended for cross-platform)
  --debug     Enable debug output
  --help      Show this help message

Examples:
  $0 test-brain                    # Build for current platform
  $0 test-brain linux-x64          # Build for Linux x64
  $0 test-brain linux-x64 --docker # Build using Docker

EOF
    exit 1
}

# Parse arguments
if [ $# -eq 0 ]; then
    usage
fi

# Check for help flag anywhere in arguments
for arg in "$@"; do
    if [ "$arg" = "--help" ]; then
        usage
    fi
done

APP_NAME="$1"
shift  # Remove app name

# Get platform if provided
PLATFORM=""
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then
    PLATFORM="$1"
    shift
fi

# Default options
USE_DOCKER=false

# Parse options
while [ $# -gt 0 ]; do
    case "$1" in
        --docker)
            USE_DOCKER=true
            shift
            ;;
        --debug)
            export DEBUG=1
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Ensure we're in project root
cd "$PROJECT_ROOT"

# Load app configuration
load_app_config "$APP_NAME"

# Normalize platform
PLATFORM=$(normalize_platform "$PLATFORM")

# Validate platform
if ! is_platform_supported "$PLATFORM"; then
    log_error "Unsupported platform: $PLATFORM"
    log_info "Supported platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64"
    exit 1
fi

# Build with Docker if requested
if [ "$USE_DOCKER" = true ] && [ ! -f /.dockerenv ]; then
    log_info "Using Docker build environment..."
    
    # Build Docker builder image if needed
    if ! docker images | grep -q "personal-brain-builder"; then
        docker build -f "deploy/docker/build/Dockerfile.build" -t personal-brain-builder:latest .
    fi
    
    # Run build in Docker
    docker run --rm \
        -v "$(pwd):/app" \
        -w "/app" \
        personal-brain-builder:latest \
        "./scripts/build-release.sh" "$APP_NAME" "$PLATFORM"
    
    exit $?
fi

# Run pre-build tasks
run_prebuild() {
    log_step "Running pre-build tasks"
    
    # Run database migrations if needed
    if [ -f "packages/db/src/migrate.ts" ]; then
        log_info "Running database migrations..."
        DATABASE_URL="file:./build-test.db" bun packages/db/src/migrate.ts || true
        rm -f build-test.db*
    fi
}

# Build the binary
build_binary() {
    log_step "Building binary for $PLATFORM"
    
    cd "$APP_DIR"
    
    # Clean build environment
    log_info "Cleaning build environment..."
    rm -rf node_modules
    
    # Install dependencies
    log_info "Installing dependencies..."
    BUN_INSTALL_CACHE_DIR="$(mktemp -d)" bun install --no-save
    
    # Get entry point
    local entry_point=$(get_config_value "$APP_CONFIG_PATH" "build.entryPoint" "./src/index.ts")
    
    # Get Bun target
    local bun_target=$(get_bun_target "$PLATFORM")
    
    # Build binary
    TEMP_BINARY="temp-binary"
    log_info "Compiling with Bun..."
    bun build "$entry_point" \
        --compile \
        --minify \
        --target="$bun_target" \
        --external=@libsql/client \
        --external=libsql \
        --external=@matrix-org/matrix-sdk-crypto-nodejs \
        --outfile "$TEMP_BINARY"
    
    if [ ! -f "$TEMP_BINARY" ]; then
        log_error "Binary compilation failed"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
}

# Create release package
create_release() {
    log_step "Creating release package"
    
    # Create release directory
    local release_name="${APP_NAME}-v${APP_VERSION}-${PLATFORM}"
    RELEASE_DIR="$APP_DIR/dist/$release_name"
    
    rm -rf "$RELEASE_DIR"
    mkdir -p "$RELEASE_DIR"
    
    # Copy binary
    cp "$APP_DIR/$TEMP_BINARY" "$RELEASE_DIR/$APP_BINARY_NAME"
    chmod +x "$RELEASE_DIR/$APP_BINARY_NAME"
    rm -f "$APP_DIR/$TEMP_BINARY"
    TEMP_BINARY=""
    
    # Copy deployment files
    cp "$APP_DIR/deploy/.env.production.example" "$RELEASE_DIR/.env.example"
    cp "$APP_DIR/deploy/personal-brain.service" "$RELEASE_DIR/"
    
    # Copy brain-data directory if it exists
    if [ -d "$APP_DIR/brain-data" ]; then
        log_info "Including brain-data directory..."
        cp -r "$APP_DIR/brain-data" "$RELEASE_DIR/"
    fi
    
    # Generate minimal package.json
    log_info "Generating package.json..."
    bun "$PROJECT_ROOT/scripts/extract-native-deps.js" "$APP_NAME" "$APP_VERSION" > "$RELEASE_DIR/package.json"
    
    # Create wrapper script
    create_wrapper_script "$RELEASE_DIR"
    
    # Create setup script
    create_setup_script "$RELEASE_DIR"
    
    # Create README
    create_readme "$RELEASE_DIR"
    
    # Create tarball
    log_info "Creating release archive..."
    cd "$APP_DIR/dist"
    tar -czf "$release_name.tar.gz" "$release_name"
    rm -rf "$release_name"
    cd "$PROJECT_ROOT"
    
    log_info "✅ Build complete!"
    echo ""
    echo "Release: $APP_DIR/dist/$release_name.tar.gz"
    echo "Size: $(du -h "$APP_DIR/dist/$release_name.tar.gz" | cut -f1)"
}

# Create wrapper script
create_wrapper_script() {
    local dir="$1"
    
    cat > "$dir/${APP_BINARY_NAME}-wrapper.sh" << 'EOF'
#!/usr/bin/env bash
# Wrapper script for Personal Brain with native module support

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set NODE_PATH to include our modules
export NODE_PATH="$SCRIPT_DIR/node_modules:$NODE_PATH"

# Execute the binary from its directory
cd "$SCRIPT_DIR"
exec "./$APP_BINARY_NAME" "$@"
EOF
    
    chmod +x "$dir/${APP_BINARY_NAME}-wrapper.sh"
}

# Create setup script
create_setup_script() {
    local dir="$1"
    
    cat > "$dir/setup.sh" << 'EOF'
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
BINARY_NAME=$(ls brain* 2>/dev/null | grep -v wrapper | head -1 || echo "brain")

echo "Installing Personal Brain..."

# Create directories
sudo mkdir -p /opt/personal-brain/{data,brain-repo,website,brain-data}

# Create user if doesn't exist
if ! id "personal-brain" &>/dev/null; then
    sudo useradd -r -s /bin/false -d /opt/personal-brain personal-brain
fi

# Set ownership
sudo chown -R personal-brain:personal-brain /opt/personal-brain

# Copy files
sudo cp "$BINARY_NAME" "${BINARY_NAME}-wrapper.sh" /opt/personal-brain/
sudo chmod +x "/opt/personal-brain/$BINARY_NAME" "/opt/personal-brain/${BINARY_NAME}-wrapper.sh"

# Copy brain-data if it exists
if [ -d "brain-data" ]; then
    echo "Copying brain-data files..."
    sudo cp -r brain-data /opt/personal-brain/
    sudo chown -R personal-brain:personal-brain /opt/personal-brain/brain-data
fi

# Copy and install dependencies
sudo cp package.json /opt/personal-brain/
cd /opt/personal-brain
sudo -u personal-brain bun install --production

# Copy environment file if it doesn't exist
if [ ! -f "/opt/personal-brain/.env" ]; then
    sudo cp .env.example /opt/personal-brain/.env
    sudo chmod 600 /opt/personal-brain/.env
    sudo chown personal-brain:personal-brain /opt/personal-brain/.env
    echo ""
    echo "IMPORTANT: Edit /opt/personal-brain/.env with your configuration"
fi

# Install systemd service
sudo cp personal-brain.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable personal-brain

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit /opt/personal-brain/.env with your configuration"
echo "2. Start the service: sudo systemctl start personal-brain"
echo "3. Check status: sudo systemctl status personal-brain"
EOF
    
    chmod +x "$dir/setup.sh"
}

# Create README
create_readme() {
    local dir="$1"
    
    cat > "$dir/README.md" << EOF
# Personal Brain v$APP_VERSION

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

## Platform

This binary is built for: **$PLATFORM**
EOF
}

# Main execution
main() {
    log_info "Building $APP_NAME v$APP_VERSION for $PLATFORM"
    
    run_prebuild
    build_binary
    create_release
}

# Run main
main