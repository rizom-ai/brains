# Plan: Deploy mylittlephoney to Fly.io

## Context

mylittlephoney is a rover brain instance running a personal blog site. Currently only runs locally. Need to deploy to production at mylittlephoney.com. Using Fly.io instead of Hetzner because:

- Simpler deploy pipeline (no Terraform, no SSH)
- Serves as proof of concept for hosted rovers
- Scale-to-zero potential for future multi-instance hosting
- Built-in SSL, custom domains, persistent volumes

## CDN: Not needed initially

Fly.io serves from edge locations with built-in SSL. The brain serves its own static site via the webserver plugin. For a personal blog with modest traffic, Fly's built-in serving is sufficient.

**Drop Bunny CDN** for this deploy. The site-builder generates static HTML to `dist/site-production/`, and the webserver plugin serves it directly. No CDN layer needed.

If traffic grows, Cloudflare can be added later as a reverse proxy (free tier) — just point DNS through Cloudflare. No code changes required.

## Architecture

```
mylittlephoney.com          → Fly.io (TLS) → :8080 production site + /mcp + /a2a
preview.mylittlephoney.com  → Fly.io (TLS) → :4321 preview site + CMS

Fly.io Machine
  ├── Bun process (brain runtime)
  ├── Webserver: production (:8080) + preview (:4321)
  │   ├── Static site (catch-all)
  │   ├── /mcp* → MCP HTTP (mounted as API route)
  │   └── /a2a* → A2A (mounted as API route)
  ├── Discord bot (direct connection, no port)
  ├── SQLite on persistent volume
  └── brain-data/ on persistent volume
```

Single Fly Machine with a persistent volume. The brain process handles everything: Discord bot, site building, content sync. No Caddy needed — the webserver plugin serves the site and mounts MCP/A2A as path-based API routes on the same ports. Fly handles TLS.

## Steps

### Step 1: Create fly.toml

```toml
app = "mylittlephoney"
primary_region = "ams"  # Amsterdam (close to user)

[build]
  dockerfile = "../../deploy/docker/Dockerfile.prod"

[env]
  NODE_ENV = "production"

# Production site (mylittlephoney.com)
# Serves: static site + /mcp* + /a2a* (all path-mounted on same port)
[[services]]
  internal_port = 8080
  protocol = "tcp"
  auto_stop_machines = false  # Brain must stay running (Discord bot)
  auto_start_machines = true
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
  [[services.ports]]
    port = 80
    handlers = ["http"]
  [[services.tcp_checks]]
    interval = "30s"
    timeout = "5s"

# Preview site + CMS (preview.mylittlephoney.com)
[[services]]
  internal_port = 4321
  protocol = "tcp"
  [[services.ports]]
    port = 4321
    handlers = ["tls", "http"]

[mounts]
  source = "brain_data"
  destination = "/app/brain-data"

[[vm]]
  size = "shared-cpu-1x"
  memory = "2gb"  # site building + Discord + git ops need headroom
```

**Ports:**

| Internal | External | Domain                       | Serves                            |
| -------- | -------- | ---------------------------- | --------------------------------- |
| 8080     | 443/80   | `mylittlephoney.com`         | Production site + `/mcp` + `/a2a` |
| 4321     | 4321     | `preview.mylittlephoney.com` | Preview site + CMS                |

No Caddy needed. MCP and A2A don't need separate ports — the webserver mounts them as API routes via `context.apiRoutes`.

Requires dedicated IPv4 for multiple services: `fly ips allocate-v4`

### Step 2: Build script for Fly

Create `deploy/providers/fly/deploy.sh`:

1. Run `brains build` from `apps/mylittlephoney` (produces `dist/`)
2. Copy `deploy/brain.yaml` → `dist/brain.yaml`
3. Build Docker image using existing `Dockerfile.prod`
4. `fly deploy`

Note: seed content is bundled inside the brain package (`brains/rover/seed-content/`). The `import.meta.dir` path in the directory-sync config resolves correctly in the bundle because `brains build` preserves the directory structure.

