# Team Brain

Deployment instance of the [`@brains/team`](../../brains/team/) brain model.

## Setup

```bash
# From the monorepo root
bun install

# Copy and fill in secrets
cp apps/team-brain/.env.example apps/team-brain/.env

# Start
cd apps/team-brain
bun run dev
```

## Configuration

- **`brain.yaml`** — Instance config (domain, plugin overrides, anchors/trusted users)
- **`.env`** — Secrets only (API keys, access tokens)
- **`tsconfig.json`** — Required for Bun JSX resolution (do not remove)

The brain model (capabilities, routes, themes, seed content) lives in [`brains/team/`](../../brains/team/).

## Deployment

Production config is in `deploy/`:

- `brain.yaml` — Production overrides (domain, bot userId, ports)
- `.env.production` — Production secrets (gitignored)
- `personal-brain.service` — Systemd unit file

Build and deploy:

```bash
bun run build        # Bundle to dist/
bun run start:prod   # Run the bundle
```

## File Structure

```
apps/team-brain/
├── brain.yaml          # Instance config
├── .env                # Secrets (gitignored)
├── .env.example        # Secret template
├── package.json        # Workspace + scripts
├── tsconfig.json       # JSX resolution
├── deploy/             # Production config
│   ├── brain.yaml
│   └── personal-brain.service
├── brain-data/         # Synced content (runtime, gitignored)
├── data/               # SQLite databases (runtime, gitignored)
└── dist/               # Build output (gitignored)
```
