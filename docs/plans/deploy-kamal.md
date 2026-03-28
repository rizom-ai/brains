# Plan: Kamal Deploy + DNS/CDN Automation

## Context

Current deploy pipeline is over-engineered: Terraform provisions Hetzner VPS, SSH + rsync deploys Docker Compose + Caddyfile, Cloudflare Terraform for DNS. This works but is fragile and manual.

Kamal replaces the entire stack with `kamal deploy` — zero-downtime deploys, automatic SSL, instant rollbacks. Same Hetzner servers, same cost (~$20/month for 3 instances).

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

## DNS + CDN automation

Every brain instance goes behind Cloudflare (free tier). DNS and CDN setup is automated — first deploy creates everything, subsequent deploys are no-ops (all calls idempotent).

### Domain setup script (one-time per domain)

A `deploy/setup-domain` script that:

1. Creates Cloudflare zone for the domain (if new)
2. Gets Cloudflare's assigned nameservers
3. Updates Route 53 hosted zone with Cloudflare nameservers
4. Creates DNS A records (apex + www → server IP, proxied)
5. Creates preview DNS (preview.{domain} → server IP)
6. Sets SSL mode (full_strict)
7. Sets cache rules (bypass /mcp, /a2a, /api/\*)

Called manually before first deploy of a new domain. Not in a post-deploy hook — DNS propagation takes minutes and shouldn't block deploys.

### Existing domain (no-op)

Script checks if records exist before creating. Running it on an existing domain is safe.

### CDN rules (all sites)

- Static assets (HTML, CSS, JS, images, WebP) cached at edge
- API routes (`/mcp`, `/a2a`, `/api/*`) bypass cache
- `/mcp` on preview subdomain (direct to origin)
- Cloudflare handles DDoS, edge SSL
- kamal-proxy handles origin SSL (Full Strict mode)

## Health endpoint

Kamal needs a health check endpoint. The webserver plugin exposes `/health` returning 200 when the brain is initialized.

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

### Phase 1: Kamal deploy

1. Install Kamal
2. Create `deploy.yml` for each app (yeehaa, rizom, mylittlephoney)
3. Add `/health` endpoint to webserver plugin
4. Set secrets: `kamal env push`
5. First deploy: `kamal setup`
6. Run `kamal deploy` — verify zero-downtime container swap
7. Verify all 3 instances work

### Phase 2: DNS/CDN automation

1. Write `deploy/setup-domain` script — Cloudflare + Route 53 API calls
2. Run for each existing domain
3. Verify CDN caching + SSL + cache bypass rules
4. Delete Terraform config, old deploy scripts, Caddyfile templates

### Phase 3: Publish brain model images

1. CI pipeline: build + publish `ghcr.io/rizom-ai/rover`, `ranger`, `relay` on release
2. Tag with version and `latest`
3. Update deploy.yml to reference published images
4. Verify: deploy from published image works

## Key files

| File                              | Action                               |
| --------------------------------- | ------------------------------------ |
| `deploy/kamal/yeehaa.yml`         | Create — Kamal deploy config         |
| `deploy/kamal/rizom.yml`          | Create                               |
| `deploy/kamal/mylittlephoney.yml` | Create                               |
| `deploy/setup-domain`             | Create — Cloudflare + Route 53 setup |
| `deploy/providers/hetzner/`       | Delete after migration               |
| `interfaces/webserver/src/`       | Add `/health` endpoint               |
| `.github/workflows/`              | Add image publish pipeline           |

## Verification

1. `kamal setup` succeeds on each Hetzner server
2. `kamal deploy` deploys new image with zero downtime
3. `setup-domain` creates/verifies DNS records and CDN rules
4. All 3 sites accessible via Cloudflare with SSL
5. Static assets served from CDN edge
6. `/mcp` and `/a2a` bypass CDN cache
7. `kamal rollback` reverts to previous version
8. New domain setup provisions DNS + CDN automatically
9. Published brain model images deploy correctly
