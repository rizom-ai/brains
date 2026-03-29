# Plan: Kamal Deploy + DNS/CDN Automation

## Context

Current deploy pipeline is over-engineered: Terraform provisions Hetzner VPS, SSH + rsync deploys Docker Compose + Caddyfile, Cloudflare Terraform for DNS. This works but is fragile and manual.

Kamal replaces the entire stack with `kamal deploy` — zero-downtime deploys, automatic SSL, instant rollbacks. Same Hetzner servers, same cost (~$20/month for 3 instances).

## Default domain: `{name}.rizom.ai`

Every brain gets a subdomain on `rizom.ai` by default. No custom domain required to deploy. SSL works from day one.

```
rover.rizom.ai     → 1.2.3.4  (yeehaa's rover)
ranger.rizom.ai    → 5.6.7.8  (collective ranger)
relay.rizom.ai     → 9.10.11.12
```

Custom domains are optional overrides — add `domain: yeehaa.io` to brain.yaml later. Both the subdomain and custom domain point to the same server.

## What Kamal replaces

| Concern       | Current                                      | Kamal                          |
| ------------- | -------------------------------------------- | ------------------------------ |
| Provisioning  | Terraform                                    | Manual VPS creation (one-time) |
| Deploy        | SSH + rsync + docker-compose up              | `kamal deploy`                 |
| SSL           | Caddy + Let's Encrypt                        | kamal-proxy + Let's Encrypt    |
| Zero-downtime | No (compose down/up)                         | Yes (container swap)           |
| Rollback      | Rebuild and redeploy                         | `kamal rollback` (instant)     |
| Config        | Terraform .tf + compose template + Caddyfile | Single `deploy.yml`            |
| DNS + CDN     | Cloudflare Terraform (separate step)         | Automated via deploy script    |

## deploy.yml (per app)

### Phase 1-2: build from monorepo

brain.yaml is baked into the image (apps are still monorepo workspaces). Image is built locally and pushed to GHCR per deploy.

```yaml
service: rover
image: ghcr.io/rizom-ai/rover

servers:
  web:
    hosts:
      - 1.2.3.4
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

builder:
  dockerfile: deploy/docker/Dockerfile.prod

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

### Phase 3+: published images + standalone apps

brain.yaml is mounted (apps are standalone repos). Image is pre-published to GHCR.

```yaml
service: rover
image: ghcr.io/rizom-ai/rover

