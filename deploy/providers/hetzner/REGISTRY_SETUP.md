# Docker Registry Setup for Hetzner Deployment

A Docker registry is required for Hetzner deployments. This guide will help you set up GitHub Container Registry (recommended) or Docker Hub.

## GitHub Container Registry (Recommended)

### 1. Create a Personal Access Token

1. Go to GitHub Settings: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name like "Personal Brain Deployment"
4. Select the following scopes:
   - `write:packages` - Upload packages to GitHub Package Registry
   - `read:packages` - Download packages from GitHub Package Registry
   - `delete:packages` (optional) - Delete packages from GitHub Package Registry
5. Click "Generate token"
6. **Copy the token immediately** - you won't be able to see it again!

### 2. Configure Hetzner Provider

Edit `deploy/providers/hetzner/config.env`:

```bash
# Your existing config
HCLOUD_TOKEN=your-hetzner-api-token

# Add these lines (replace with your values)
DOCKER_REGISTRY=ghcr.io/yourusername
REGISTRY_USER=yourusername
REGISTRY_TOKEN=ghp_yourPersonalAccessTokenHere
```

### 3. Test Your Setup

You can test your registry authentication:

```bash
# Login to GitHub Container Registry
echo $REGISTRY_TOKEN | docker login ghcr.io -u $REGISTRY_USER --password-stdin

# You should see: Login Succeeded
```

### 4. Deploy

Now you can deploy:

```bash
bun brain:deploy test-brain hetzner
```

The deployment will:

1. Build your Docker image
2. Push it to `ghcr.io/yourusername/personal-brain-test-brain:latest`
3. Pull it on the Hetzner server

## Docker Hub Alternative

### 1. Create an Access Token

1. Go to Docker Hub: https://hub.docker.com/settings/security
2. Click "New Access Token"
3. Give it a description like "Personal Brain Deployment"
4. Select "Read, Write, Delete" permissions
5. Click "Generate"
6. Copy the token

### 2. Configure Hetzner Provider

Edit `deploy/providers/hetzner/config.env`:

```bash
# Your existing config
HCLOUD_TOKEN=your-hetzner-api-token

# Add these lines
DOCKER_REGISTRY=docker.io
REGISTRY_USER=yourdockerhubusername
REGISTRY_TOKEN=your-docker-hub-access-token
```

## Security Notes

- **Never commit** your `config.env` file to git
- Keep your tokens secure and rotate them regularly
- Use repository-specific tokens if available
- For production, consider using a private registry

## Troubleshooting

### "unauthorized: authentication required"

Your token might be expired or have insufficient permissions. Generate a new token with the correct scopes.

### "denied: requested access to the resource is denied"

1. Check your username is correct
2. Ensure the token has `write:packages` scope (for GitHub)
3. Make sure you're using the token, not your password

### Images Not Visible on GitHub

GitHub Container Registry images are private by default. To make them public:

1. Go to your GitHub profile → Packages
2. Click on the package
3. Package settings → Change visibility → Public

## Benefits of Using a Registry

1. **Reliable**: No more SSH transfer timeouts
2. **Fast**: Docker's layer caching makes pulls efficient
3. **Scalable**: Deploy to multiple servers easily
4. **Versioned**: Tag images with versions for easy rollbacks
5. **CI/CD Ready**: Integrate with GitHub Actions or other CI systems
