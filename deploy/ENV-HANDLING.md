# Environment Variable Handling in Deployment

This guide explains how the deployment system manages environment variables for each brain app.

## Overview

Each app can have different environment configurations for different contexts:

- **Development**: `.env` in app root (git-ignored)
- **Production**: `.env.production` in `deploy/` directory (git-ignored)
- **Examples**: `.env.example` and `.env.production.example` (committed to git)

## Directory Structure

```
apps/your-app/
├── .env                           # Local development (git-ignored)
├── .env.example                   # Development template (in git)
├── deploy/
│   ├── .env.production           # Production config (git-ignored)
│   └── .env.production.example   # Production template (in git)
```

## Deployment Process

### 1. Local Preparation

Before deploying, create your production environment file:

```bash
# Copy the example
cp apps/test-brain/deploy/.env.production.example apps/test-brain/deploy/.env.production

# Edit with your production values
nano apps/test-brain/deploy/.env.production
```

### 2. Automatic Deployment

When you run deployment, the Hetzner provider:

1. Checks for `apps/{app-name}/deploy/.env.production`
2. If found, securely copies it to the server
3. Places it at `/opt/{app-name}/.env` with proper permissions
4. Sets ownership to the app user and mode 600 (read-only by owner)

### 3. What Happens During Deployment

```bash
# The provider script does this automatically:
scp "$ENV_FILE" "deploy@$server_ip:~/.env.tmp"
ssh "deploy@$server_ip" "sudo mv ~/.env.tmp $APP_INSTALL_PATH/.env"
ssh "deploy@$server_ip" "sudo chown $APP_SERVICE_NAME:$APP_SERVICE_NAME $APP_INSTALL_PATH/.env"
ssh "deploy@$server_ip" "sudo chmod 600 $APP_INSTALL_PATH/.env"
```

## Environment File Examples

### Basic Production Config

```bash
# apps/test-brain/deploy/.env.production
DATABASE_URL=file:/opt/personal-brain/data/brain.db
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-PRODUCTION-KEY
BRAIN_SERVER_PORT=3333
BRAIN_SERVER_HOST=127.0.0.1
LOG_LEVEL=info
```

### With Optional Features

```bash
# Matrix Integration
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@brain-bot:matrix.org
MATRIX_ACCESS_TOKEN=syt_YOUR_TOKEN
MATRIX_ANCHOR_USER_ID=@you:matrix.org

# Git Sync
GIT_REPO_PATH=/opt/personal-brain/brain-repo
GIT_REMOTE_URL=git@github.com:user/brain-data.git
```

## Best Practices

### 1. Never Commit Secrets

```bash
# .gitignore should include:
.env
.env.production
*.env.local
```

### 2. Use Examples as Templates

Always provide `.env.example` and `.env.production.example` with:

- All required variables
- Dummy values or clear placeholders
- Comments explaining each variable

### 3. Different Values for Different Environments

```bash
# Development (.env)
DATABASE_URL=file:./dev-brain.db
BRAIN_SERVER_HOST=localhost
LOG_LEVEL=debug

# Production (.env.production)
DATABASE_URL=file:/opt/personal-brain/data/brain.db
BRAIN_SERVER_HOST=127.0.0.1  # Behind reverse proxy
LOG_LEVEL=info
```

### 4. Validate Before Deployment

```bash
# Check if production env exists
if [ ! -f "apps/test-brain/deploy/.env.production" ]; then
    echo "ERROR: Create .env.production from .env.production.example"
    exit 1
fi

# Validate required variables
grep -q "ANTHROPIC_API_KEY=sk-ant" apps/test-brain/deploy/.env.production || \
    echo "WARNING: ANTHROPIC_API_KEY not set"
```

## Multiple Apps Example

Each app has its own environment configuration:

```
apps/
├── test-brain/
│   └── deploy/
│       ├── .env.production          # Test brain's production config
│       └── .env.production.example
├── work-brain/
│   └── deploy/
│       ├── .env.production          # Work brain's production config
│       └── .env.production.example
└── personal-brain/
    └── deploy/
        ├── .env.production          # Personal brain's production config
        └── .env.production.example
```

Each can have different:

- API keys
- Database paths
- Port numbers
- Feature flags

## Updating Environment Variables

### Method 1: Re-deploy

```bash
# Edit local file
nano apps/test-brain/deploy/.env.production

# Re-deploy (this will copy new env)
bun run brain:deploy test-brain hetzner update
```

### Method 2: Direct Server Edit

```bash
# SSH to server
ssh deploy@your-server-ip

# Edit directly (careful!)
sudo nano /opt/personal-brain/.env

# Restart service
sudo systemctl restart personal-brain
```

## Security Considerations

1. **File Permissions**: Always 600 (owner read/write only)
2. **User Ownership**: Owned by app service user, not root
3. **No Git**: Never commit actual .env files
4. **Secure Transfer**: SCP over SSH for deployment
5. **Rotation**: Regularly rotate API keys and tokens

## Troubleshooting

### App Not Starting

Check if environment file exists and has correct permissions:

```bash
ssh deploy@server "ls -la /opt/personal-brain/.env"
# Should show: -rw------- 1 personal-brain personal-brain
```

### Missing Variables

Check systemd logs for environment errors:

```bash
ssh deploy@server "sudo journalctl -u personal-brain -n 50"
```

### Wrong Values

Verify loaded environment:

```bash
ssh deploy@server "sudo -u personal-brain env | grep BRAIN"
```

## Provider-Specific Notes

### Hetzner

- Looks for: `apps/{app}/deploy/.env.production`
- Deploys to: `/opt/{app}/.env`
- Auto-sets permissions and ownership

### Future Providers

- Will follow same pattern
- May support provider-specific env files
- Could integrate with secret managers (AWS Secrets, Vault, etc.)
