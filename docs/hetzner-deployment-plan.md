# Automated Hetzner Deployment Plan for Personal Brain

## Overview

This document outlines a fully automated deployment strategy for Personal Brain to Hetzner Cloud using Infrastructure as Code (IaC) principles with Terraform.

## Goals

1. **One-command deployment**: From zero to running application
2. **Reproducible infrastructure**: Version-controlled and consistent
3. **Secure by default**: Automated security hardening
4. **Cost-efficient**: Easy to create and destroy as needed
5. **Production-ready**: Includes backups, monitoring, and HTTPS

## Architecture

### Infrastructure Components

- **Compute**: Hetzner Cloud CX11 (1 vCPU, 2GB RAM, 20GB SSD)
- **Network**: Cloud firewall with minimal exposed ports
- **Storage**: Server SSD + optional Storage Box for backups
- **DNS**: Optional domain pointing to server IP
- **SSL**: Automatic via Caddy reverse proxy

### Software Stack

- **OS**: Ubuntu 22.04 LTS
- **Runtime**: Compiled Bun binary (no dependencies)
- **Process Manager**: systemd
- **Reverse Proxy**: Caddy (optional, for HTTPS)
- **Monitoring**: Custom health checks + optional external monitoring

## Implementation Plan

### Phase 1: Terraform Infrastructure

#### 1.1 Main Configuration (`deploy/hetzner/main.tf`)

```hcl
terraform {
  required_providers {
    hcloud = {
      source = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

# SSH Key
resource "hcloud_ssh_key" "main" {
  name       = "${var.server_name}-key"
  public_key = file(var.ssh_public_key_path)
}

# Firewall
resource "hcloud_firewall" "main" {
  name = "${var.server_name}-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = var.allowed_ssh_ips
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# Server
resource "hcloud_server" "main" {
  name        = var.server_name
  server_type = var.server_type
  location    = var.location
  image       = var.os_image
  ssh_keys    = [hcloud_ssh_key.main.id]
  firewall_ids = [hcloud_firewall.main.id]
  
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    deploy_user = var.deploy_user
    ssh_public_key = file(var.ssh_public_key_path)
  })

  labels = {
    environment = "production"
    app = "personal-brain"
  }
}

# Optional: Floating IP for persistent address
resource "hcloud_floating_ip" "main" {
  count = var.use_floating_ip ? 1 : 0
  type = "ipv4"
  home_location = var.location
  description = "${var.server_name} floating IP"
}

resource "hcloud_floating_ip_assignment" "main" {
  count = var.use_floating_ip ? 1 : 0
  floating_ip_id = hcloud_floating_ip.main[0].id
  server_id = hcloud_server.main.id
}
```

#### 1.2 Variables (`deploy/hetzner/variables.tf`)

```hcl
variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "server_name" {
  description = "Name of the server"
  type        = string
  default     = "personal-brain"
}

variable "server_type" {
  description = "Hetzner server type"
  type        = string
  default     = "cx11"
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "fsn1"
}

variable "os_image" {
  description = "Operating system image"
  type        = string
  default     = "ubuntu-22.04"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "ssh_private_key_path" {
  description = "Path to SSH private key"
  type        = string
  default     = "~/.ssh/id_rsa"
}

variable "deploy_user" {
  description = "Non-root deployment user"
  type        = string
  default     = "deploy"
}

variable "allowed_ssh_ips" {
  description = "IP addresses allowed to SSH"
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]  # Configure with your IPs for security
}

variable "use_floating_ip" {
  description = "Use a floating IP for persistent address"
  type        = bool
  default     = false
}

variable "domain" {
  description = "Domain name for the application (optional)"
  type        = string
  default     = ""
}
```

#### 1.3 Outputs (`deploy/hetzner/outputs.tf`)

