---
title: "Deployment Guide"
section: "Start here"
order: 40
sourcePath: "packages/brain-cli/docs/deployment-guide.md"
slug: "deployment-guide"
description: "Deploy a brain to a server using the scaffolded GitHub Actions + Kamal flow."
---

# Deployment Guide

Deploy a brain to a server using the scaffolded GitHub Actions + Kamal flow.

## Overview

The current deploy contract separates image publication from deployment:

1. **Your repo** publishes its own image to `ghcr.io/<owner>/<repo>`
2. **Deploy** runs after `Publish Image` succeeds
3. **Kamal** deploys the exact commit-SHA image that was just published
4. **Cloudflare** terminates at the edge, while `kamal-proxy` serves the Cloudflare Origin CA cert at the origin

This is the same publish-then-deploy shape that has already been proven on live instances.

## Prerequisites

- a GitHub repo for the brain instance
- a Cloudflare-managed zone for your domain
- a Hetzner Cloud account
- the `gh` CLI authenticated locally if you want the CLI to push GitHub secrets for you
- local deploy values in `.env.local`, `.env`, or your shell env

Recommended local contract:

```bash
HCLOUD_SSH_KEY_NAME=mybrain-deploy
HCLOUD_SERVER_TYPE=cpx11
HCLOUD_LOCATION=nbg1
KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/mybrain_deploy_ed25519
```

## Quick deploy

```bash
# Scaffold with deploy files
brain init mybrain --deploy --domain mybrain.example.com
cd mybrain

# Put local secrets in .env.local, including:
# AI_API_KEY=...
# GIT_SYNC_TOKEN=...
# HCLOUD_TOKEN=...
# HCLOUD_SSH_KEY_NAME=...
# HCLOUD_SERVER_TYPE=...
# HCLOUD_LOCATION=...
# KAMAL_REGISTRY_PASSWORD=...
# CF_API_TOKEN=...
# CF_ZONE_ID=...
# KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/mybrain_deploy_ed25519

# Bootstrap the deploy SSH key and push it to GitHub
brain ssh-key:bootstrap --push-to gh

# Preview then push the env-backed secrets to GitHub Actions secrets
brain secrets:push --push-to gh --dry-run
brain secrets:push --push-to gh

# Issue the Cloudflare Origin CA cert and push it to GitHub Actions secrets
brain cert:bootstrap --push-to gh
rm origin.pem origin.key

# Push to main so the scaffolded workflows run:
#   1. Publish Image
#   2. Deploy
```

## Instance repo structure

```text
mybrain/
  brain.yaml                          # Brain configuration
  config/deploy.yml                   # Kamal deployment config
  deploy/Dockerfile                   # Repo-local runtime image build
  .env.example                        # Secret template
  .env.schema                         # Deploy/runtime secret contract
  .kamal/hooks/pre-deploy             # Uploads brain.yaml to server
  .github/workflows/publish-image.yml # Build + publish immutable image tags
  .github/workflows/deploy.yml        # Provision + DNS + Kamal deploy
```

The Origin CA certificate files (`origin.pem`, `origin.key`) are temporary artifacts created by `brain cert:bootstrap`. Keep them out of git; `brain cert:bootstrap --push-to gh` stores the resulting `CERTIFICATE_PEM` and `PRIVATE_KEY_PEM` in GitHub Actions secrets, while `brain secrets:push` handles the env-backed values.

## config/deploy.yml

The scaffolded file is generic and repo-owned. It does not hardcode the monorepo image namespace.

```yaml
service: brain
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - <%= ENV['PREVIEW_DOMAIN'] %>
  app_port: 8080
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
```

Keep the `proxy.hosts` entries as bare hostnames. Do not append `:80` or `:81`.

## Local secret sources

The deploy CLI reads from `.env`, `.env.local`, and `process.env`.

Recommended local values:

| Variable                     | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `AI_API_KEY`                 | runtime                                       |
| `AI_IMAGE_KEY`               | optional runtime                              |
| `GIT_SYNC_TOKEN`             | git-backed content sync                       |
| `MCP_AUTH_TOKEN`             | optional MCP auth                             |
| `DISCORD_BOT_TOKEN`          | optional Discord bot                          |
| `KAMAL_REGISTRY_PASSWORD`    | GHCR pull token for the server                |
| `HCLOUD_TOKEN`               | Hetzner provisioning                          |
| `HCLOUD_SSH_KEY_NAME`        | Hetzner SSH key registration name             |
| `HCLOUD_SERVER_TYPE`         | Hetzner server type                           |
| `HCLOUD_LOCATION`            | Hetzner location                              |
| `KAMAL_SSH_PRIVATE_KEY_FILE` | preferred local source for the deploy SSH key |
| `CF_API_TOKEN`               | Cloudflare DNS + cert bootstrap               |
| `CF_ZONE_ID`                 | Cloudflare zone ID                            |

GitHub stores the pushed runtime/deploy values as normal secrets, including `KAMAL_SSH_PRIVATE_KEY`, `CERTIFICATE_PEM`, and `PRIVATE_KEY_PEM`.

## Domain setup

1. Put the zone on Cloudflare and complete nameserver activation.
2. Set `domain:` in `brain.yaml`.
3. Run `brain cert:bootstrap --push-to gh`.
4. Let the deploy workflow create/update the primary and preview DNS records.

The workflow updates DNS before Kamal deploys, because `kamal-proxy` healthchecks need the hostnames to resolve during rollout.

## CI/CD

`brain init --deploy` scaffolds two workflows:

### `Publish Image`

- runs on push to `main` and `workflow_dispatch`
- publishes to `ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}`
- tags both `latest` and `${{ github.sha }}`
- adds Kamal's required `service=brain` label

### `Deploy`

- runs after successful completion of `Publish Image`
- still supports `workflow_dispatch`
- checks out the exact commit the publish run built
- validates `.env.schema` through varlock
- keeps multiline secrets in `/tmp/varlock-env.json`
- writes the SSH key and `.kamal/secrets`
- provisions or reuses the Hetzner server
- updates Cloudflare DNS
- validates the SSH key, waits for SSH readiness, then runs `kamal setup --skip-push`
- deploys `VERSION: ${{ github.event.workflow_run.head_sha || github.sha }}`
- finishes with `Verify origin TLS`
- dumps remote proxy diagnostics on failure

## Common operations

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

For simple setups, you can run the repo-owned image directly after `Publish Image` has pushed it:

```bash
docker run -d \
  --name mybrain \
  -p 4321:8080 \
  -v ~/brain-data:/app/brain-data \
  -v ~/brain.yaml:/app/brain.yaml \
  --env-file .env \
  ghcr.io/<owner>/<repo>:latest
```

## Health Check

The brain exposes `/health` on the webserver port. Kamal uses this for zero-downtime deploys — the new container must pass the health check before traffic switches over.
