# Plan: Kamal Deploy (Core Brains on Hetzner)

## Context

Current deploy pipeline is over-engineered: Terraform provisions Hetzner VPS, SSH + rsync deploys Docker Compose + Caddyfile, Cloudflare Terraform for DNS. This works but is fragile and manual.

Kamal replaces the entire stack with `kamal deploy` — zero-downtime deploys, automatic SSL, instant rollbacks. Same Hetzner servers, same cost (~$20/month for 3 instances). A single command handles everything: container deploy, DNS, CDN, SSL.

## What Kamal replaces

| Concern       | Current                                      | Kamal                          |
| ------------- | -------------------------------------------- | ------------------------------ |
| Provisioning  | Terraform                                    | Manual VPS creation (one-time) |
| Deploy        | SSH + rsync + docker-compose up              | `kamal deploy`                 |
| SSL           | Caddy + Let's Encrypt                        | kamal-proxy + Let's Encrypt    |
| Zero-downtime | No (compose down/up)                         | Yes (container swap)           |
| Rollback      | Rebuild and redeploy                         | `kamal rollback` (instant)     |
| Config        | Terraform .tf + compose template + Caddyfile | Single `deploy.yml`            |
| DNS + CDN     | Cloudflare Terraform (separate step)         | Automated via deploy hook      |

## deploy.yml (per app)

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
    - CLOUDFLARE_API_TOKEN
    - AWS_ACCESS_KEY_ID
    - AWS_SECRET_ACCESS_KEY

volumes:
  - /opt/brain-data:/app/brain-data

healthcheck:
  path: /health
  port: 8080
```

## One command: DNS + CDN + Deploy

`kamal deploy` triggers a post-deploy hook that ensures the full infrastructure stack is in place. All calls are idempotent — first deploy creates everything, subsequent deploys are no-ops.

### Post-deploy hook flow

```
kamal deploy
  → build + push Docker image
  → deploy container with zero-downtime swap
  → run post-deploy hook:
      1. Cloudflare: create zone (if new domain)
      2. Cloudflare: set DNS A records (apex + www → server IP, proxied)
      3. Cloudflare: set preview DNS (preview.{domain} → server IP)
      4. Cloudflare: set SSL mode (full_strict)
      5. Cloudflare: set cache rules (bypass /mcp, /a2a, /api/*)
      6. Route 53: update nameservers to Cloudflare (if new domain)
```

### Hook implementation

A deploy script in `deploy/hooks/post-deploy` that calls:

- **Cloudflare API** — zone creation, DNS records, SSL settings, cache rules
- **AWS Route 53 API** — nameserver delegation to Cloudflare

Both APIs are called with simple HTTP requests (curl or a small Bun script). No Terraform needed.

### New domain setup (fully automated)

When deploying a new brain instance with a new domain:

1. `kamal deploy` deploys the container
2. Hook creates Cloudflare zone for the domain
3. Hook gets Cloudflare's assigned nameservers
4. Hook updates Route 53 hosted zone with Cloudflare nameservers
5. Hook creates DNS records pointing to server IP (proxied for CDN)
6. Hook sets SSL mode + cache rules

DNS propagation takes minutes. After that, the domain serves the brain with CDN and SSL. No manual steps.

### Existing domain (no-op)

Hook checks if records exist before creating. Subsequent deploys skip all DNS/CDN steps.

## CDN: Cloudflare on all sites

Every brain instance goes behind Cloudflare (free tier). Standard for all deployments.

- Cloudflare handles CDN caching, DDoS protection, edge SSL
- kamal-proxy handles origin SSL (Cloudflare → origin uses Full Strict mode)
- Static assets (HTML, CSS, JS, images, WebP) cached at edge
- API routes (`/mcp`, `/a2a`, `/api/*`) bypass cache
- `/mcp` redirected to preview subdomain (direct to origin, no CDN termination)
- Replaces Bunny CDN

## What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **Dockerfile.prod** — reuse as-is
- **brains build** — reuse for bundling
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container
- **Cloudflare account** — same account, API-managed instead of Terraform

## What gets deleted

- `deploy/providers/hetzner/terraform/` — all Terraform config (including Cloudflare modules)
- `deploy/providers/hetzner/deploy.sh` — replaced by `kamal deploy`
- `deploy/providers/hetzner/deploy-app.sh` — same
- Caddyfile templates — kamal-proxy handles SSL
- Bunny CDN Terraform module — replaced by Cloudflare

## Health endpoint

Kamal needs a health check endpoint. The webserver plugin needs to expose `/health` returning 200 when the brain is initialized. This is also useful for monitoring.

## Steps

1. Install Kamal (`gem install kamal` or use Docker image)
2. Write post-deploy hook (`deploy/hooks/post-deploy`) — Cloudflare + Route 53 API calls
3. Create `deploy.yml` for each app (yeehaa, rizom, mylittlephoney)
4. Set secrets: `kamal env push` (includes Cloudflare + AWS tokens)
5. First deploy: `kamal setup` (installs kamal-proxy on server)
6. Run `kamal deploy` — deploys container + sets up DNS/CDN automatically
7. Verify all 3 instances work
8. Delete Terraform config, old deploy scripts, Caddyfile templates, Bunny CDN module

## Key files

| File                              | Action                                    |
| --------------------------------- | ----------------------------------------- |
| `deploy/kamal/yeehaa.yml`         | Create — Kamal deploy config              |
| `deploy/kamal/rizom.yml`          | Create                                    |
| `deploy/kamal/mylittlephoney.yml` | Create                                    |
| `deploy/hooks/post-deploy`        | Create — Cloudflare + Route 53 automation |
| `deploy/providers/hetzner/`       | Delete after migration                    |
| `interfaces/webserver/src/`       | Add `/health` endpoint                    |

## Verification

1. `kamal setup` succeeds on each Hetzner server
2. `kamal deploy` deploys new image with zero downtime
3. Post-deploy hook creates/verifies DNS records and CDN rules
4. All 3 sites accessible via Cloudflare with SSL
5. Static assets served from CDN edge
6. `/mcp` and `/a2a` bypass CDN cache
7. `kamal rollback` reverts to previous version
8. New domain deploy (e.g. test.rizom.ai) provisions DNS + CDN automatically
9. Old Terraform/Caddy config deleted
