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

| Service               | Port | Thread        |
| --------------------- | ---- | ------------- |
| Production static     | 8080 | Child process |
| Preview static        | 4321 | Child process |
| MCP HTTP (`/mcp`)     | 3333 | Main thread   |
| API routes (`/api/*`) | 3335 | Main thread   |
| Health (`/health`)    | 8080 | Child process |

kamal-proxy does host → port routing (no path-based routing). So it maps:

- `rover.rizom.ai` → one port
- `preview.rover.rizom.ai` → one port

But `rover.rizom.ai` needs to serve static files AND `/mcp` AND `/api/*` — three different internal ports. kamal-proxy can't split those.

**Solution: Caddy inside the container.** Caddy moves from external to internal — same job, just inside the container now. kamal-proxy handles SSL + host-based routing. Caddy handles path-based routing to internal services.

```
Internet → kamal-proxy (SSL, host routing)
  → rover.rizom.ai         → container:80   → Caddy → 8080 (static), 3333 (/mcp), 3335 (/api/*)
  → preview.rover.rizom.ai → container:4321 → Caddy → 4321 (preview static)
```

Caddy config is baked into the Docker image (it doesn't change per instance).

## Health endpoint ✅

Implemented. IPC heartbeat between main process and webserver child:

- **Main process (ServerManager):** sends `{ type: "heartbeat" }` every 5s via IPC
- **Child process (standalone-server):** `/health` returns 200 if heartbeat within 15s, 503 otherwise
- **If main crashes:** heartbeats stop → child reports unhealthy → Kamal detects failure

kamal-proxy health checks hit Caddy on port 80, which proxies to `/health` on 8080.

## Dockerfile.model

New Dockerfile for brain model images (`deploy/docker/Dockerfile.model`). Existing `Dockerfile.prod` is unchanged.

- Entrypoint: `dist/.model-entrypoint.js` (reads brain.yaml at runtime)
- Includes Caddy for internal port routing
- brain.yaml mounted at runtime via volume
- All workspace site packages bundled (any instance can use any site)

## What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **Dockerfile.prod** — unchanged, still works for legacy app-specific builds
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container
- **Cloudflare account** — same account, API-managed

## What gets deleted from monorepo

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

1. Manually create Hetzner VPS, label it, note IP
2. Create `yeehaa-brain` config repo with `brain.yaml`, `deploy.yml`, `.kamal/hooks/pre-deploy`
3. CI pipeline: server IP (env/lookup) → Cloudflare DNS → `kamal deploy`
4. Verify: push to instance repo → brain deployed at `rover.rizom.ai`
5. Old deployment on yeehaa.io keeps running — no cutover yet

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
