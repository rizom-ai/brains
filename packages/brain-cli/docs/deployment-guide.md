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
- A varlock-compatible secret backend for runtime/deploy secrets (1Password by default, or another backend via `brain init --backend`)

## Quick Deploy

```bash
# Scaffold with deploy files
brain init mybrain --deploy --backend 1password --domain mybrain.example.com
cd mybrain

# One-time TLS bootstrap for the Cloudflare Origin CA flow
export CF_API_TOKEN=...
export CF_ZONE_ID=...
brain secrets:push --push-to 1password
brain secrets:push --dry-run
brain cert:bootstrap --push-to 1password
# If you use GitHub-backed secrets instead, use:
# brain secrets:push --push-to gh
# brain secrets:push --push-to gh --dry-run
# brain cert:bootstrap --push-to gh
rm origin.pem origin.key

# Deploy
# The scaffolded GitHub Actions workflow provisions the server,
# loads secrets via varlock, updates DNS, and runs kamal deploy.
# For manual deploys, use the same .env.schema-backed env locally.
kamal deploy
```

## First-time 1Password setup

If you use the default 1Password backend, do this once per instance:

1. Create a vault, e.g. `brain-mybrain-prod`.
2. Create a 1Password service account with access only to that vault.
3. Store the service account token in GitHub as `OP_TOKEN`.
4. Run `brain secrets:push --push-to 1password` with the runtime/deploy secrets set locally.
5. Run `brain cert:bootstrap --push-to 1password` with `CF_API_TOKEN` and `CF_ZONE_ID` set locally.
6. Delete the local cert files.

After that, the workflow can load everything else from the vault; GitHub should only need `OP_TOKEN`.

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

The Origin CA certificate files (`origin.pem`, `origin.key`) are temporary artifacts created by `brain cert:bootstrap`. Keep them out of git; `brain cert:bootstrap --push-to 1password` / `--push-to gh` can store them directly in the chosen backend, while `brain secrets:push` handles the env-backed values.

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
| `OP_TOKEN`                | Bootstrap | 1Password service account token         |

## Domain Setup

### Default subdomain

Every brain gets `{name}.rizom.ai` by default. Point a DNS A record to your server IP.

### Custom domain

1. Set `domain` in `brain.yaml`
2. Update `proxy.hosts` in `config/deploy.yml`
3. Point your domain's A record to the server IP
4. If you're using the Cloudflare Origin CA flow, run `brain cert:bootstrap --push-to 1password` once to store the resulting cert/key in your vault before deploying
5. Kamal handles SSL according to your `config/deploy.yml` / secret backend configuration

## CI/CD

The scaffolded GitHub Actions workflow (`--deploy` flag) deploys on every push to `main`:

1. Extracts brain model and domain from `brain.yaml`
2. Loads the instance `.env.schema` via varlock
3. Writes the Kamal SSH key and `.kamal/secrets`
4. Provisions or reuses the Hetzner server
5. Updates Cloudflare DNS
6. Runs `kamal deploy --skip-push`

The workflow no longer names app/runtime secrets individually in YAML. The only CI bootstrap value it expects from GitHub Secrets is `OP_TOKEN`; everything else comes from the varlock backend via `.env.schema`.

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
