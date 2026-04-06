# Professional Brain

An instance of the [Rover brain model](../../brains/rover/) for personal knowledge management and professional publishing.

## Setup

```bash
cp .env.example .env
# Edit .env and add your AI_API_KEY

bun install        # from repo root, once
bunx brain start   # from this directory
```

Preview site: http://localhost:4321

This directory is a config-only brain instance — no `package.json`, no source code. The `brain` CLI from `@rizom/brain` reads `brain.yaml` from the current directory and runs the brain.

## Configuration

- `brain.yaml` — instance config (plugins, overrides, permissions)
- `.env` — secrets (API keys, tokens)
- `deploy/brain.yaml` — production instance config
- `deploy/.env.production` — production secrets

See `.env.example` for available environment variables.