```hcl
output "server_ip" {
  description = "The public IP address of the server"
  value       = var.use_floating_ip ? hcloud_floating_ip.main[0].ip_address : hcloud_server.main.ipv4_address
}

output "server_id" {
  description = "The ID of the server"
  value       = hcloud_server.main.id
}

output "server_status" {
  description = "The status of the server"
  value       = hcloud_server.main.status
}

output "ssh_command" {
  description = "SSH command to connect to the server"
  value       = "ssh ${var.deploy_user}@${var.use_floating_ip ? hcloud_floating_ip.main[0].ip_address : hcloud_server.main.ipv4_address}"
}
```

### Phase 2: Cloud-Init Configuration

#### 2.1 Cloud-Init Script (`deploy/hetzner/cloud-init.yaml`)

```yaml
#cloud-config
users:
  - name: ${deploy_user}
    groups: sudo
    shell: /bin/bash
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    ssh_authorized_keys:
      - ${ssh_public_key}

package_update: true
package_upgrade: true

packages:
  - curl
  - git
  - jq
  - unzip
  - build-essential
  - python3
  - python3-pip
  - ufw
  - fail2ban

write_files:
  - path: /etc/fail2ban/jail.local
    content: |
      [DEFAULT]
      bantime = 3600
      findtime = 600
      maxretry = 5

      [sshd]
      enabled = true

runcmd:
  # Configure UFW
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow ssh
  - ufw allow http
  - ufw allow https
  - ufw --force enable
  
  # Enable fail2ban
  - systemctl enable fail2ban
  - systemctl start fail2ban
  
  # Configure automatic updates
  - apt install -y unattended-upgrades
  - dpkg-reconfigure -plow unattended-upgrades
  
  # Disable root SSH login
  - sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
  - systemctl restart sshd
  
  # Create application directory
  - mkdir -p /opt/personal-brain
  - chown ${deploy_user}:${deploy_user} /opt/personal-brain
```

### Phase 3: Deployment Automation

#### 3.1 Main Deployment Script (`scripts/deploy-hetzner.sh`)

