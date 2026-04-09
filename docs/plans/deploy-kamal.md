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
  config/deploy.yml # Kamal config (server IP, domain, secrets)
  .env              # secrets (not committed)
```

Push to the instance repo → CI runs `kamal deploy` → done.

See [standalone-apps.md](./standalone-apps.md) for full instance repo structure.

### Domain per instance

Each brain instance declares its own production hostname in `brain.yaml`. The platform is domain-agnostic — any Cloudflare zone the operator controls works. Rizom's own brains happen to share `rizom.ai` as a parent zone by convention (see "Rizom instance notes" at the bottom), but that's not a platform requirement.

## What Kamal replaces

| Concern       | Current                                      | Kamal                              |
| ------------- | -------------------------------------------- | ---------------------------------- |
| Provisioning  | Terraform                                    | Hetzner API or manual              |
| Deploy        | SSH + rsync + docker-compose up              | `kamal deploy`                     |
| SSL           | Caddy + Let's Encrypt                        | kamal-proxy + Cloudflare Origin CA |
| Zero-downtime | No (compose down/up)                         | Yes (container swap)               |
| Rollback      | Rebuild and redeploy                         | `kamal rollback` (instant)         |
| Config        | Terraform .tf + compose template + Caddyfile | Single `config/deploy.yml`         |

## SSL strategy: Cloudflare Origin CA

Three requirements drive the cert choice and they combine into exactly one answer:

1. **Zero-downtime deploys are a goal of this migration** (see the comparison table above). That forces kamal-proxy to stay — it's what provides the container swap.
2. **kamal-proxy terminates TLS**, it does not SNI-passthrough. So whatever serves TLS to the internet has to be kamal-proxy, not the in-container Caddy.
3. **Cloudflare sits in front with `proxied: true`** (for CDN). Let's Encrypt HTTP-01 challenges get intercepted by Cloudflare's edge and never reach the origin, so kamal-proxy's built-in LE issuance (`ssl: true`) cannot obtain or renew certs.

→ kamal-proxy needs a pre-issued custom cert that Cloudflare's edge trusts in Full (strict) mode. A **Cloudflare Origin CA** certificate fits exactly: 15-year validity, trusted by CF's edge, issued via CF API, no ongoing renewal cycle.

This is a deliberate coupling to Cloudflare-as-the-CDN. If you later swap CDN vendors, this cert becomes useless and TLS has to be re-solved. Accepted because zero-downtime + CDN are both hard requirements and every other path either breaks zero-downtime or creates worse operational burden (LE renewal under a proxy, certbot sidecar with DNS-01, etc.).

The in-container Caddy goes back to its original job: plain HTTP path-based routing from kamal-proxy to internal service ports. No TLS in Caddy. `deploy/docker/Caddyfile` stays as-is.

## Instance config/deploy.yml

```yaml
service: brain
image: ghcr.io/rizom-ai/<%= ENV['BRAIN_MODEL'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>
    options:
      memory: 4g

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM # secret name, resolved from .kamal/secrets
    private_key_pem: PRIVATE_KEY_PEM # secret name, resolved from .kamal/secrets
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>:80
    - preview.<%= ENV['BRAIN_DOMAIN'] %>:81
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: rizom-ai
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
```

The `certificate_pem` and `private_key_pem` values are **secret names**, not file paths. kamal resolves them the same way it resolves `AI_API_KEY` and the other entries under `env.secret` — via `.kamal/secrets` delivered by CI. See "Secrets delivery" below.

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

## Secrets delivery

Every deploy needs the following secrets available on the CI runner, written into `.kamal/secrets` before `kamal deploy` runs:

**Registry:**

- `KAMAL_REGISTRY_PASSWORD` — GHCR pull token.

**App runtime** (referenced in `env.secret` of config/deploy.yml):

- `AI_API_KEY`
- `GIT_SYNC_TOKEN`
- `MCP_AUTH_TOKEN`
- `DISCORD_BOT_TOKEN`

**TLS** (referenced in `proxy.ssl` of config/deploy.yml):

- `CERTIFICATE_PEM` — Cloudflare Origin CA certificate, PEM-encoded.
- `PRIVATE_KEY_PEM` — corresponding private key, PEM-encoded.

**Pipeline-only** (used by CI jobs, not passed to the container):

- `CF_API_TOKEN` — Cloudflare API token with `Zone > DNS > Edit` and `Zone > SSL and Certificates > Edit` on the instance's Cloudflare zone. Used by the DNS job and the one-time bootstrap command.
- `CF_ZONE_ID` — Cloudflare zone ID for the instance's domain.
- `SERVER_IP` — Hetzner VPS IP, either stored or resolved at pipeline start.
- `BRAIN_MODEL` — which brain model image to deploy (e.g. `ranger`, `rover`).
- `BRAIN_DOMAIN` — the production hostname for this instance (e.g. `rizom.ai`, `mybrain.example.com`).

All secrets live in whatever secret store CI uses (GitHub Actions secrets, 1Password, etc.). Nothing in source control.

## One-time bootstrap: `brain cert:bootstrap`

Run once per brain instance, before the first deploy. Issues a 15-year Cloudflare Origin CA certificate, writes it to the instance directory, and sets the zone to Full (strict) SSL mode. The user then pushes the resulting cert + key into whatever secret store their CI uses.

```bash
cd my-brain-instance/
export CF_API_TOKEN=...   # Zone > SSL and Certificates > Edit on the instance's zone
export CF_ZONE_ID=...

brain cert:bootstrap
```

### Behavior

1. Reads the production hostname from `brain.yaml` (no hardcoded domain).
2. Generates a 2048-bit RSA private key and CSR in-process using Bun's native `crypto` module — no `openssl`, `curl`, `jq`, or `gh` required on the user's machine.
3. POSTs the CSR to the Cloudflare Origin CA API with `hostnames: [{BRAIN_DOMAIN}, *.{BRAIN_DOMAIN}]`, `requested_validity: 5475` (15 years), `request_type: "origin-rsa"`.
4. Writes `origin.pem` and `origin.key` to the current directory (both gitignored).
5. Sets the zone's SSL mode to Full (strict) via the Cloudflare settings API.
6. Prints next-step instructions tailored to common secret stores, e.g.:

   ```
   ✓ Certificate issued (valid until 2041-04-09)
   ✓ Zone SSL mode set to Full (strict)

   Push the cert to your secret store. Examples:
     GitHub Actions:   gh secret set CERTIFICATE_PEM < origin.pem
                       gh secret set PRIVATE_KEY_PEM  < origin.key
     1Password:        op document create origin.pem --title "<domain> origin cert"
     Env file:         cat origin.pem origin.key >> .kamal/secrets

   Then delete local copies: rm origin.pem origin.key
   ```

The CLI stays agnostic about _which_ secret store the user picks. That's the right seam — GitHub Actions, GitLab CI, 1Password, env files, and self-hosted runners all exist and we shouldn't pick for the user.

### Implementation

Lives in `packages/brain-cli` as a sibling of the existing `brain init` command. ~100-150 lines of TypeScript: read brain.yaml, generate keypair + CSR via `crypto.generateKeyPairSync` and `crypto.createSign`, `fetch` to the CF API, write files, print instructions. No runtime dependencies beyond what Bun ships with.

### Re-running the command

If an instance later needs additional hostnames (alias domain, extra subdomain), update `brain.yaml` with the new hostnames and re-run `brain cert:bootstrap`. A new cert is issued covering the extended list; the user pushes it to the secret store, and kamal-proxy picks it up on the next deploy.

### Reference: equivalent shell pipeline

For anyone wanting to understand or audit the underlying API calls, here's the same flow as a standalone bash script. The CLI subcommand does exactly this in TypeScript:

```bash
#!/usr/bin/env bash
set -euo pipefail

ZONE="${BRAIN_DOMAIN:?}"
CF_ZONE_ID="${CF_ZONE_ID:?}"
CF_API_TOKEN="${CF_API_TOKEN:?}"

openssl genrsa -out origin.key 2048
openssl req -new -key origin.key -out origin.csr -subj "/CN=${ZONE}"

CSR_ESCAPED=$(jq -Rs . < origin.csr)
curl -sf -X POST "https://api.cloudflare.com/client/v4/certificates" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @- <<EOF | jq -r '.result.certificate' > origin.pem
{
  "hostnames": ["${ZONE}", "*.${ZONE}"],
  "requested_validity": 5475,
  "request_type": "origin-rsa",
  "csr": ${CSR_ESCAPED}
}
EOF

curl -sf -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/ssl" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value": "strict"}' > /dev/null

