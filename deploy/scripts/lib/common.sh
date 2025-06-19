#!/usr/bin/env bash
# Common utilities for deployment scripts

# Colors for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }
log_debug() { 
    if [ "${DEBUG:-}" = "1" ]; then 
        echo -e "${YELLOW}[DEBUG]${NC} $1" >&2
    fi
}

# Error handling
set_error_trap() {
    local cleanup_function="${1:-}"
    set -euo pipefail
    if [ -n "$cleanup_function" ]; then
        trap 'handle_error $? $LINENO "$cleanup_function"' ERR
    else
        trap 'handle_error $? $LINENO ""' ERR
    fi
}

handle_error() {
    local exit_code=$1
    local line_number=$2
    local cleanup_function="${3:-}"
    
    log_error "Script failed on line $line_number (exit code: $exit_code)"
    
    if [ -n "$cleanup_function" ] && declare -f "$cleanup_function" >/dev/null; then
        log_debug "Running cleanup function: $cleanup_function"
        $cleanup_function || true
    fi
    
    exit $exit_code
}

# Check if command exists
command_exists() {
    command -v "$1" &>/dev/null
}

# Get project root directory
get_project_root() {
    local current_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Navigate up until we find turbo.json (monorepo root)
    while [ "$current_dir" != "/" ]; do
        if [ -f "$current_dir/turbo.json" ]; then
            echo "$current_dir"
            return 0
        fi
        current_dir=$(dirname "$current_dir")
    done
    
    log_error "Could not find project root (no turbo.json found)"
    return 1
}

# Ensure we're in the project root
ensure_project_root() {
    local root=$(get_project_root)
    if [ -z "$root" ]; then
        exit 1
    fi
    cd "$root"
}

# Export for use in scripts
export -f log_info log_warn log_error log_step log_debug
export -f handle_error command_exists get_project_root ensure_project_root