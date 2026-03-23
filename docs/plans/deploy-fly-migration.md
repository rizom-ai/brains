# Plan: Deployment — Kamal on Hetzner + Fly.io for Hosted Rovers

## Context

Current deploy pipeline is over-engineered: Terraform provisions Hetzner VPS, SSH + rsync deploys Docker Compose + Caddyfile, Cloudflare Terraform for DNS. This works but is fragile and manual.

The original plan was to migrate everything to Fly.io. But Fly is 4x the cost (~$77/month for 3 instances vs ~$20 on Hetzner) for a workload that doesn't need multi-region or auto-scaling. The real problems are:

1. **Deploy DX is painful** — Terraform + SSH + rsync + Caddy management
2. **Hosted rovers need programmatic provisioning** — can't spin up VPS instances via API ergonomically

These are two different problems with two different solutions.

## Design: Hybrid Approach

**Core brains (yeehaa.io, rizom.ai, mylittlephoney.com)** → Hetzner + Kamal. Same cost, dramatically better DX.

**Hosted rovers ({name}.rover.rizom.ai)** → Fly.io Machines API. Programmatic provisioning, per-instance billing, scale-to-zero potential.

### Cost comparison

| Setup                              | Monthly | Notes                  |
| ---------------------------------- | ------- | ---------------------- |
| Current (3x Hetzner CX33)          | ~$20    | Post-April 2026: ~$25  |
| Hybrid: 3x Hetzner + Kamal         | ~$20    | Same cost, better DX   |
| All Fly.io (3x 4GB)                | ~$77    | 4x more for no benefit |
| Hybrid + 5 hosted rovers (Fly 1GB) | ~$50    | $20 Hetzner + $30 Fly  |

## Phase 1: Kamal on Hetzner (core brains)

### What Kamal replaces

| Concern       | Current                                      | Kamal                          |
| ------------- | -------------------------------------------- | ------------------------------ |
| Provisioning  | Terraform                                    | Manual VPS creation (one-time) |
| Deploy        | SSH + rsync + docker-compose up              | `kamal deploy`                 |
| SSL           | Caddy + Let's Encrypt                        | kamal-proxy + Let's Encrypt    |
| Zero-downtime | No (compose down/up)                         | Yes (container swap)           |
| Rollback      | Rebuild and redeploy                         | `kamal rollback` (instant)     |
| Config        | Terraform .tf + compose template + Caddyfile | Single `deploy.yml`            |
| DNS           | Cloudflare Terraform                         | Manual (one-time per domain)   |

### deploy.yml (per app)

```yaml
service: yeehaa-brain
image: ghcr.io/rizom-ai/brains

servers:
  web:
    hosts:
      - 1.2.3.4
    options:
      memory: 4g

proxy:
  ssl: true
  host: yeehaa.io
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

healthcheck:
  path: /health
  port: 8080
```

### What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **Dockerfile.prod** — reuse as-is
- **brains build** — reuse for bundling
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container

### What gets deleted

- `deploy/providers/hetzner/terraform/` — all Terraform config
- `deploy/providers/hetzner/deploy.sh` — replaced by `kamal deploy`
- `deploy/providers/hetzner/deploy-app.sh` — same
- Caddyfile templates — kamal-proxy handles SSL
- Cloudflare Terraform — DNS is manual (one-time)

### Steps

1. Install Kamal (`gem install kamal` or use Docker image)
2. Create `deploy.yml` for each app (yeehaa, rizom, mylittlephoney)
3. Set secrets: `kamal env push`
4. First deploy: `kamal setup` (installs kamal-proxy on server)
5. Subsequent deploys: `kamal deploy`
6. Verify all 3 instances work
7. Delete Terraform config, old deploy scripts, Caddyfile templates
8. Update CI/CD to use `kamal deploy`

### Health endpoint

Kamal needs a health check endpoint. The webserver plugin needs to expose `/health` returning 200 when the brain is initialized. This is also useful for monitoring.

## Phase 2: Fly.io for Hosted Rovers

Only when hosted rovers are ready (after agent directory, presets, etc.). Ranger provisions rover instances via the Fly Machines API.

### Why Fly for rovers specifically

- **Machines API** — programmatic create/start/stop/destroy
- **Per-second billing** — rovers that are mostly idle pay less
- **Minimal overhead** — no Terraform, no SSH, no server management
- **Subdomain routing** — `{name}.rover.rizom.ai` via Fly certificates

### Rover machine spec

```
shared-cpu-1x, 1GB RAM (after media sidecar extraction)
1GB persistent volume
A2A + MCP only (no webserver, no Discord — ranger proxies)
Minimal preset
~$7.50/month per rover (always-on) or less with auto-stop
```

### Prerequisites

1. Media sidecar extraction (brain drops to ~1GB)
2. Chat SDK migration (drop Matrix native crypto)
3. Agent directory (rover discovery)
4. Hosted rovers plan implementation

### Key difference from core brains

| Concern      | Core brains (Kamal)          | Hosted rovers (Fly)         |
| ------------ | ---------------------------- | --------------------------- |
| Provisioning | Manual (one-time)            | Machines API (programmatic) |
| Lifecycle    | Always-on                    | Can auto-stop when idle     |
| Memory       | 4GB (full brain)             | 1GB (minimal, no ONNX)      |
| Interfaces   | All (Discord, web, MCP, A2A) | A2A + MCP only              |
| Cost         | ~$7/instance/month           | ~$7.50/instance/month       |
| Who manages  | Developer (you)              | Ranger (automated)          |

## Key files

| File                              | Action                       |
| --------------------------------- | ---------------------------- |
| `deploy/kamal/yeehaa.yml`         | Create — Kamal deploy config |
| `deploy/kamal/rizom.yml`          | Create                       |
| `deploy/kamal/mylittlephoney.yml` | Create                       |
| `deploy/providers/hetzner/`       | Delete after migration       |
| `interfaces/webserver/src/`       | Add `/health` endpoint       |

## Verification

### Phase 1

1. `kamal setup` succeeds on each Hetzner server
2. `kamal deploy` deploys new image with zero downtime
3. All 3 sites accessible with SSL
4. MCP, A2A, Discord, git-sync all work
5. `kamal rollback` reverts to previous version
6. Old Terraform/Caddy config deleted

### Phase 2

7. Ranger creates rover instance via Machines API
8. Rover responds on `{name}.rover.rizom.ai`
9. Rover auto-stops after inactivity, wakes on A2A request
10. Ranger can destroy rover instance