rm origin.csr
# origin.pem + origin.key are now in cwd; push to secret store and delete.
```

> **Auth caveat:** The Origin CA endpoint historically used an `X-Auth-User-Service-Key` header with a dedicated Origin CA Key rather than scoped API tokens. The current documented path is `Authorization: Bearer` with an API token. If that fails on an older zone, mint an Origin CA Key from the Cloudflare dashboard once and swap the header — same overall shape.

## brain-data volume

The `/opt/brain-data` volume starts empty on a fresh server. On first startup, directory-sync's GitSync clones the content repo (configured via `git.gitUrl` in brain.yaml). If the content repo is also empty, it initializes locally and seed content is copied in. No manual setup needed.

## Instance CI pipeline

The cert is already bootstrapped and stored as secrets (see "One-time bootstrap" above). The pipeline is the same 4 jobs for every deploy, first or nth.

### Phase 1 (manual server)

Server exists (manually created on Hetzner). CI pipeline:

1. **Resolve server IP** — from env var or Hetzner API lookup by label.
2. **Cloudflare DNS** — create/update A records for both `{BRAIN_DOMAIN}` and `preview.{BRAIN_DOMAIN}` → server IP, `proxied: true`. Idempotent, runs before deploy so kamal-proxy's healthcheck can resolve the hostname immediately.
3. **`kamal deploy`** — pre-deploy hook SCPs `brain.yaml`, kamal-proxy pulls cert from secrets, zero-downtime container swap.
4. **Verify** — `curl https://{BRAIN_DOMAIN}/health` through Cloudflare.

