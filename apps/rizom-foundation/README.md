# rizom.foundation

A deployment instance of the [@brains/relay](../../brains/relay/) brain model (using the lean `core` preset) — the ideology site for Rizom, serving the manifesto and (eventually) essays, vision, and community content.

## Status

**Minimal bootstrap.** Currently ships a single homepage containing _The Future of Work is Play_ manifesto. Essays, vision, and community pages will follow once the site needs them.

## Setup

This directory is a lightweight brain instance package — centered on `brain.yaml`, with conventional support files like `package.json`, `tsconfig.json`, `.env.example`, and optional deploy artifacts. The `brain` CLI from `@rizom/brain` reads `brain.yaml` from the current directory and runs the brain.

```bash
# From the monorepo root, once
bun install

# Copy and fill in secrets
cp apps/rizom-foundation/.env.example apps/rizom-foundation/.env

# Start
cd apps/rizom-foundation
bunx brain start
```

## Files

| File                          | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `brain.yaml`                  | Instance config (domain, plugin overrides) |
| `.env`                        | Secrets only (API keys, tokens)            |
| `brain-data/HOME.md`          | The manifesto — rendered as the homepage   |
| `brain-data/site-info/`       | Title, description, theme mode             |
| `brain-data/anchor-profile/`  | Rizom organization identity                |
| `brain-data/brain-character/` | Brain persona                              |

## Instance Identity

Identity defaults come from `@brains/ranger` seed content; the files under `brain-data/` override them with rizom.foundation branding. The `HOME.md` base entity drives the homepage via site-ranger's home route.

## Deployment

This instance currently stays in-repo for local content iteration. When deployment ownership moves out of the monorepo, it should follow the standard standalone app shape.
