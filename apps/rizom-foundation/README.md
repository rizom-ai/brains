# rizom.foundation

A deployment instance of the [@brains/relay](../../brains/relay/) brain model — the ideology site for Rizom, now owning its foundation composition from app-local `src/site.ts` over the shared [@brains/site-rizom](../../sites/rizom/) core.

## Status

`rizom.foundation` now owns its final shell + route composition from app-local source in `src/site.ts`, while durable editorial section copy continues to live in tracked `brain-data/site-content/home/*.md` files.

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

## Local site source

`brain.yaml` now omits an explicit `site.package`, so the runtime picks up app-local `src/site.ts`.

That local site source currently does three things:

- injects the `foundation` canvas/plugin config
- owns the foundation shell model (nav/footer/side-nav labels)
- owns the final foundation route composition while reusing the shared Rizom site core

Tracked `site-content` now exists for durable foundation sections such as:

- `ownership`
- `mission`
- `research`
- `events`
- `support`

## Content repo

This instance is now wired for directory-sync against:

- `rizom-ai/rizom-foundation-content`

## Deployment

This instance currently stays in-repo for local content iteration. App-local `src/site.ts` now owns the foundation composition directly over the shared `sites/rizom` core, with `shared/theme-rizom` remaining separate.
