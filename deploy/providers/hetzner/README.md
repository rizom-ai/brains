# Hetzner Cloud Provider

Deploy brain apps to Hetzner Cloud using Terraform.

## Prerequisites

1. **Terraform** - Install from https://www.terraform.io/downloads
2. **Hetzner Cloud Account** - Sign up at https://www.hetzner.com/cloud
3. **API Token** - Generate in Hetzner Cloud Console
4. **SSH Key** - Default: `~/.ssh/id_rsa.pub`

## Quick Start

### 1. Configure Provider

```bash
# Copy example configuration
cp deploy/providers/hetzner/config.env.example deploy/providers/hetzner/config.env

# Edit with your API token
nano deploy/providers/hetzner/config.env
```

Required in `config.env`:
```bash
HCLOUD_TOKEN=your-hetzner-api-token-here
```

### 2. Deploy App

```bash
# Using Bun wrapper (interactive)
bun run brain:deploy

# Direct deployment
bun run brain:deploy test-brain hetzner deploy

# Using shell script
./scripts/deploy-brain.sh test-brain hetzner deploy
```

### 3. Manage Deployment

```bash
# Check status
bun run brain:deploy test-brain hetzner status

# Update application
bun run brain:deploy test-brain hetzner update

# Destroy (backs up first)
bun run brain:deploy test-brain hetzner destroy
```

## Configuration

### Environment Variables

Set in `deploy/providers/hetzner/config.env`:

- `HCLOUD_TOKEN` - **Required**: Your Hetzner API token
- `SSH_PUBLIC_KEY_PATH` - Optional: Path to SSH key (default: ~/.ssh/id_rsa.pub)
- `HETZNER_LOCATION` - Optional: Data center (fsn1, nbg1, hel1, ash)
- `HETZNER_SERVER_TYPE` - Optional: Server size (default: cx11)

### App Configuration

In your app's `deploy/deploy.config.json`:

```json
{
  "deployment": {
    "preferredProvider": "hetzner",
    "serverSize": {
      "hetzner": "cx11"  // cx11, cx21, cx31, etc.
    }
  }
}
```

### Server Types

- `cx11` - 1 vCPU, 2GB RAM, 20GB SSD (€3.29/month)
- `cx21` - 2 vCPU, 4GB RAM, 40GB SSD (€5.83/month)
- `cx31` - 2 vCPU, 8GB RAM, 80GB SSD (€10.59/month)
- `cx41` - 4 vCPU, 16GB RAM, 160GB SSD (€20.71/month)

## Deployment Process

1. **Infrastructure Creation**
   - Creates SSH key in Hetzner
   - Sets up firewall rules
   - Provisions Ubuntu 22.04 server
   - Outputs server IP

2. **Application Setup**
   - Waits for server to be ready
   - Runs setup-server.sh script
   - Builds application binary
   - Deploys using standard deploy.sh
   - Configures environment variables

3. **Post-Deployment**
   - Application runs as systemd service
   - Automatic restarts on failure
   - Log rotation configured
   - Backup script installed

## Costs

- **On-Demand**: ~€0.005/hour - Deploy when needed, destroy when done
- **Persistent**: €3.29/month for cx11 - Always available
- **Backups**: Free local backups, optional Storage Box (€3.20/month)

## Troubleshooting

### "No Terraform state found"
This is normal for first deployment. The provider hasn't created any infrastructure yet.

### "HCLOUD_TOKEN not set"
1. Create `deploy/providers/hetzner/config.env`
2. Add your token: `HCLOUD_TOKEN=your-token`
3. Get token from: https://console.hetzner.cloud/

### SSH Key Issues
- Ensure key exists: `ls ~/.ssh/id_rsa.pub`
- Generate if needed: `ssh-keygen -t rsa -b 4096`
- Or specify different key in config.env

### Terraform Not Found
Install Terraform:
```bash
# macOS
brew install terraform

# Linux
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

## Security

- Firewall configured to allow only SSH and app port
- SSH key authentication only (no passwords)
- Automatic security updates enabled
- Application runs as non-root user
- Environment variables secured with 600 permissions

## Support

For issues:
1. Check provider logs in deployment output
2. Verify prerequisites are installed
3. Ensure API token has Read & Write permissions
4. Check Hetzner Cloud Console for any errors