```bash
#!/usr/bin/env bash
# Automated Hetzner deployment for Personal Brain

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
ACTION="${1:-deploy}"
TERRAFORM_DIR="deploy/hetzner"
APP_NAME="test-brain"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Check prerequisites
check_prerequisites() {
    log_step "Checking Prerequisites"
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform not found. Please install: https://www.terraform.io/downloads"
        exit 1
    fi
    
    # Check for configuration
    if [ ! -f "$TERRAFORM_DIR/terraform.tfvars" ]; then
        log_error "terraform.tfvars not found!"
        log_info "Copy and configure: cp $TERRAFORM_DIR/terraform.tfvars.example $TERRAFORM_DIR/terraform.tfvars"
        exit 1
    fi
    
    # Check for Hetzner token
    if ! grep -q "hcloud_token" "$TERRAFORM_DIR/terraform.tfvars"; then
        log_error "hcloud_token not set in terraform.tfvars"
        exit 1
    fi
    
    log_info "✅ Prerequisites checked"
}

# Initialize Terraform
init_terraform() {
    log_step "Initializing Terraform"
    cd "$TERRAFORM_DIR"
    terraform init
    cd - > /dev/null
}

# Deploy infrastructure
deploy_infrastructure() {
    log_step "Deploying Infrastructure"
    cd "$TERRAFORM_DIR"
    
    # Plan
    log_info "Planning infrastructure changes..."
    terraform plan -out=tfplan
    
    # Apply
    log_info "Applying infrastructure..."
    terraform apply tfplan
    
    # Get outputs
    SERVER_IP=$(terraform output -raw server_ip)
    SSH_COMMAND=$(terraform output -raw ssh_command)
    
    cd - > /dev/null
    
    log_info "✅ Infrastructure deployed"
    log_info "Server IP: $SERVER_IP"
    log_info "SSH: $SSH_COMMAND"
}

# Wait for server to be ready
wait_for_server() {
    log_step "Waiting for Server"
    
    log_info "Waiting for cloud-init to complete..."
    sleep 30  # Initial wait
    
    # Wait for SSH to be available
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "deploy@$SERVER_IP" "echo 'SSH ready'" &> /dev/null; then
            log_info "✅ Server is ready"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_info "Waiting for SSH... (attempt $attempt/$max_attempts)"
        sleep 10
    done
    
    log_error "Server failed to become ready"
    exit 1
}

# Setup Personal Brain
setup_personal_brain() {
    log_step "Setting up Personal Brain"
    
    # Copy setup script
    log_info "Copying setup script..."
    scp scripts/setup-server.sh "deploy@$SERVER_IP:~/"
    
    # Run setup
    log_info "Running server setup..."
    ssh "deploy@$SERVER_IP" "./setup-server.sh"
    
    # Copy environment configuration
    log_info "Configuring environment..."
    scp "$TERRAFORM_DIR/.env.production" "deploy@$SERVER_IP:~/.env.tmp"
    ssh "deploy@$SERVER_IP" "sudo mv ~/.env.tmp /opt/personal-brain/.env && sudo chown personal-brain:personal-brain /opt/personal-brain/.env && sudo chmod 600 /opt/personal-brain/.env"
}

# Deploy application
deploy_application() {
    log_step "Deploying Application"
    
    # Build release
    log_info "Building release..."
    ./scripts/build-release.sh "$APP_NAME" linux-x64
    
    # Find latest release
    RELEASE_FILE=$(ls -t "apps/$APP_NAME/dist/"*.tar.gz | head -1)
    
    # Deploy
    log_info "Deploying application..."
    ./scripts/deploy.sh "deploy@$SERVER_IP" "$RELEASE_FILE"
}

# Setup Caddy (optional)
setup_caddy() {
    local domain="$1"
    
    if [ -z "$domain" ]; then
        log_warn "No domain specified, skipping Caddy setup"
        return
    fi
    
    log_step "Setting up Caddy"
    
    ssh "deploy@$SERVER_IP" << EOF
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Configure Caddy
echo "$domain {
    reverse_proxy localhost:3333
}" | sudo tee /etc/caddy/Caddyfile

# Restart Caddy
sudo systemctl reload caddy
EOF
    
    log_info "✅ Caddy configured for $domain"
}

# Main deployment flow
deploy() {
    check_prerequisites
    init_terraform
    deploy_infrastructure
    wait_for_server
    setup_personal_brain
    deploy_application
    
    # Get domain from terraform
    DOMAIN=$(cd "$TERRAFORM_DIR" && terraform output -raw domain 2>/dev/null || echo "")
    setup_caddy "$DOMAIN"
    
    log_step "Deployment Complete!"
    log_info "🎉 Personal Brain is now running!"
    log_info ""
    log_info "Access:"
    if [ -n "$DOMAIN" ]; then
        log_info "  Web: https://$DOMAIN"
    fi
    log_info "  Direct: http://$SERVER_IP:3333"
    log_info "  SSH: ssh deploy@$SERVER_IP"
    log_info ""
    log_info "Commands:"
    log_info "  Check status: ssh deploy@$SERVER_IP 'sudo systemctl status personal-brain'"
    log_info "  View logs: ssh deploy@$SERVER_IP 'sudo journalctl -u personal-brain -f'"
}

# Update existing deployment
update() {
    log_step "Updating Deployment"
    
    # Get server IP from Terraform state
    cd "$TERRAFORM_DIR"
    SERVER_IP=$(terraform output -raw server_ip)
    cd - > /dev/null
    
    # Deploy new version
    deploy_application
    
    log_info "✅ Update complete"
}

# Destroy infrastructure
destroy() {
    log_step "Destroying Infrastructure"
    
    read -p "Are you sure you want to destroy the infrastructure? (yes/no) " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log_info "Cancelled"
        exit 0
    fi
    
    # Backup data first
    log_info "Creating backup..."
    cd "$TERRAFORM_DIR"
    SERVER_IP=$(terraform output -raw server_ip)
    cd - > /dev/null
    
    ssh "deploy@$SERVER_IP" "sudo /opt/personal-brain/backup.sh"
    scp "deploy@$SERVER_IP:/opt/personal-brain/backups/brain-backup-*.tar.gz" ./
    
    # Destroy infrastructure
    cd "$TERRAFORM_DIR"
    terraform destroy
    cd - > /dev/null
    
    log_info "✅ Infrastructure destroyed"
    log_info "Backup saved to current directory"
}

# Main script logic
case "$ACTION" in
    deploy|--deploy|-d)
        deploy
        ;;
    update|--update|-u)
        update
        ;;
    destroy|--destroy)
        destroy
        ;;
    *)
        log_error "Unknown action: $ACTION"
        echo "Usage: $0 [deploy|update|destroy]"
        exit 1
        ;;
esac
```

