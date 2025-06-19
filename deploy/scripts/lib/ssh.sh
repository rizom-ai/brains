#!/usr/bin/env bash
# SSH connection utilities

# Source common utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/common.sh"

# Wait for SSH connection to be ready
wait_for_ssh() {
    local server="$1"
    local max_attempts="${2:-30}"
    local user="${3:-root}"
    local interval="${4:-10}"
    
    log_info "Waiting for SSH connection to $user@$server..."
    
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if ssh -o ConnectTimeout=5 \
               -o StrictHostKeyChecking=no \
               -o UserKnownHostsFile=/dev/null \
               -o LogLevel=ERROR \
               "$user@$server" "echo 'SSH ready'" &>/dev/null; then
            log_info "SSH connection established"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_debug "Connection attempt $attempt/$max_attempts failed, waiting ${interval}s..."
        sleep "$interval"
    done
    
    log_error "Failed to establish SSH connection after $max_attempts attempts"
    return 1
}

# Execute command on remote server
remote_exec() {
    local server="$1"
    local command="$2"
    local user="${3:-root}"
    
    ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR \
        "$user@$server" "$command"
}

# Copy file to remote server
remote_copy() {
    local source="$1"
    local server="$2"
    local destination="$3"
    local user="${4:-root}"
    
    scp -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR \
        "$source" "$user@$server:$destination"
}

# Execute script on remote server
remote_script() {
    local server="$1"
    local script="$2"
    local user="${3:-root}"
    
    ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR \
        "$user@$server" 'bash -s' < "$script"
}

# Get SSH key paths
get_ssh_keys() {
    local public_key_path="${SSH_PUBLIC_KEY_PATH:-}"
    local private_key_path="${SSH_PRIVATE_KEY_PATH:-}"
    
    # Auto-detect if not specified
    if [ -z "$public_key_path" ]; then
        for key_type in id_ed25519.pub id_rsa.pub id_ecdsa.pub; do
            if [ -f "$HOME/.ssh/$key_type" ]; then
                public_key_path="$HOME/.ssh/$key_type"
                private_key_path="$HOME/.ssh/${key_type%.pub}"
                log_debug "Auto-detected SSH key: $public_key_path"
                break
            fi
        done
    fi
    
    if [ -z "$public_key_path" ] || [ ! -f "$public_key_path" ]; then
        log_error "No SSH public key found"
        log_info "Generate one with: ssh-keygen -t ed25519"
        return 1
    fi
    
    if [ ! -f "$private_key_path" ]; then
        log_error "SSH private key not found: $private_key_path"
        return 1
    fi
    
    export SSH_KEY_PATH="$public_key_path"
    export SSH_PRIVATE_KEY_PATH="$private_key_path"
}

# Export functions
export -f wait_for_ssh remote_exec remote_copy remote_script get_ssh_keys