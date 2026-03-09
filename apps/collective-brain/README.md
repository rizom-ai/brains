# Rizom Collective Brain

A deployment instance of the [@brains/ranger](../../brains/ranger/) brain model — the Rizom collective's community-facing knowledge hub.

## Setup

1. Copy `.env.example` to `.env` and fill in secrets
2. Run `bun run dev` for development

## Files

| File                     | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `brain.yaml`             | Instance config (plugins, permissions, overrides) |
| `.env`                   | Secrets only (API keys, tokens)                   |
| `tsconfig.json`          | Required for Bun JSX resolution                   |
| `deploy/brain.yaml`      | Production config                                 |
| `deploy/.env.production` | Production secrets                                |

## Instance Identity

Identity is defined in the brain-data repo (synced via git-sync), not in config files.
The seed content in `@brains/ranger` provides defaults; the instance overrides them at runtime.
