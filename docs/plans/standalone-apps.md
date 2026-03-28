# Plan: Standalone App Repos

## Context

Apps (`apps/professional-brain`, `apps/mylittlephoney`, etc.) are monorepo workspace packages. They should be standalone repos — each is just brain.yaml + seed-content + secrets. The brain model is the code, the app is the config.

Depends on: published brain model images (deploy-kamal Phase 3).

## Why

- Apps are instances, not code — they don't belong in the code repo
- Aligns with hosted rovers (ranger creates a repo with brain.yaml)
- Aligns with desktop app (Electrobun creates brain.yaml on first run)
- Docker image becomes generic (`ghcr.io/rizom-ai/rover`), brain.yaml is mounted
- Simplifies the monorepo (fewer workspaces, faster installs)

## Standalone app repo structure

```
yeehaa-brain/             # standalone repo
  brain.yaml              # instance config (preset, domain, plugin overrides)
  brain.eval.yaml         # eval config (optional)
  deploy.yml              # Kamal deploy config
  test-cases/             # instance-specific eval test cases (optional)
  seed-content/           # initial content (optional, for new instances)
  brain-data/             # content (managed by directory-sync + git)
  .env                    # secrets (not committed)
```

No package.json, no node_modules, no build step. The Docker image contains the brain model. brain.yaml configures the instance.

## Docker image

One published image per brain model:

```
ghcr.io/rizom-ai/rover:latest    # rover brain model
ghcr.io/rizom-ai/ranger:latest   # ranger brain model
ghcr.io/rizom-ai/relay:latest    # relay brain model
```

The deploy.yml points to the image. brain.yaml is mounted as a volume. Secrets via env vars.

```yaml
# deploy.yml
service: yeehaa-brain
image: ghcr.io/rizom-ai/rover:latest

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
```

## Dev mode

During development, the monorepo can still run apps locally via a dev script that loads brain.yaml and starts the brain model from source. No published image needed.

## Steps

### Phase 1: Create standalone repos

1. Create standalone repos (yeehaa-brain, rizom-brain, mlp-brain)
2. Move brain.yaml + deploy.yml + test-cases into each repo
3. Update deploy.yml to reference published image
4. Merge brain-data content repos into app repos (or keep separate)
5. Verify: `kamal deploy` from standalone repo works

### Phase 2: Remove apps from monorepo

1. Delete `apps/` directory
2. Update CI — monorepo builds packages and publishes images, doesn't deploy
3. Deploy happens from app repos via `kamal deploy`
4. Update eval runner to work from standalone repos

## Verification

1. Standalone app repos deploy independently from the monorepo
2. Published brain model images run correctly with mounted brain.yaml
3. Eval runner works from standalone repos
4. `apps/` directory deleted from monorepo
5. CI builds packages + publishes images only
