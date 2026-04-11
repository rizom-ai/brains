#!/usr/bin/env bash
# Configuration handling utilities

# Source common utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

# Extract deployment config as JSON.
# Supports both brain.yaml (new) and brain.config.ts (legacy).
# For brain.yaml apps, prefers deploy/brain.yaml when present.
extract_deploy_config() {
    local app_name="$1"
    local app_dir="apps/$app_name"

    # TODO: Remove this legacy brain.config.ts fallback once no supported app depends on it.
    # Legacy path: brain.config.ts
    if [ -f "$app_dir/brain.config.ts" ]; then
        local config_json
        config_json=$(cd "$app_dir" && bun brain.config.ts --export-deploy-config 2>/dev/null)
        if [ $? -ne 0 ] || [ -z "$config_json" ]; then
            log_error "Failed to extract deploy config from $app_dir/brain.config.ts"
            return 1
        fi
        echo "$config_json"
        return 0
    fi

    # New path: brain.yaml
    if [ ! -f "$app_dir/brain.yaml" ] && [ ! -f "$app_dir/deploy/brain.yaml" ]; then
        log_error "No brain.yaml or brain.config.ts found in $app_dir"
        return 1
    fi

    # For deploy, prefer deploy/brain.yaml (has production domain, etc.)
    # Temporarily copy it as brain.yaml so the brains CLI can find it
    local used_deploy_yaml=false
    if [ -f "$app_dir/deploy/brain.yaml" ]; then
        if [ -f "$app_dir/brain.yaml" ]; then
            cp "$app_dir/brain.yaml" "$app_dir/brain.yaml.bak"
        fi
        cp "$app_dir/deploy/brain.yaml" "$app_dir/brain.yaml"
        used_deploy_yaml=true
    fi

    # Run brains CLI with export flag - outputs JSON
    local config_json
    config_json=$(cd "$app_dir" && bunx brains --export-deploy-config 2>/dev/null)
    local exit_code=$?

    # Restore original brain.yaml
    if [ "$used_deploy_yaml" = true ]; then
        if [ -f "$app_dir/brain.yaml.bak" ]; then
            mv "$app_dir/brain.yaml.bak" "$app_dir/brain.yaml"
        else
            rm -f "$app_dir/brain.yaml"
        fi
    fi

    if [ $exit_code -ne 0 ] || [ -z "$config_json" ]; then
        log_error "Failed to extract deploy config from $app_dir/brain.yaml"
        return 1
    fi

    echo "$config_json"
}

# Validate app exists and has brain.yaml or brain.config.ts
# TODO: Remove the legacy brain.config.ts check once no supported app depends on it.
validate_app() {
    local app_name="$1"
    local app_dir="apps/$app_name"

    if [ ! -d "$app_dir" ]; then
        log_error "App '$app_name' not found in apps/"
        return 1
    fi

    if [ -f "$app_dir/brain.config.ts" ]; then
        echo "$app_dir/brain.config.ts"
    elif [ -f "$app_dir/brain.yaml" ] || [ -f "$app_dir/deploy/brain.yaml" ]; then
        echo "$app_dir/brain.yaml"
    else
        log_error "No brain.yaml or brain.config.ts found in $app_dir"
        return 1
    fi
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

    # Extract deployment config from brain.yaml
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

    # List directories that have brain.yaml or brain.config.ts
    # TODO: Remove the legacy brain.config.ts check once no supported app depends on it.
    for app_dir in "$apps_dir"/*; do
        if [ -d "$app_dir" ] && { [ -f "$app_dir/brain.yaml" ] || [ -f "$app_dir/deploy/brain.yaml" ] || [ -f "$app_dir/brain.config.ts" ]; }; then
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

# Validate production env against brain's .env.schema using varlock
validate_production_env() {
    local app_name="$1"
    local app_dir="apps/$app_name"

    # Find the production env file
    local env_file="$app_dir/deploy/.env.production"
    if [ ! -f "$env_file" ]; then
        log_warn "No .env.production found at $env_file — skipping env validation"
        return 0
    fi

    # Get brain package name from brain.yaml (prefer deploy/brain.yaml)
    local brain_yaml="$app_dir/brain.yaml"
    [ -f "$app_dir/deploy/brain.yaml" ] && brain_yaml="$app_dir/deploy/brain.yaml"

    if [ ! -f "$brain_yaml" ]; then
        log_warn "No brain.yaml found — skipping env validation"
        return 0
    fi

    local brain_package
    brain_package=$(grep '^brain:' "$brain_yaml" | sed 's/brain:\s*//' | sed 's/["'"'"']//g' | tr -d '[:space:]')

    # Map @brains/name → brains/name/
    local brain_dir
    brain_dir=$(echo "$brain_package" | sed 's/@brains\//brains\//')

    if [ ! -f "$brain_dir/.env.schema" ]; then
        log_warn "No .env.schema found at $brain_dir — skipping env validation"
        return 0
    fi

    log_info "Validating $env_file against $brain_dir/.env.schema..."

    # Source the production env into the shell, then run varlock from the brain dir.
    # Child process inherits the env, varlock validates against the schema.
    local result
    result=$(
        set -a
        source "$env_file"
        set +a
        cd "$brain_dir" && bunx varlock load 2>&1
    )
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo "$result" >&2
        log_error "Production env validation failed"
        return 1
    fi

    log_info "Production env validated successfully"
    return 0
}

# Export functions
export -f extract_deploy_config validate_app get_config_value load_app_config get_available_apps load_provider_config validate_production_env