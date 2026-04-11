# yeehaa.io

An instance of the [Rover brain model](../../brains/rover/) for personal knowledge management and publishing.

## Setup

```bash
cp .env.example .env
# Edit .env and add your AI_API_KEY

bun install        # from repo root, once
bunx brain start   # from this directory
```

Preview site: http://localhost:4321

This directory is a lightweight brain instance package centered on `brain.yaml`. The `brain` CLI from `@rizom/brain` reads `brain.yaml` from the current directory and runs the brain.

## Configuration

- `brain.yaml` — instance config (plugins, overrides, permissions)
- `.env` — secrets (API keys, tokens)
- `deploy/brain.yaml` — production instance config
- `deploy/.env.production` — production secrets

See `.env.example` for available environment variables.