### Phase 2+ (auto-provisioning)

CI pipeline provisions the server too:

1. **Provision** — create server via Hetzner API if it doesn't exist (labeled by brain name), wait for SSH, output IP.
2. **Cloudflare DNS** — same as Phase 1 step 2.
3. **`kamal deploy`** — same as Phase 1 step 3.
4. **Verify** — same as Phase 1 step 4.

All automated. Push to instance repo → deployed.

**DNS ordering matters.** kamal-proxy healthchecks the hostnames listed in `proxy.hosts` during deploy; if DNS doesn't resolve yet, the healthcheck fails and the container swap aborts. Always run the DNS job before `kamal deploy`, not after.

## DNS setup

### Zone prerequisites

The instance's domain zone must already exist on Cloudflare before the pipeline runs. This is a one-time setup per zone, not per deploy:

1. Add the domain as a zone on Cloudflare (free plan suffices).
2. Update nameservers at the current registrar to Cloudflare's assigned nameservers.
3. Wait for zone activation.
4. Optional: transfer domain registration to Cloudflare Registrar so one vendor manages both registration and DNS.

Rizom-specific transfer notes for the `rizom.ai` zone are in "Rizom instance notes" below.

### DNS in instance CI

The instance CI pipeline handles DNS as part of deploy:

1. Query Hetzner API for server IP (by brain name label).
2. Create/update two A records via Cloudflare API, both `proxied: true`:
   - `{BRAIN_DOMAIN} → server IP` (production site)
   - `preview.{BRAIN_DOMAIN} → server IP` (preview site — kamal-proxy routes this to container port 81)
3. Idempotent — safe to run every deploy.

### Additional hostnames (optional)

An instance can expose extra hostnames (alias domains, extra subdomains) by:

1. Adding A records for each hostname → same server IP.
2. Adding each hostname to `proxy.hosts` in config/deploy.yml so kamal-proxy routes it.
3. Reissuing the Cloudflare Origin CA cert with the extended `hostnames` list — the new cert replaces the old one in secrets and kamal-proxy picks it up on the next deploy. Re-running `brain cert:bootstrap` after updating brain.yaml handles this.

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

- `{BRAIN_DOMAIN}` → one port
- `preview.{BRAIN_DOMAIN}` → one port

But `{BRAIN_DOMAIN}` needs to serve static files AND `/mcp` AND `/api/*` — three different internal ports. kamal-proxy can't split those.

**Solution: Caddy inside the container.** Caddy moves from external to internal — same job, just inside the container now. kamal-proxy handles SSL termination (with a Cloudflare Origin CA cert loaded from secrets — see "SSL strategy" above) and host-based routing. Caddy handles path-based routing to internal services, plain HTTP only.

