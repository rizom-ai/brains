# rizom.foundation

A deployment instance of the [@brains/relay](../../brains/relay/) brain model — the ideology site for Rizom, serving the manifesto and the first app-owned foundation composition over shared Rizom base primitives.

## Status

**Composition seam in progress.** This app now points at a thin `@brains/site-rizom-foundation` wrapper so foundation-specific site structure can diverge from the shared `rizom.ai` baseline without growing more `variant` conditionals inside one final site package.

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

## Site package

`brain.yaml` now points at `@brains/site-rizom-foundation`, a thin site-package wrapper over `@brains/site-rizom`.

That wrapper currently does three things:

- injects the `foundation` canvas/plugin config
- owns the foundation shell model (nav/footer/side-nav labels)
- adds the first foundation-only section seams (`pull-quote`, `research`) while reusing the shared Rizom base site

## Deployment

This instance currently stays in-repo for local content iteration. When deployment ownership moves out of the monorepo, it should follow the standard standalone app shape.
