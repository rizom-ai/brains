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

rizom.ai deploys through the Hetzner + Kamal workflow in this repo. See [`docs/plans/rizom-sites.md`](../../docs/plans/rizom-sites.md) for the broader site phasing.

### First-time 1Password setup

If you use the default 1Password backend, do this once per instance:

1. Create a vault such as `brain-rizom-ai-prod`.
2. Create a 1Password service account with access only to that vault.
3. Store the service account token in GitHub as `OP_TOKEN`.
4. Run `brain secrets:push --push-to 1password` with the runtime and deploy secrets set locally. Use `brain secrets:push --dry-run` first if you want to preview the upload.
5. Run `brain cert:bootstrap --push-to 1password` with `CF_API_TOKEN` and `CF_ZONE_ID` set locally.
6. Delete the local cert files.

After that, the workflow loads everything else from the vault; GitHub should only need `OP_TOKEN`.
