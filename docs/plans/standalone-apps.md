# Plan: Standalone App Repos

## Context

Apps (`apps/professional-brain`, `apps/mylittlephoney`, etc.) are monorepo workspace packages. They should be standalone repos — each is just brain.yaml + deploy config + secrets. The brain model is the code, the app is the config.

Depends on: published brain model images (deploy-kamal Phase 3).

## Why

- Apps are instances, not code — they don't belong in the code repo
- Aligns with hosted rovers (ranger creates a repo with brain.yaml)
- Aligns with desktop app (Electrobun creates brain.yaml on first run)
- Docker image becomes generic (`ghcr.io/rizom-ai/rover`), brain.yaml is mounted
- Simplifies the monorepo (fewer workspaces, faster installs)

## Two repos per app

Config and content are separate concerns:

- **Config repo** (`yeehaa-brain/`) — brain.yaml, deploy.yml, secrets. Changes rarely.
- **Content repo** (`yeehaa-brain-data/`) — brain-data managed by directory-sync + git. Changes constantly (auto-commits on every entity change).

Keeping them separate avoids noisy auto-commits in the config repo.

### Config repo structure

```
yeehaa-brain/             # config repo
  brain.yaml              # instance config (preset, domain, plugin overrides)
  deploy.yml              # Kamal deploy config
  seed-content/           # initial content (optional, for new instances)
  .env                    # secrets (not committed)
```

No package.json, no node_modules, no build step. The Docker image contains the brain model. brain.yaml configures the instance.

### Versioning

brain.yaml pins the brain model version. deploy.yml derives the image tag from it.

```yaml
# brain.yaml — runs latest (default when version omitted)
brain: "@brains/rover"

# brain.yaml — pinned to specific release
brain: "@brains/rover"
version: "1.2.0"
```

No `version` field = `latest` tag. Explicit version = that tag. Upgrading is a one-line change + `kamal deploy`.

### Content repo structure

```
yeehaa-brain-data/        # content repo (managed by directory-sync)
  note/
  post/
  link/
  ...
```

Mounted as a volume. directory-sync handles import/export/git ops.

## Distribution

Two channels, same brain model, different consumers:

### Docker images (production deploys)

```
ghcr.io/rizom-ai/rover:latest    # rover brain model
ghcr.io/rizom-ai/ranger:latest   # ranger brain model
ghcr.io/rizom-ai/relay:latest    # relay brain model
```

Self-contained — runtime + dependencies + code in one image. Used by Kamal deploys to Hetzner. deploy.yml points to the image, brain.yaml is mounted as a volume.

```yaml
# deploy.yml
service: yeehaa-brain
image: ghcr.io/rizom-ai/rover:latest

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
```

### npm packages (desktop, hosted rovers, development)

```
@brains/rover    # rover brain model
@brains/ranger   # ranger brain model
@brains/relay    # relay brain model
```

Bundled packages — single artifact with all dependencies included. No transitive workspace deps. Used by:

- **Desktop app** — Electrobun bundles the npm package
- **Hosted rovers** — K8s base image has Bun, installs the brain model package
- **Development** — `bun install @brains/rover && bun run start`

**The tough part:** bundling a monorepo workspace with native deps (Sharp, libsql) into a single npm package. Docker sidesteps this (everything is in the container). npm requires solving the bundling problem.

**Approach:** Docker first (Kamal deploys work today), npm second (needed for desktop app and hosted rovers). The Docker image is built FROM the npm package once bundling works.

## Evals

Evals stay in the monorepo — they test brain models and presets, not individual app instances. Standalone app repos don't need eval support.

## Dev mode

During development, the monorepo can still run apps locally via a dev script that loads brain.yaml and starts the brain model from source. No published image or npm package needed.

## Steps

### Phase 1: Docker images + standalone repos

1. CI pipeline: build + publish Docker images to GHCR on release (deploy-kamal Phase 3)
2. Create config repos (yeehaa-brain, rizom-brain, mlp-brain)
3. Move brain.yaml + deploy.yml into each config repo
4. Content repos already exist (or create them) — mounted as volumes
5. Verify: `kamal deploy` from config repo works

### Phase 2: Remove apps from monorepo

1. Delete `apps/` directory
2. Update CI — monorepo builds packages and publishes images, doesn't deploy
3. Deploy happens from config repos via `kamal deploy`

### Phase 3: npm packages (future — needed for desktop + hosted rovers)

1. Solve bundling: brain model + all workspace deps into single package
2. Handle native deps (Sharp, libsql) — platform-specific optional deps or WASM alternatives
3. Publish to npm registry
4. Docker images build FROM npm packages (single source of truth)
5. Desktop app and hosted rovers consume npm packages directly

## Verification

1. Standalone config repos deploy independently from the monorepo
2. Published brain model images run correctly with mounted brain.yaml
3. Content repos mounted correctly, directory-sync operates normally
4. `apps/` directory deleted from monorepo
5. CI builds packages + publishes images only
6. (Phase 3) npm packages install and run with `bun install @brains/rover && bun run start`
