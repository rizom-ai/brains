# rizom.ai

A deployment instance of the [@brains/ranger](../../brains/ranger/) brain model with the [@brains/site-rizom-ai](../../sites/rizom-ai/) wrapper package — the product landing page for the Rizom collective.

## Status

`rizom.ai` now has its own thin site wrapper package over the shared Rizom base, and now explicitly owns its final route tree rather than inheriting the shared Rizom baseline as its effective final composition. Foundation and work use the same wrapper pattern, which makes later extraction and site-specific composition changes cheaper.

## Setup

This directory is a lightweight brain instance package — centered on `brain.yaml`, with conventional support files like `package.json`, `tsconfig.json`, `.env.example`, `.envrc`, and optional deploy artifacts. The `brain` CLI from `@rizom/brain` reads `brain.yaml` from the current directory and runs the brain.

```bash
# From the monorepo root, once
bun install

# Copy and fill in app/deploy secrets
cp apps/rizom-ai/.env.example apps/rizom-ai/.env

# Optional: keep bootstrap secrets in a local-only shell file for direnv
touch apps/rizom-ai/.env.local
# Add OP_SERVICE_ACCOUNT_TOKEN / KAMAL_SSH_PRIVATE_KEY exports to apps/rizom-ai/.env.local if you use 1Password

# Start
cd apps/rizom-ai
direnv allow
bunx brain start
```

## Files

| File            | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `brain.yaml`    | Instance config (brain, preset, domain, site variant) |
| `.env`          | Secrets only (API keys, tokens)                       |
| `.env.local`    | Local-only bootstrap secrets for direnv               |
| `.envrc`        | Loads `.env` and sources `.env.local` for the shell   |
| `tsconfig.json` | Bun JSX runtime resolution for Preact site components |

## Site package

`brain.yaml` now selects `@brains/site-rizom-ai`:

```yaml
site:
  package: "@brains/site-rizom-ai"
```

That wrapper still composes the shared `@brains/site-rizom` base underneath. The shared base still provides the common Rizom family runtime, while the thin wrapper owns the final `rizom.ai` shell and route composition seam.

Across the Rizom family, the variant still determines:

- **Background canvas**: `tree` (ai), `roots` (foundation), `constellation` (work)
- **Accent shade**: amber-light `#FFA366` (ai), amber-dark `#C45A08` (foundation), amber `#E87722` (work)
- **Hero copy register**: per-variant defaults baked into the site plugin

Light mode collapses all variants to amber-dark for contrast (per brand guide A2).

## Deployment

rizom.ai deploys through this repo's current workflow. Shared Rizom architecture now lives in `sites/rizom` + `shared/theme-rizom`, with `sites/rizom-ai` acting as the app-owned composition wrapper.

### First-time 1Password setup

If you use the default 1Password backend, do this once per instance:

1. Create a vault such as `brain-rizom-ai-prod`.
2. Create a 1Password service account with access only to that vault.
3. Store the service account token in GitHub as `OP_TOKEN` (use `OP_SERVICE_ACCOUNT_TOKEN` locally).
4. Run `brain secrets:push --push-to 1password` with the runtime and deploy secrets set locally. Use `brain secrets:push --dry-run` first if you want to preview the upload.
5. Run `brain cert:bootstrap --push-to 1password` with `CF_API_TOKEN` and `CF_ZONE_ID` set locally.
6. Delete the local cert files.

After that, the workflow loads everything else from the vault; GitHub should only need `OP_TOKEN`, while local shells can use `OP_SERVICE_ACCOUNT_TOKEN`.
