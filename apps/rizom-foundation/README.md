# rizom.foundation

A deployment instance of the [@brains/relay](../../brains/relay/) brain model (using the lean `core` preset) — the ideology site for Rizom, serving the manifesto and (eventually) essays, vision, and community content.

## Status

**Minimal bootstrap.** Currently ships a single homepage containing _The Future of Work is Play_ manifesto. Essays, vision, and community pages will follow once the site needs them.

## Setup

```bash
# From the monorepo root
bun install

# Copy and fill in secrets
cp apps/rizom-foundation/.env.example apps/rizom-foundation/.env

# Start
cd apps/rizom-foundation
bun run dev
```

## Files

| File                          | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `brain.yaml`                  | Instance config (domain, plugin overrides) |
| `.env`                        | Secrets only (API keys, tokens)            |
| `tsconfig.json`               | Required for Bun JSX resolution            |
| `brain-data/HOME.md`          | The manifesto — rendered as the homepage   |
| `brain-data/site-info/`       | Title, description, theme mode             |
| `brain-data/anchor-profile/`  | Rizom organization identity                |
| `brain-data/brain-character/` | Brain persona                              |

## Instance Identity

Identity defaults come from `@brains/ranger` seed content; the files under `brain-data/` override them with rizom.foundation branding. The `HOME.md` base entity drives the homepage via site-ranger's home route.

## Deployment

Deployment lands with [Kamal Phase 2](../../docs/plans/deploy-kamal.md). Until then this instance runs locally for content iteration.
