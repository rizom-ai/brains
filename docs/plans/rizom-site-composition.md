# Plan: Rizom Site Composition and Extraction

## Decision

The next extraction target is **one separate Rizom monorepo named `rizom-sites`**.

Do **not**:

- reintroduce a shared `sites/rizom` pseudo-site
- force the Rizom shared packages to become public framework packages yet
- split immediately into three separate app repos

Instead:

- keep the current wrapper-owned site composition model
- keep the current shared Rizom package split
- move the whole Rizom site family out together into `rizom-sites`

## Why this is the target

The current architecture is already clean enough for extraction inside the monorepo:

- `@brains/site-rizom-ai` owns `rizom.ai`
- `@brains/site-rizom-foundation` owns `rizom.foundation`
- `@brains/site-rizom-work` owns `rizom.work`
- the old shared `sites/rizom` package is gone
- shared Rizom code already lives in dedicated shared packages

The remaining problem is **repo boundary**, not site ownership.

If each app were extracted to its own repo right now, we would have to choose between:

- publishing all Rizom shared packages individually, or
- inventing a new public façade just for extraction, or
- copying shared Rizom code into each app repo

A dedicated Rizom monorepo avoids all three.

## Repository split

### `brains` stays responsible for

- `@rizom/brain`
- generic framework/runtime/CLI code
- generic site system
- generic themes and generic UI layers
- model definitions like `ranger` and `relay`

### `rizom-sites` will own

- `apps/rizom-ai`
- `apps/rizom-foundation`
- `apps/rizom-work`
- `@brains/site-rizom-ai`
- `@brains/site-rizom-foundation`
- `@brains/site-rizom-work`
- `@brains/rizom-ui`
- `@brains/rizom-runtime`
- `@brains/rizom-ecosystem`
- `@brains/theme-rizom`
- Rizom app-local content repos / deploy wiring / app docs

## Package layering

This is the intended layering and should remain true after extraction:

- `@brains/ui-library` = generic shared UI
- `@brains/rizom-ui` = Rizom-specific shared UI
- `@brains/rizom-runtime` = Rizom-specific runtime/plugin/canvas layer
- `@brains/rizom-ecosystem` = shared family-owned ecosystem section
- `@brains/theme-rizom` = shared Rizom theme
- `@brains/site-rizom-*` = thin final assembly layer for each real site

The site wrappers stay thin and explicit. They are not a mistake; they are the final composition owners.

## Current state

Already done:

- wrappers own final routes, templates, and layout composition
- durable content lives in tracked `brain-data/site-content`
- all three apps are repo-backed via `directory-sync`
- shared Rizom code is split into:
  - `shared/rizom-ui`
  - `shared/rizom-runtime`
  - `shared/rizom-ecosystem`
  - `shared/theme-rizom`
- `sites/rizom` / `@brains/site-rizom` has been removed

So the current monorepo work is no longer about ownership cleanup. It is about preparing a clean repo move.

## Extraction plan

### Step 1 — freeze the architecture shape

Before moving repos, keep these rules fixed:

- wrappers remain the real site owners
- shared Rizom packages remain separate packages
- do not collapse back into one base-site package
- do not force app-local `src/site.ts` yet unless the new repo actually needs it

Exit criteria:

- no further architectural churn inside the current Rizom package split

### Step 2 — define the `rizom-sites` workspace shape

Create the target layout for the new repo:

- `apps/rizom-ai`
- `apps/rizom-foundation`
- `apps/rizom-work`
- `packages/site-rizom-ai`
- `packages/site-rizom-foundation`
- `packages/site-rizom-work`
- `packages/rizom-ui`
- `packages/rizom-runtime`
- `packages/rizom-ecosystem`
- `packages/theme-rizom`

Naming inside that repo can be adjusted later, but the ownership grouping should stay the same.

Exit criteria:

- target repo structure is explicit and documented before file moves start

### Step 3 — move the Rizom family together

Move the Rizom apps and Rizom shared packages out together.

Move together:

- the three app directories
- the three Rizom site wrapper packages
- the Rizom shared packages
- any Rizom-specific docs that must stay with the app family

Do not move:

- generic framework code
- generic site system code
- generic UI library code
- generic CLI/framework docs unless they need updated links

Exit criteria:

- `rizom-sites` can install and boot all three apps against published/shared framework deps

### Step 4 — repoint the remaining framework references

After the move, clean up the `brains` repo so it no longer pretends to own Rizom app-family code.

That includes:

- docs links
- codebase maps / roadmap references
- any tests that still assume Rizom site packages live here
- package/workspace declarations

Exit criteria:

- the framework repo has no live source ownership of the Rizom app family

### Step 5 — decide later whether app-local site files are worth it

Only after `rizom-sites` exists should we decide whether to keep:

- `packages/site-rizom-ai` style wrappers

or move further to:

- `apps/rizom-ai/src/site.ts`

That is a second-stage decision, not the immediate extraction step.

Exit criteria:

- repo extraction is complete before any additional composition-locality refactor

## What not to do next

Do not spend the next cycle on:

- publishing all Rizom shared packages individually
- inventing a new public façade layer just to escape this repo
- splitting directly into three separate app repos
- reworking themes into a new abstraction system
- content/CTA/product polish as part of the extraction plan

## Verification

This plan is successful when:

1. `rizom-sites` contains the whole Rizom site family
2. the existing wrapper/shared-package boundaries survive the move intact
3. `brains` no longer owns Rizom app-family source packages
4. all three apps still boot and typecheck in the new repo
5. no monolithic shared base-site package is reintroduced

## Related

- `docs/plans/rizom-site-tbd.md`
- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
