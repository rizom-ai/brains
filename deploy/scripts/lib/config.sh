#!/usr/bin/env bash
# Configuration handling utilities

# Source common utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

# Extract deployment config from brain.config.ts
# This runs the config file with --export-deploy-config flag to get JSON
extract_deploy_config() {
    local app_name="$1"
    local app_dir="apps/$app_name"
    local config_file="$app_dir/brain.config.ts"

    if [ ! -f "$config_file" ]; then
        log_error "Brain config not found: $config_file"
        return 1
    fi

    # Run config file with export flag - outputs JSON
    local config_json
    config_json=$(cd "$app_dir" && bun brain.config.ts --export-deploy-config 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$config_json" ]; then
        log_error "Failed to extract deploy config from $config_file"
        return 1
    fi

    echo "$config_json"
}

# Validate app exists and has brain.config.ts
validate_app() {
    local app_name="$1"
    local app_dir="apps/$app_name"
    local config_path="$app_dir/brain.config.ts"

    if [ ! -d "$app_dir" ]; then
        log_error "App '$app_name' not found in apps/"
        return 1
    fi

    if [ ! -f "$config_path" ]; then
        log_error "Brain config not found: $config_path"
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

# Load app configuration from brain.config.ts
load_app_config() {
    local app_name="$1"
    local config_path=$(validate_app "$app_name") || return 1

    # Extract deployment config from brain.config.ts
    local config_json
    config_json=$(extract_deploy_config "$app_name") || return 1

    # Export configuration as environment variables
    export APP_NAME="$app_name"
    export APP_CONFIG_PATH="$config_path"
    export APP_DIR="apps/$app_name"
    export APP_VERSION=$(echo "$config_json" | jq -r '.version // "0.1.0"')

    # Server/deployment settings
    export APP_PROVIDER=$(echo "$config_json" | jq -r '.provider // "hetzner"')
    export APP_SERVER_SIZE=$(echo "$config_json" | jq -r '.serverSize // "cx33"')
    export APP_LOCATION=$(echo "$config_json" | jq -r '.location // "fsn1"')
    export APP_DOMAIN=$(echo "$config_json" | jq -r '.domain // empty')

    # Docker settings
    export APP_DOCKER_ENABLED=$(echo "$config_json" | jq -r '.docker.enabled // true')
    export APP_DOCKER_IMAGE=$(echo "$config_json" | jq -r '.docker.image // "'$app_name'"')

    # Port settings
    export APP_DEFAULT_PORT=$(echo "$config_json" | jq -r '.ports.default // 3333')
    export APP_PREVIEW_PORT=$(echo "$config_json" | jq -r '.ports.preview // 4321')
    export APP_PRODUCTION_PORT=$(echo "$config_json" | jq -r '.ports.production // 8080')

    # CDN settings
    export APP_CDN_ENABLED=$(echo "$config_json" | jq -r '.cdn.enabled // false')
    export APP_CDN_PROVIDER=$(echo "$config_json" | jq -r '.cdn.provider // "none"')

    # DNS settings
    export APP_DNS_ENABLED=$(echo "$config_json" | jq -r '.dns.enabled // false')
    export APP_DNS_PROVIDER=$(echo "$config_json" | jq -r '.dns.provider // "none"')

    # Paths
    export APP_INSTALL_PATH=$(echo "$config_json" | jq -r '.paths.install // "/opt/'$app_name'"')
    export APP_DATA_PATH=$(echo "$config_json" | jq -r '.paths.data // "/opt/'$app_name'/data"')

    # Legacy compatibility - service name and binary name
    export APP_SERVICE_NAME="$app_name"
    export APP_BINARY_NAME="brain"

    log_debug "Loaded config for $APP_NAME v$APP_VERSION (provider=$APP_PROVIDER, domain=$APP_DOMAIN)"
}

# Get list of available apps
get_available_apps() {
    local apps_dir="apps"

    if [ ! -d "$apps_dir" ]; then
        return
    fi

    # List directories that have brain.config.ts
    for app_dir in "$apps_dir"/*; do
        if [ -d "$app_dir" ] && [ -f "$app_dir/brain.config.ts" ]; then
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
export -f extract_deploy_config validate_app get_config_value load_app_config get_available_apps load_provider_config