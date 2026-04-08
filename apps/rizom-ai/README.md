# rizom.ai

A deployment instance of the [@brains/ranger](../../brains/ranger/) brain model with the [@brains/site-rizom](../../sites/rizom/) site package (variant: `ai`) — the product landing page for the Rizom collective.

## Status

**MVP target.** First instance to wire up the new `@brains/site-rizom` package. Currently renders the hero section with the `tree` background canvas and amber-light accent. More sections (problem, answer, products, ownership, quickstart, mission, ecosystem) land as `sites/rizom/` grows.

## Setup

This directory is a lightweight brain instance package — centered on `brain.yaml`, with conventional support files like `package.json`, `tsconfig.json`, `.env.example`, and optional deploy artifacts. The `brain` CLI from `@rizom/brain` reads `brain.yaml` from the current directory and runs the brain.

```bash
# From the monorepo root, once
bun install

# Copy and fill in secrets
cp apps/rizom-ai/.env.example apps/rizom-ai/.env

# Start
cd apps/rizom-ai
bunx brain start
```

## Files

| File            | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `brain.yaml`    | Instance config (brain, preset, domain, site variant) |
| `.env`          | Secrets only (API keys, tokens)                       |
| `tsconfig.json` | Bun JSX runtime resolution for Preact site components |

## Site variant

`brain.yaml` selects the `ai` variant of `@brains/site-rizom`:

```yaml
site:
  package: "@brains/site-rizom"
  variant: ai
```

The same package serves rizom.foundation (variant: `foundation`) and rizom.work (variant: `work`). The variant determines:

- **Background canvas**: `tree` (ai), `roots` (foundation), `constellation` (work)
- **Accent shade**: amber-light `#FFA366` (ai), amber-dark `#C45A08` (foundation), amber `#E87722` (work)
- **Hero copy register**: per-variant defaults baked into the site plugin

Light mode collapses all variants to amber-dark for contrast (per brand guide A2).

## Deployment

rizom.ai deploys on the existing Hetzner / Docker infrastructure (no Kamal dependency on the critical path). See [`docs/plans/rizom-sites.md`](../../docs/plans/rizom-sites.md) for the full phasing.
