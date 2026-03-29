# Plan: Kamal Deploy

## Context

Current deploy pipeline: Terraform provisions Hetzner VPS, SSH + rsync deploys Docker Compose + Caddyfile, Cloudflare Terraform for DNS. Fragile, manual, centralized in the monorepo.

Kamal replaces the deploy mechanism. But the bigger change is decentralizing deployment — each brain instance owns its own deploy, not the monorepo.

## Architecture

### Monorepo responsibility

Build and publish brain model Docker images. Nothing else.

```
push to main → CI builds ghcr.io/rizom-ai/rover:latest → done
```

No deploy configs, no server IPs, no DNS scripts in the monorepo.

### Instance responsibility

Each brain instance is a standalone repo with its own deployment:

```
yeehaa-brain/
  brain.yaml        # instance config
  deploy.yml        # Kamal config (server IP, domain, secrets)
  .env              # secrets (not committed)
```

Push to the instance repo → CI runs `kamal deploy` → done.

See [standalone-apps.md](./standalone-apps.md) for full instance repo structure.

### Default domain: `{name}.rizom.ai`

Every brain gets a subdomain on `rizom.ai` by default. Custom domains optional.

## What Kamal replaces

| Concern       | Current                                      | Kamal                       |
| ------------- | -------------------------------------------- | --------------------------- |
| Provisioning  | Terraform                                    | Hetzner API or manual       |
| Deploy        | SSH + rsync + docker-compose up              | `kamal deploy`              |
| SSL           | Caddy + Let's Encrypt                        | kamal-proxy + Let's Encrypt |
| Zero-downtime | No (compose down/up)                         | Yes (container swap)        |
| Rollback      | Rebuild and redeploy                         | `kamal rollback` (instant)  |
| Config        | Terraform .tf + compose template + Caddyfile | Single `deploy.yml`         |

## Instance deploy.yml

```yaml
service: yeehaa-brain
image: ghcr.io/rizom-ai/rover

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>
    options:
      memory: 4g

proxy:
  ssl: true
  host: rover.rizom.ai
  app_port: 8080

registry:
  server: ghcr.io
  username: rizom-ai
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  clear:
    NODE_ENV: production
  secret:
    - ANTHROPIC_API_KEY
    - DISCORD_BOT_TOKEN
    - GIT_SYNC_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml

healthcheck:
  path: /health
  port: 8080
```

## Instance CI pipeline

Each instance repo has its own CI that:

1. Provisions server via Hetzner API if it doesn't exist (labeled by brain name)
2. Gets server IP from Hetzner API
3. Creates/updates `{name}.rizom.ai` DNS via Cloudflare API
4. Runs `kamal deploy`

All automated. Push to instance repo → deployed.

## DNS setup

### Phase 0: Transfer rizom.ai to Cloudflare

`rizom.ai` is registered at MijnDomein. Transfer to Cloudflare Registrar:

1. Add `rizom.ai` as a zone on Cloudflare (free plan)
2. Update nameservers at MijnDomein to Cloudflare's assigned nameservers
3. Wait for zone activation
4. Transfer domain registration to Cloudflare Registrar
5. Cloudflare manages both registration and DNS

### DNS in instance CI

The instance CI pipeline handles DNS as part of deploy:

1. Query Hetzner API for server IP (by brain name label)
2. Create/update A record: `{name}.rizom.ai → server IP` (Cloudflare API)
3. Idempotent — safe to run every deploy

### Custom domain (optional)

Add to instance's deploy.yml and CI:

1. Additional A record for custom domain → same server IP
2. kamal-proxy serves both `{name}.rizom.ai` and the custom domain

## Health endpoint ✅

Implemented. IPC heartbeat between main process and webserver child:

- **Main process (ServerManager):** sends `{ type: "heartbeat" }` every 5s via IPC
- **Child process (standalone-server):** `/health` returns 200 if heartbeat within 15s, 503 otherwise
- **If main crashes:** heartbeats stop → child reports unhealthy → Kamal detects failure

## What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **Dockerfile.prod** — reuse as-is
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container
- **Cloudflare account** — same account, API-managed

## What gets deleted from monorepo

- `deploy/providers/hetzner/terraform/` — all Terraform config
- `deploy/providers/hetzner/deploy.sh` — replaced by instance CI
- `deploy/providers/hetzner/deploy-app.sh` — same
- `deploy/scripts/` — deployment is per-instance, not centralized
- Caddyfile templates — kamal-proxy handles SSL
- Bunny CDN Terraform module — replaced by Cloudflare

## Steps

### Phase 0: Prerequisites

1. Transfer `rizom.ai` to Cloudflare (manual, one-time)
2. Health endpoint (✅ done)

### Phase 1: Publish brain model images

1. CI pipeline in monorepo: build + publish Docker images to GHCR on push to main
2. Tag with git sha + `latest`
3. One image per brain model: `ghcr.io/rizom-ai/rover`, `ranger`, `relay`

### Phase 2: First standalone instance

1. Create `yeehaa-brain` config repo
2. Add `brain.yaml`, `deploy.yml`, CI pipeline
3. CI: Hetzner API → server IP → Cloudflare DNS → `kamal deploy`
4. Verify: push to instance repo → brain deployed at `rover.rizom.ai`

### Phase 3: Migrate remaining instances

1. Create config repos for remaining brains
2. Migrate custom domains (yeehaa.io, mylittlephoney.com)
3. Delete `apps/` from monorepo
4. Delete old deploy scripts from monorepo

## Verification

1. Push to monorepo → images published to GHCR
2. Push to instance repo → brain deployed automatically
3. `{name}.rizom.ai` accessible with SSL
4. Custom domains work alongside subdomains
5. `kamal rollback` works from instance repo
6. No deploy config in monorepo
