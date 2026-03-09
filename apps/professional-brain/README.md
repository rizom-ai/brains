# Professional Brain

An instance of the [Rover brain model](../../brains/rover/) for personal knowledge management and professional publishing.

## Setup

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

bun install   # from repo root
bun run dev   # start in dev mode
```

Preview site: http://localhost:4321

## Configuration

- `brain.yaml` — instance config (plugins, overrides, permissions)
- `.env` — secrets (API keys, tokens)
- `deploy/brain.yaml` — production instance config
- `deploy/.env.production` — production secrets

See `.env.example` for available environment variables.