```
Internet → Cloudflare (proxied, CDN)
  → kamal-proxy (TLS terminate with Origin CA cert, host routing)
    → {BRAIN_DOMAIN}         → container:80 → Caddy → 8080 (static), 3333 (/mcp), 3334 (/a2a), 3335 (/api/*)
    → preview.{BRAIN_DOMAIN} → container:81 → Caddy → 4321 (preview static)
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

Verified working on the pre-Kamal infra. There, the in-container Caddy terminated TLS via Let's Encrypt directly and the Hetzner deploy scripts (`deploy-app.sh`) mounted a domain-specific Caddyfile at runtime.

**In the Kamal target, TLS termination moves to kamal-proxy** (see "SSL strategy"), and Caddy reverts to plain HTTP path routing inside the container. The `deploy/docker/Caddyfile` already reflects this — its header comment reads: _"kamal-proxy handles SSL + host routing externally. This Caddy runs inside the container, no TLS."_

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

1. Cloudflare zone active for the instance's domain (see "DNS setup → Zone prerequisites")
2. Health endpoint (✅ done)

### Phase 1: Publish brain model images

1. `generateModelEntrypoint` (✅ done) + `build-model.ts` script (✅ done)
2. `Dockerfile.model` — includes Caddy for internal routing, entrypoint reads brain.yaml at runtime
3. CI pipeline in monorepo: build + publish Docker images to GHCR on push to main
4. Tag with git sha + `latest`
5. One image per brain model: `ghcr.io/rizom-ai/rover`, `ranger`, `relay`

### Phase 2: First standalone instance

Depends on: [`@rizom/brain`](./npm-packages.md) (`brain init`, `brain cert:bootstrap`).

1. `brain init <dir> --deploy --model <model>` — scaffolds instance repo with brain.yaml, config/deploy.yml, CI pipeline.
2. `brain cert:bootstrap` — issues the Cloudflare Origin CA cert for the domain declared in brain.yaml, writes `origin.pem` + `origin.key` locally. See "One-time bootstrap" above.
3. Push cert + key into the instance's secret store as `CERTIFICATE_PEM` / `PRIVATE_KEY_PEM`.
4. Push to GitHub → CI provisions server, sets DNS (proxied), deploys.
5. Verify: `https://{BRAIN_DOMAIN}` serves the brain.

### Phase 3: Migrate remaining instances

Old infra keeps running in parallel throughout. No cutover risk.

1. Repeat Phase 2 steps 1-5 for each additional brain instance, using that instance's own domain.
2. For each migrated instance, verify the new deployment is healthy before decommissioning the old one.
3. Once all instances are migrated, delete `apps/` from the monorepo.

Rizom's own instance list (rover, ranger, relay, mlp) and their domains are in "Rizom instance notes" below.

## Verification

1. Push to monorepo → images published to GHCR.
2. Push to instance repo → brain deployed automatically.
3. `https://{BRAIN_DOMAIN}` accessible with SSL (browser shows Cloudflare edge cert; origin is behind CF proxied).
4. Additional hostnames (if configured) work alongside the primary domain.
5. `kamal rollback` works from instance repo.
6. No deploy config in monorepo.

## Rizom instance notes

Everything above describes the platform — domain-agnostic, works for any Cloudflare zone the operator controls. This section captures the specifics of rizom's own brain instances.

### Product model: custom domains only

Rizom ships the platform as tooling, not as a hosted service. Every instance — rizom's own and any external user's — brings its own domain and its own Cloudflare zone. Rizom does **not** offer `{name}.rizom.ai` subdomains as a sign-up product.

Rationale: offering shared subdomains turns rizom into a hosting provider with attendant support, abuse, scaling, and eventually billing obligations. It also contradicts the Personal Brain sovereignty pitch (_"own your data but rent your URL from us"_ is an awkward mismatch), and creates migration pain if users later want their own URL — SEO, inbound links, and integrations all break on the move. Self-hosting with `brain init` + `brain cert:bootstrap` is the universal path; if a hosted onboarding experience later becomes warranted, it can be added as an additive `brain cloud` product that reuses the same tooling underneath.

### `rizom.ai` zone transfer

`rizom.ai` is registered at MijnDomein. One-time transfer to Cloudflare Registrar:

1. Add `rizom.ai` as a zone on Cloudflare (free plan).
2. Update nameservers at MijnDomein to Cloudflare's assigned nameservers.
3. Wait for zone activation.
4. Transfer domain registration to Cloudflare Registrar.
5. Cloudflare then manages both registration and DNS.

### Rizom's own brain instances

Each rizom-operated brain is a separate instance repo, each with its own domain. Current list:

| Instance | Model                 | Domain     |
| -------- | --------------------- | ---------- |
| rizom-ai | `ai` / ranger variant | `rizom.ai` |
| rover    | `rover`               | TBD        |
| ranger   | `ranger`              | TBD        |
| relay    | `relay`               | TBD        |
| mlp      | `mlp`                 | TBD        |

Each of these runs through the generic platform flow (Phase 2 steps 1-5). They share rizom's Cloudflare account, but each has its own zone or hostname and its own Origin CA cert.
