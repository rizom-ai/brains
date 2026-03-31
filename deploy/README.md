# Deployment

## Architecture

Single Docker container with built-in Caddy for path-based routing and TLS.

```
Internet → Caddy (inside container, ports 80/443, Let's Encrypt)
  → /mcp*                     → localhost:3333 (MCP server)
  → /.well-known/agent-card   → localhost:3334 (A2A)
  → /a2a                      → localhost:3334 (A2A)
  → /api/*                    → localhost:3335 (API routes)
  → /*                        → localhost:8080 (production site)
  → preview domain            → localhost:4321 (preview site)
```

## Building

```bash
# Build Docker image for an app
deploy/scripts/build-docker-image.sh <app-name> [tag]

# Example
deploy/scripts/build-docker-image.sh mylittlephoney latest
```

Uses `Dockerfile.model` — includes Caddy, runs as non-root via `setcap`.

## Deploying to Hetzner

```bash
bun run brain:deploy <app-name> hetzner deploy
bun run brain:deploy <app-name> hetzner update
bun run brain:deploy <app-name> hetzner status
bun run brain:deploy <app-name> hetzner destroy
```

Requires: `HCLOUD_TOKEN`, Docker registry credentials, Terraform.

See `apps/<app-name>/deploy/.env.production` for runtime secrets.

## Future: Kamal

Instance-based deployment via Kamal is planned. See [deploy-kamal.md](../docs/plans/deploy-kamal.md).

## Directory Structure

```
deploy/
├── docker/
│   ├── Dockerfile.model     # Single-container image with built-in Caddy
│   ├── Caddyfile            # Internal HTTP-only routing (for Kamal/dev)
│   └── package.prod.json    # Runtime native dependencies
├── providers/
│   └── hetzner/             # Hetzner Cloud deployment (Terraform + SSH)
└── scripts/
    ├── build-docker-image.sh
    ├── deploy-brain.sh      # Entry point for bun run brain:deploy
    ├── deploy-docker.sh
    └── lib/                 # Shared script libraries
```
