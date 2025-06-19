#!/usr/bin/env bash
# Configuration handling utilities

# Source common utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

# Validate app exists and has deploy config
validate_app() {
    local app_name="$1"
    local app_dir="apps/$app_name"
    local config_path="$app_dir/deploy/deploy.config.json"
    
    if [ ! -d "$app_dir" ]; then
        log_error "App '$app_name' not found in apps/"
        return 1
    fi
    
    if [ ! -f "$config_path" ]; then
        log_error "Deploy config not found: $config_path"
        return 1
    fi
    
    # Validate JSON
    if ! jq empty "$config_path" 2>/dev/null; then
        log_error "Invalid JSON in $config_path"
        return 1
    fi
    
    echo "$config_path"
}

# Get configuration value with default
get_config_value() {
    local config_path="$1"
    local key="$2"
    local default="${3:-}"
    
    local value=$(jq -r ".$key // empty" "$config_path" 2>/dev/null)
    
    if [ -z "$value" ] || [ "$value" = "null" ]; then
        echo "$default"
    else
        echo "$value"
    fi
}

# Load app configuration
load_app_config() {
    local app_name="$1"
    local config_path=$(validate_app "$app_name") || return 1
    
    # Export configuration as environment variables
    export APP_NAME="$app_name"
    export APP_CONFIG_PATH="$config_path"
    export APP_DIR="apps/$app_name"
    export APP_SERVICE_NAME=$(get_config_value "$config_path" "serviceName" "personal-brain")
    export APP_BINARY_NAME=$(get_config_value "$config_path" "binaryName" "brain")
    export APP_INSTALL_PATH=$(get_config_value "$config_path" "installPath" "/opt/personal-brain")
    export APP_DEFAULT_PORT=$(get_config_value "$config_path" "defaultPort" "3333")
    export APP_VERSION=$(jq -r '.version // "0.1.0"' "$APP_DIR/package.json" 2>/dev/null || echo "0.1.0")
    
    log_debug "Loaded config for $APP_NAME v$APP_VERSION"
}

# Get list of available apps
get_available_apps() {
    local apps_dir="apps"
    
    if [ ! -d "$apps_dir" ]; then
        return
    fi
    
    # List directories that have deploy.config.json
    for app_dir in "$apps_dir"/*; do
        if [ -d "$app_dir" ] && [ -f "$app_dir/deploy/deploy.config.json" ]; then
            basename "$app_dir"
        fi
    done
}

# Load provider configuration
load_provider_config() {
    local provider="$1"
    local config_file="deploy/providers/$provider/config.env"
    
    if [ -f "$config_file" ]; then
        log_debug "Loading provider config: $config_file"
        set -a  # Export all variables
        source "$config_file"
        set +a
    fi
}

# Export functions
export -f validate_app get_config_value load_app_config get_available_apps load_provider_config