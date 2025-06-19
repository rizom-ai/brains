#!/usr/bin/env bash
# Platform detection and normalization

# Source common utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

# Normalize platform name to standard format
normalize_platform() {
    local platform="${1:-}"
    
    # If empty, detect current platform
    if [ -z "$platform" ]; then
        platform="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"
    fi
    
    # Normalize common variations
    case "$platform" in
        darwin-arm64|darwin-aarch64)
            echo "darwin-arm64"
            ;;
        darwin-x86_64|darwin-amd64|darwin-x64)
            echo "darwin-x64"
            ;;
        linux-x86_64|linux-amd64|linux-x64)
            echo "linux-x64"
            ;;
        linux-aarch64|linux-arm64)
            echo "linux-arm64"
            ;;
        *)
            echo "$platform"
            ;;
    esac
}

# Get current platform
get_current_platform() {
    normalize_platform
}

# Check if platform is supported
is_platform_supported() {
    local platform="$1"
    local supported_platforms=(
        "linux-x64"
        "linux-arm64"
        "darwin-x64"
        "darwin-arm64"
    )
    
    for supported in "${supported_platforms[@]}"; do
        if [ "$platform" = "$supported" ]; then
            return 0
        fi
    done
    
    return 1
}

# Get Bun target for platform
get_bun_target() {
    local platform="$1"
    
    case "$platform" in
        linux-x64)
            echo "bun-linux-x64"
            ;;
        linux-arm64)
            echo "bun-linux-arm64"
            ;;
        darwin-x64)
            echo "bun-darwin-x64"
            ;;
        darwin-arm64)
            echo "bun-darwin-arm64"
            ;;
        *)
            log_error "Unsupported platform for Bun: $platform"
            return 1
            ;;
    esac
}

# Export functions
export -f normalize_platform get_current_platform is_platform_supported get_bun_target