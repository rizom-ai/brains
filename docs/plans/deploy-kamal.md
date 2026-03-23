# Plan: Kamal Deploy (Core Brains on Hetzner)

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
| DNS           | Cloudflare Terraform                         | Manual (one-time per domain)   |

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

volumes:
  - /opt/brain-data:/app/brain-data

healthcheck:
  path: /health
  port: 8080
```

## What stays from current infra

- **Hetzner VPS instances** — keep existing servers
- **Dockerfile.prod** — reuse as-is
- **brains build** — reuse for bundling
- **git-sync** — still pushes to GitHub
- **Discord bot** — runs inside container

## What gets deleted

- `deploy/providers/hetzner/terraform/` — all Terraform config
- `deploy/providers/hetzner/deploy.sh` — replaced by `kamal deploy`
- `deploy/providers/hetzner/deploy-app.sh` — same
- Caddyfile templates — kamal-proxy handles SSL
- Cloudflare Terraform — DNS is manual (one-time)

## Health endpoint

Kamal needs a health check endpoint. The webserver plugin needs to expose `/health` returning 200 when the brain is initialized. This is also useful for monitoring.

## Steps

1. Install Kamal (`gem install kamal` or use Docker image)
2. Create `deploy.yml` for each app (yeehaa, rizom, mylittlephoney)
3. Set secrets: `kamal env push`
4. First deploy: `kamal setup` (installs kamal-proxy on server)
5. Subsequent deploys: `kamal deploy`
6. Verify all 3 instances work
7. Delete Terraform config, old deploy scripts, Caddyfile templates
8. Update CI/CD to use `kamal deploy`

## Key files

| File                              | Action                 |
| --------------------------------- | ---------------------- |
| `deploy/kamal/yeehaa.yml`         | Create                 |
| `deploy/kamal/rizom.yml`          | Create                 |
| `deploy/kamal/mylittlephoney.yml` | Create                 |
| `deploy/providers/hetzner/`       | Delete after migration |
| `interfaces/webserver/src/`       | Add `/health` endpoint |

## Verification

1. `kamal setup` succeeds on each Hetzner server
2. `kamal deploy` deploys new image with zero downtime
3. All 3 sites accessible with SSL
4. MCP, A2A, Discord, git-sync all work
5. `kamal rollback` reverts to previous version
6. Old Terraform/Caddy config deleted