#### 3.2 Example Configuration (`deploy/hetzner/terraform.tfvars.example`)

```hcl
# Hetzner Cloud API token (required)
# Get from: https://console.hetzner.cloud/projects/YOUR_PROJECT/security/tokens
hcloud_token = "YOUR_HETZNER_API_TOKEN"

# Server configuration
server_name = "personal-brain"
server_type = "cx11"  # 1 vCPU, 2GB RAM, 20GB SSD
location    = "fsn1"  # Falkenstein, Germany (alternatives: nbg1, hel1, ash)

# SSH configuration
ssh_public_key_path  = "~/.ssh/id_rsa.pub"
ssh_private_key_path = "~/.ssh/id_rsa"

# Security
allowed_ssh_ips = ["0.0.0.0/0", "::/0"]  # IMPORTANT: Restrict to your IP!

# Optional: Domain for HTTPS access
domain = ""  # e.g., "brain.yourdomain.com"

# Optional: Use floating IP for persistent address
use_floating_ip = false
```

#### 3.3 Production Environment Template (`deploy/hetzner/.env.production.template`)

```bash
# Personal Brain Production Configuration for Hetzner

# Database
DATABASE_URL=file:/opt/personal-brain/data/brain.db

# AI Provider (Required - add your key)
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE

# Server Configuration
BRAIN_SERVER_PORT=3333
BRAIN_SERVER_HOST=127.0.0.1  # Bound to localhost, Caddy will proxy
BRAIN_ENV=production
LOG_LEVEL=info

# Git Sync (Optional)
# GIT_REPO_PATH=/opt/personal-brain/brain-repo
# GIT_REMOTE_URL=git@github.com:yourusername/brain-data.git
# GIT_BRANCH=main
# GIT_AUTO_SYNC=true

# Matrix Interface (Optional - configure if using)
# MATRIX_HOMESERVER=https://matrix.org
# MATRIX_USER_ID=@your-brain-bot:matrix.org
# MATRIX_ACCESS_TOKEN=syt_YOUR_TOKEN_HERE
# MATRIX_ANCHOR_USER_ID=@yourusername:matrix.org
# MATRIX_AUTO_JOIN=true
# MATRIX_COMMAND_PREFIX=!
```

## Usage Instructions

### Initial Setup

1. **Install Terraform**:
   ```bash
   # macOS
   brew install terraform
   
   # Linux
   wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
   sudo apt update && sudo apt install terraform
   ```

