# rizom.foundation

A deployment instance of the [@brains/relay](../../brains/relay/) brain model — the ideology site for Rizom, following the extracted Rizom app pattern with app-local `src/site.ts`, `src/site-content.ts`, and shared UI from `@rizom/ui`.

## Status

`rizom.foundation` now owns its final shell, route composition, and local section definitions from app-local source in `src/`, while durable editorial section copy continues to live in tracked `brain-data/site-content/home/*.md` files.

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

- injects the `editorial` theme profile via conventional site overrides
- owns the foundation shell model (nav/footer/side-nav labels)
- owns the final foundation route composition

`src/site-content.ts` owns the local section definitions that pair semantic section keys like `hero`, `research`, and `support` with their layouts and editable fields.

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

This instance currently stays in-repo for local content iteration. App-local `src/site.ts` and `src/site-content.ts` now match the extracted `rizom.ai` / `rizom.work` app shape, with `shared/theme-rizom` remaining the shared family theme.
