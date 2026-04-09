# Deployment Guide

Deploy a brain to a server using Docker and Kamal.

## Overview

The deployment model separates building from deploying:

1. **Monorepo** builds and publishes Docker images for each brain model (`ghcr.io/rizom-ai/rover`, etc.)
2. **Instance repo** (your brain) runs `kamal deploy` to pull the image and run it on your server

## Prerequisites

- A server (Hetzner recommended, any VPS works)
- A domain pointed at your server IP
- Docker installed on your server
- [Kamal](https://kamal-deploy.org) installed locally (`gem install kamal`)
- A GitHub Container Registry token
- Cloudflare API token + zone ID if you plan to bootstrap an Origin CA certificate with `brain cert:bootstrap`
- A secret backend for runtime/deploy secrets (`.env`, GitHub secrets, 1Password, etc.)

## Quick Deploy

```bash
# Scaffold with deploy files
brain init mybrain --deploy --domain mybrain.example.com
cd mybrain

# One-time TLS bootstrap for the Cloudflare Origin CA flow
export CF_API_TOKEN=...
export CF_ZONE_ID=...
brain cert:bootstrap
# Push origin.pem + origin.key into your secret backend as
# CERTIFICATE_PEM / PRIVATE_KEY_PEM, then delete the local files.
rm origin.pem origin.key

# Configure runtime/deploy secrets
cp .env.example .env
# Edit .env with your secrets

# Deploy
kamal setup    # First time: provisions server
kamal deploy   # Subsequent deploys
```

## Instance Repo Structure

```
mybrain/
  brain.yaml                      # Brain configuration
  config/deploy.yml               # Kamal deployment config
  .env                            # Secrets (not committed)
  .env.example                    # Template for secrets
  .kamal/hooks/pre-deploy         # Uploads brain.yaml to server
  .github/workflows/deploy.yml    # CI/CD (optional)
```

The Origin CA certificate files (`origin.pem`, `origin.key`) are temporary artifacts created by `brain cert:bootstrap`. Keep them out of git and push their contents into your secret backend instead.

## config/deploy.yml

Kamal configuration for your brain instance:

> The scaffolded file below is the baseline Kamal config. If you're using the Cloudflare Origin CA flow, keep the same instance layout but wire your `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM` secrets into the `proxy.ssl` section according to the secret backend you use.

```yaml
service: brain
image: ghcr.io/rizom-ai/rover

servers:
  web:
    hosts:
      - 1.2.3.4 # Your server IP

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - mybrain.example.com:80 # Production site
    - preview.mybrain.example.com:81 # Preview builds
  app_port: 80

registry:
  server: ghcr.io
  username: rizom-ai
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - AI_IMAGE_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml

healthcheck:
  path: /health
  port: 80
```

## Environment Variables

Set these in `.env` (never commit this file):

| Variable                  | Required  | Description                             |
| ------------------------- | --------- | --------------------------------------- |
| `AI_API_KEY`              | Yes       | AI provider API key                     |
| `AI_IMAGE_KEY`            | No        | Separate key for image generation       |
| `GIT_SYNC_TOKEN`          | Yes       | GitHub PAT for content sync             |
| `MCP_AUTH_TOKEN`          | No        | Token for authenticated MCP HTTP access |
| `DISCORD_BOT_TOKEN`       | No        | Discord bot token                       |
| `KAMAL_REGISTRY_PASSWORD` | Deploy    | GitHub Container Registry token         |
| `SERVER_IP`               | Deploy    | Server IP address                       |
| `CF_API_TOKEN`            | Bootstrap | Cloudflare API token for cert bootstrap |
| `CF_ZONE_ID`              | Bootstrap | Cloudflare zone ID for cert bootstrap   |

## Domain Setup

### Default subdomain

Every brain gets `{name}.rizom.ai` by default. Point a DNS A record to your server IP.

### Custom domain

1. Set `domain` in `brain.yaml`
2. Update `proxy.hosts` in `config/deploy.yml`
3. Point your domain's A record to the server IP
4. If you're using the Cloudflare Origin CA flow, run `brain cert:bootstrap` once and store the resulting cert/key as secrets before deploying
5. Kamal handles SSL according to your `config/deploy.yml` / secret backend configuration

## CI/CD

The scaffolded GitHub Actions workflow (`--deploy` flag) deploys on every push to `main`:

1. Extracts brain model and domain from `brain.yaml`
2. Installs Kamal
3. Runs `kamal deploy`

Secrets needed in GitHub repo settings:

- `KAMAL_REGISTRY_PASSWORD`
- `SERVER_IP`
- `AI_API_KEY`
- `GIT_SYNC_TOKEN`
- `CERTIFICATE_PEM`
- `PRIVATE_KEY_PEM`

## Common Operations

```bash
# Deploy latest
kamal deploy

# Rollback to previous version
kamal rollback

# View logs
kamal app logs

# Open remote console
kamal app exec -i bash

# Check status
kamal details
```

## Docker (without Kamal)

For simple setups, you can run the Docker image directly:

```bash
docker run -d \
  --name mybrain \
  -p 4321:80 \
  -v ~/brain-data:/app/brain-data \
  -v ~/brain.yaml:/app/brain.yaml \
  --env-file .env \
  ghcr.io/rizom-ai/rover:latest
```

## Health Check

The brain exposes `/health` on the webserver port. Kamal uses this for zero-downtime deploys — the new container must pass the health check before traffic switches over.