# ... same as above, but remove builder section and add:
volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
```

## DNS setup

### Phase 0: Transfer rizom.ai to Cloudflare

`rizom.ai` is registered at MijnDomein. Transfer to Cloudflare Registrar:

1. Add `rizom.ai` as a zone on Cloudflare (free plan)
2. Update nameservers at MijnDomein to Cloudflare's assigned nameservers
3. Wait for zone activation
4. Transfer domain registration: **Domain Registration** → **Transfer Domains** → `rizom.ai`
5. Once transferred, Cloudflare manages both registration and DNS

Cloudflare Registrar renews at wholesale cost (no markup).

### Per-brain DNS (automated)

A `deploy/setup-brain` script creates the DNS record for a brain:

1. Creates A record: `{name}.rizom.ai → server IP` (Cloudflare, proxied)
2. Sets SSL mode (Full Strict) if not already set
3. All idempotent — safe to re-run

Called once before first deploy. Subsequent deploys don't touch DNS.

### Custom domain (optional, later)

When a brain gets its own domain:

1. Add zone to Cloudflare for the custom domain
2. Update registrar nameservers to Cloudflare
3. Create A records: `apex + www → server IP` (proxied)
4. Create preview DNS: `preview.{domain} → server IP`
5. Update `deploy.yml`: `host: yeehaa.io`
6. Kamal-proxy serves both `rover.rizom.ai` and `yeehaa.io`

### CDN rules (all sites)

- Static assets (HTML, CSS, JS, images, WebP) cached at edge
- API routes (`/mcp`, `/a2a`, `/api/*`) bypass cache
- Cloudflare handles DDoS, edge SSL
- kamal-proxy handles origin SSL (Full Strict mode)

## Health endpoint

Kamal needs a health check endpoint on port 8080 (production webserver).

The webserver runs as a child process — it can't check brain state directly. The main process sends heartbeats via IPC (Bun subprocess messaging). The child tracks them and exposes `/health`:

- **Main process (ServerManager):** sends `{ type: "heartbeat" }` every 5s via IPC after brain initialization
- **Child process (standalone-server):** tracks last heartbeat timestamp. `/health` returns 200 if last heartbeat within 15s, 503 otherwise
- **Zod schema:** shared `healthMessageSchema` validates IPC messages in both processes
- **If main crashes:** heartbeats stop, child reports unhealthy after timeout, Kamal detects failure

This gives Kamal a real liveness check — not just "is the webserver process alive" but "is the brain process alive and sending heartbeats."

### Dashboard health widget (follow-up)

The dashboard already supports client-side hydrated widgets. A health widget polls `/health` and shows live brain status (healthy/unhealthy, uptime). Not blocking for Kamal — add after the endpoint exists.

### Files

| File                                            | Change                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| `interfaces/webserver/src/health-ipc.ts`        | New — shared Zod schema + constants                |
| `interfaces/webserver/src/server-manager.ts`    | Add IPC channel to spawn, start heartbeat interval |
| `interfaces/webserver/src/standalone-server.ts` | Listen for IPC heartbeats, add `/health` route     |

## What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **Dockerfile.prod** — reuse as-is
- **brains build** — reuse for bundling
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container
- **Cloudflare account** — same account, API-managed instead of Terraform

## What gets deleted

- `deploy/providers/hetzner/terraform/` — all Terraform config
- `deploy/providers/hetzner/deploy.sh` — replaced by `kamal deploy`
- `deploy/providers/hetzner/deploy-app.sh` — same
- Caddyfile templates — kamal-proxy handles SSL
- Bunny CDN Terraform module — replaced by Cloudflare

## Steps

### Phase 0: Transfer rizom.ai to Cloudflare

1. Add `rizom.ai` zone on Cloudflare (free plan)
2. Update nameservers at MijnDomein to Cloudflare
3. Transfer domain registration to Cloudflare Registrar
4. Verify DNS resolution works

### Phase 1: Kamal deploy

1. Install Kamal
2. Add `/health` endpoint to webserver plugin
3. Write `deploy/setup-brain` script — creates `{name}.rizom.ai` A record on Cloudflare
4. Run `setup-brain` for each brain (creates DNS records)
5. Create `deploy.yml` for each brain (host: `{name}.rizom.ai`)
6. Set secrets: `kamal env push`
7. First deploy: `kamal setup`
8. Run `kamal deploy` — verify zero-downtime container swap
9. Verify all instances accessible via `{name}.rizom.ai` with SSL

### Phase 2: Custom domains

Phase 1 deploys new instances to `{name}.rizom.ai` subdomains. Old deployments on custom domains keep running on old infra. No migration — parallel instances until verified.

Once subdomain deploys are verified:

1. Point custom domain A record to the Kamal server IP (manual DNS change)
2. Add custom domain as additional host in deploy.yml (kamal-proxy serves both)
3. Verify: custom domain serves the brain correctly
4. Decommission old deployment on old infra
5. One domain at a time — yeehaa.io first, then mylittlephoney.com

Old Terraform config and deploy scripts can be deleted whenever — no rush, the Kamal flow is independent.

### Phase 3: Publish brain model images

1. CI pipeline: build + publish `ghcr.io/rizom-ai/rover`, `ranger`, `relay` on release
2. Tag with version and `latest`
3. Update deploy.yml to reference published images
4. Verify: deploy from published image works

## Key files

| File                        | Action                                  |
| --------------------------- | --------------------------------------- |
| `deploy/kamal/rover.yml`    | Create — Kamal deploy config            |
| `deploy/kamal/ranger.yml`   | Create                                  |
| `deploy/kamal/relay.yml`    | Create                                  |
| `deploy/setup-brain`        | Create — Cloudflare DNS setup per brain |
| `deploy/providers/hetzner/` | Delete after migration                  |
| `interfaces/webserver/src/` | Add `/health` endpoint                  |
| `.github/workflows/`        | Add image publish pipeline              |

## Verification

1. `rizom.ai` DNS managed by Cloudflare
2. `{name}.rizom.ai` resolves to correct server IP for each brain
3. `kamal setup` succeeds on each Hetzner server
4. `kamal deploy` deploys new image with zero downtime
5. All brains accessible via `{name}.rizom.ai` with SSL
6. Custom domains work alongside subdomains
7. Static assets served from CDN edge
8. `/mcp` and `/a2a` bypass CDN cache
9. `kamal rollback` reverts to previous version
10. Published brain model images deploy correctly
