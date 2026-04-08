# Team Brain

Deployment instance of the [`@brains/relay`](../../brains/relay/) brain model.

This directory is a lightweight brain instance package centered on `brain.yaml`. The `brain` CLI from `@rizom/brain` reads `brain.yaml` from the current directory and runs the brain.

## Setup

```bash
# From the monorepo root, once
bun install

# Copy and fill in secrets
cp apps/team-brain/.env.example apps/team-brain/.env

# Start
cd apps/team-brain
bunx brain start
```

## Configuration

- **`brain.yaml`** — Instance config (domain, plugin overrides, anchors/trusted users)
- **`.env`** — Secrets only (API keys, access tokens)

The brain model (capabilities, routes, themes, seed content) lives in [`brains/relay/`](../../brains/relay/).

## Deployment

Production config is in `deploy/`:

- `brain.yaml` — Production overrides (domain, bot userId, ports)
- `.env.production` — Production secrets (gitignored)

Deployment is driven by the brain CLI — see `deploy/scripts/` at the monorepo root.

## File Structure

```
apps/team-brain/
├── brain.yaml          # Instance config
├── .env                # Secrets (gitignored)
├── .env.example        # Secret template
├── deploy/             # Production config
│   └── brain.yaml
├── brain-data/         # Synced content (runtime, gitignored)
├── data/               # SQLite databases (runtime, gitignored)
└── dist/               # Build output (gitignored)
```