### Step 3: Set secrets on Fly

```bash
fly secrets set \
  DISCORD_BOT_TOKEN=xxx \
  GIT_SYNC_TOKEN=xxx \
  ANTHROPIC_API_KEY=xxx \
  OPENAI_API_KEY=xxx
```

### Step 4: DNS

Point both domains to Fly:

- `mylittlephoney.com` → CNAME to `mylittlephoney.fly.dev`
- `preview.mylittlephoney.com` → CNAME to `mylittlephoney.fly.dev`
- Add both as custom domains in Fly dashboard: `fly certs add mylittlephoney.com` + `fly certs add preview.mylittlephoney.com`
- Fly handles SSL certificates automatically

### Step 5: Persistent volume

```bash
fly volumes create brain_data --region ams --size 10
```

10GB — stores SQLite database, brain-data markdown files, images (~175MB), and git history (~366MB and growing). Survives deploys. $1.50/month.

### Step 6: Deploy

```bash
cd apps/mylittlephoney
fly deploy
```

## brain.yaml changes

The deploy brain.yaml needs:

- ✅ `site: "@brains/site-mylittlephoney"` (already fixed)
- ✅ `add: [decks]` (already set)
- Remove `domain` field (Fly handles this via fly.toml)
- Remove CDN/DNS deployment config from rover brain definition for this instance

## What stays from current infra

- **Dockerfile.prod** — reuse as-is
- **build-release.sh / brains build** — reuse for bundling
- **git-sync** — still pushes content to GitHub repo
- **Discord bot** — runs inside the Fly Machine

## What changes vs Hetzner

| Concern      | Hetzner              | Fly.io               |
| ------------ | -------------------- | -------------------- |
| Provisioning | Terraform            | `fly launch`         |
| Deploy       | SSH + rsync          | `fly deploy`         |
| SSL          | Caddy/Let's Encrypt  | Automatic            |
| DNS          | Cloudflare Terraform | Manual or Fly DNS    |
| CDN          | Bunny CDN            | Not needed           |
| Monitoring   | Custom scripts       | `fly logs`/dashboard |
| Volumes      | Server disk          | Fly Volumes          |
| Cost         | ~€7/mo               | ~$15/mo (2GB + 10GB) |

## Future: hosted rovers

This deploy is the proof of concept for hosted rovers (see `docs/plans/hosted-rovers.md`). Key differences for hosted:

- Ranger provisions via Fly Machines API (no manual `fly deploy`)
- Minimal preset (no Discord, no webserver — rover uses A2A, ranger handles Discord as shared gateway)
- Ranger generates brain.yaml per instance
- Each rover gets its own volume + secrets
- Subdomain `{name}.rover.rizom.ai` instead of custom domain

## Key files

| File                                    | Action |
| --------------------------------------- | ------ |
| `apps/mylittlephoney/fly.toml`          | Create |
| `deploy/providers/fly/deploy.sh`        | Create |
| `apps/mylittlephoney/deploy/brain.yaml` | Done   |

## TODOs discovered during review

- **Health endpoint**: webserver doesn't expose `/health` yet. Using TCP check for now. Add an HTTP health endpoint that returns 200 when the brain is initialized.
- **Preview port routing**: Fly routes by port, but preview is on 4321 (non-standard). Verify Fly handles TLS termination + routing to non-443 internal ports correctly with the `[[services]]` config.
- **Verify `import.meta.dir` in bundle**: the directory-sync seed content path uses `join(import.meta.dir, "..", "seed-content")`. Confirm this resolves correctly inside the Docker image after `brains build`.

## Verification

1. `brains build` succeeds from `apps/mylittlephoney`
2. Docker image builds locally
3. `fly deploy` succeeds
4. Production site accessible at `mylittlephoney.com`
5. Preview site accessible at `preview.mylittlephoney.com`
6. MCP endpoint responds at `mylittlephoney.com/mcp`
7. A2A endpoint responds at `mylittlephoney.com/a2a`
8. Discord bot responds
9. Content syncs to GitHub
