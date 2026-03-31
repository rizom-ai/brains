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
  hosts:
    - rover.rizom.ai:80
    - preview.rover.rizom.ai:81
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

## brain.yaml deployment

Kamal doesn't natively upload files for the main app. A pre-deploy hook SCPs `brain.yaml` from the instance repo to the server:

```bash
# .kamal/hooks/pre-deploy
IFS=',' read -ra HOSTS <<< "$KAMAL_HOSTS"
for host in "${HOSTS[@]}"; do
  scp brain.yaml "deploy@${host}:/opt/brain.yaml"
done
```

Runs automatically before every deploy.

## brain-data volume

The `/opt/brain-data` volume starts empty on a fresh server. On first startup, directory-sync's GitSync clones the content repo (configured via `git.gitUrl` in brain.yaml). If the content repo is also empty, it initializes locally and seed content is copied in. No manual setup needed.

## Instance CI pipeline

### Phase 1 (manual server)

Server exists (manually created on Hetzner). CI pipeline:

1. Gets server IP from env var or Hetzner API lookup (by label)
2. Creates/updates `{name}.rizom.ai` DNS via Cloudflare API
3. Runs `kamal deploy` (pre-deploy hook uploads brain.yaml)

### Phase 2+ (auto-provisioning)

CI pipeline provisions the server too:

1. Creates server via Hetzner API if it doesn't exist (labeled by brain name)
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

## Internal port routing

The container runs multiple services on separate ports:

| Service                  | Port | Thread      |
| ------------------------ | ---- | ----------- |
| Production static        | 8080 | In-process  |
| Preview static           | 4321 | In-process  |
| MCP HTTP (`/mcp`)        | 3333 | Main thread |
| A2A (`/a2a`, agent card) | 3334 | Main thread |
| API routes (`/api/*`)    | 3335 | Main thread |
| Health (`/health`)       | 8080 | In-process  |

kamal-proxy does host → port routing (no path-based routing). So it maps:

- `rover.rizom.ai` → one port
- `preview.rover.rizom.ai` → one port

But `rover.rizom.ai` needs to serve static files AND `/mcp` AND `/api/*` — three different internal ports. kamal-proxy can't split those.

**Solution: Caddy inside the container.** Caddy moves from external to internal — same job, just inside the container now. kamal-proxy handles SSL + host-based routing. Caddy handles path-based routing to internal services.

```
Internet → kamal-proxy (SSL, host routing)
  → rover.rizom.ai         → container:80 → Caddy → 8080 (static), 3333 (/mcp), 3334 (/a2a), 3335 (/api/*)
  → preview.rover.rizom.ai → container:81 → Caddy → 4321 (preview static)
```

Caddy config is baked into the Docker image (it doesn't change per instance).

## Health endpoint ✅

Implemented. The webserver runs in-process via `Bun.serve()` and exposes `/health` on port 8080. kamal-proxy health checks hit Caddy on port 80, which proxies to `/health` on 8080.

## Dockerfile.model ✅

Single Dockerfile for all brain images (`deploy/docker/Dockerfile.model`). Replaces `Dockerfile.prod`.

- Entrypoint: `dist/.model-entrypoint.js` or `dist/.brain-entrypoint.js` (fallback)
- Includes Caddy for internal port routing
- `setcap` allows non-root Caddy to bind ports 80/443
- brain.yaml copied from dist at build time, can be overridden via volume mount
- All workspace site packages bundled (any instance can use any site)

## Dockerfile.model on current Hetzner ✅

Verified working. Single container with built-in Caddy handles TLS (Let's Encrypt) directly — no external Caddy container needed. The Hetzner deploy scripts (`deploy-app.sh`) use `Dockerfile.model` and mount a domain-specific Caddyfile at runtime.

## What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container
- **Cloudflare account** — same account, API-managed

## What gets deleted from monorepo

- `deploy/docker/Dockerfile.prod` — replaced by Dockerfile.model
- `deploy/providers/hetzner/terraform/` — all Terraform config
- `deploy/providers/hetzner/deploy.sh` — replaced by instance CI
- `deploy/providers/hetzner/deploy-app.sh` — same
- `deploy/scripts/` — deployment is per-instance, not centralized
- Bunny CDN Terraform module — replaced by Cloudflare

## Steps

### Phase 0: Prerequisites

1. Transfer `rizom.ai` to Cloudflare (manual, one-time)
2. Health endpoint (✅ done)

### Phase 1: Publish brain model images

1. `generateModelEntrypoint` (✅ done) + `build-model.ts` script (✅ done)
2. `Dockerfile.model` — includes Caddy for internal routing, entrypoint reads brain.yaml at runtime
3. CI pipeline in monorepo: build + publish Docker images to GHCR on push to main
4. Tag with git sha + `latest`
5. One image per brain model: `ghcr.io/rizom-ai/rover`, `ranger`, `relay`

### Phase 2: First standalone instance

Depends on: [`@rizom/brain`](./npm-packages.md) (`brain init`).

1. `brain init --model rover` — scaffolds instance repo with brain.yaml, deploy.yml, CI pipeline
2. Push to GitHub → CI provisions server, sets DNS, deploys
3. Verify: `rover.rizom.ai` serves the brain
4. Old deployment on yeehaa.io keeps running — no cutover yet

### Phase 3: Migrate remaining instances + custom domains

Old infra keeps running in parallel throughout. No cutover risk.

1. Create config repos for remaining brains (ranger, relay, mlp)
2. Deploy each to `{name}.rizom.ai` subdomains — verify they work
3. Point custom domain DNS to the Kamal server IP (one at a time)
4. Add custom domain as additional host in deploy.yml (kamal-proxy serves both)
5. Verify custom domain works, then decommission old deployment for that brain
6. Delete `apps/` from monorepo after all instances migrated

## Verification

1. Push to monorepo → images published to GHCR
2. Push to instance repo → brain deployed automatically
3. `{name}.rizom.ai` accessible with SSL
4. Custom domains work alongside subdomains
5. `kamal rollback` works from instance repo
6. No deploy config in monorepo