2. **Get Hetzner API Token**:
   - Log in to [Hetzner Cloud Console](https://console.hetzner.cloud/)
   - Go to Security → API Tokens
   - Generate new token with Read & Write permissions

3. **Configure Deployment**:
   ```bash
   # Copy example configurations
   cp deploy/hetzner/terraform.tfvars.example deploy/hetzner/terraform.tfvars
   cp deploy/hetzner/.env.production.template deploy/hetzner/.env.production
   
   # Edit with your values
   nano deploy/hetzner/terraform.tfvars
   nano deploy/hetzner/.env.production
   ```

4. **Deploy**:
   ```bash
   ./scripts/deploy-hetzner.sh deploy
   ```

### Daily Operations

- **Update application**: `./scripts/deploy-hetzner.sh update`
- **Check status**: `ssh deploy@SERVER_IP 'sudo systemctl status personal-brain'`
- **View logs**: `ssh deploy@SERVER_IP 'sudo journalctl -u personal-brain -f'`
- **Manual backup**: `ssh deploy@SERVER_IP 'sudo /opt/personal-brain/backup.sh'`

### Destroy When Not Needed

```bash
# Creates backup and destroys server
./scripts/deploy-hetzner.sh destroy
```

## Cost Optimization

### On-Demand Usage Pattern

If you don't need 24/7 availability:

1. Deploy when needed: `./scripts/deploy-hetzner.sh deploy`
2. Use for your session
3. Destroy when done: `./scripts/deploy-hetzner.sh destroy`
4. Redeploy later with same data (backup restored automatically)

Cost: ~€0.005/hour (CX11) = €0.12/day when active

### Persistent Usage Pattern

For always-on deployment:

1. Use snapshots for disaster recovery
2. Consider CX11 for €3.29/month
3. Add Storage Box for €3.20/month for external backups

## Security Best Practices

1. **Restrict SSH access**: Set `allowed_ssh_ips` to your IP addresses
2. **Use strong passwords**: For Anthropic API key and Matrix tokens
3. **Enable 2FA**: On your Hetzner account
4. **Regular updates**: Automatic security updates are configured
5. **Monitor access**: Check logs regularly

## Backup Strategy

### Automated Backups

1. **Daily application backups**: Via cron (configured by setup)
2. **Weekly Hetzner snapshots**: Configure in Cloud Console
3. **Optional S3 sync**: Add to backup script

### Manual Backup

```bash
# Create backup
ssh deploy@SERVER_IP 'sudo /opt/personal-brain/backup.sh'

# Download backup
scp deploy@SERVER_IP:/opt/personal-brain/backups/brain-backup-*.tar.gz ./
```

## Monitoring

### Basic Health Check

```bash
# Create simple monitoring script
cat > check-brain.sh << 'EOF'
#!/bin/bash
if curl -f http://SERVER_IP:3333/health > /dev/null 2>&1; then
    echo "✅ Personal Brain is healthy"
else
    echo "❌ Personal Brain is down!"
    # Send alert (email, Telegram, etc.)
fi
EOF
```

### External Monitoring Services

- **UptimeRobot**: Free tier, 5-minute checks
- **Healthchecks.io**: Free tier, cron job monitoring
- **Grafana Cloud**: Free tier with better metrics

## Troubleshooting

### Common Issues

1. **Terraform init fails**:
   - Check Hetzner API token
   - Ensure terraform version >= 1.0

2. **Server not accessible**:
   - Check firewall rules in Hetzner Console
   - Verify SSH key is correct

3. **Application won't start**:
   - Check logs: `journalctl -u personal-brain -n 100`
   - Verify environment variables in `/opt/personal-brain/.env`

4. **Caddy SSL fails**:
   - Ensure domain points to server IP
   - Check Caddy logs: `journalctl -u caddy -f`

## Future Enhancements

1. **Multi-region deployment**: Add Terraform modules for different regions
2. **Blue-green deployment**: Implement zero-downtime updates
3. **Kubernetes option**: For more complex scaling needs
4. **Ansible integration**: For more complex configuration management
5. **Monitoring dashboard**: Automated Grafana setup

## Conclusion

This automated deployment provides:

- ✅ One-command server provisioning
- ✅ Automated security hardening
- ✅ Built-in backup strategy
- ✅ Optional HTTPS with auto-SSL
- ✅ Easy updates and maintenance
- ✅ Cost-efficient destroy/recreate workflow

The infrastructure is fully version-controlled, making it easy to modify, replicate, or recover from disasters.