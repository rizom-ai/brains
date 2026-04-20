# Plan: rizom.ai Pilot Extraction

## Status

Proposed.

This plan covers **only** `rizom.ai` as the first apps-only extraction pilot.

## Decision

Use `rizom.ai` as the first extracted Rizom app repo.

Do **not** try to extract all three Rizom apps at once.
Do **not** extract the shared Rizom site/theme layer in this phase.

The goal is to prove that one deployable Rizom app can live outside the monorepo while still consuming the shared Rizom packages that remain in `brains`.

## Why `rizom.ai` first

`rizom.ai` is the lowest-risk pilot because it already has the cleanest validated path:

- the shared `sites/rizom` composition boundary is already in place
- the neutral theme-profile API is already in place
- the preview rebuild flow has already been validated on the running app
- `rizom.ai` has the least app-local theme complexity of the three Rizom apps
- its deploy path is already further along than the other Rizom apps

If `rizom.ai` can be extracted cleanly, the remaining work for `rizom.foundation` and `rizom.work` should become a smaller follow-through instead of a fresh architecture decision.

## Scope

### In scope

- extracting the deployable `rizom.ai` app into its own repo boundary
- making `rizom.ai` consume shared Rizom packages without monorepo-only workspace assumptions
- defining the standalone build, preview rebuild, and deploy workflow for `rizom.ai`
- documenting the exact dependency and release contract required for the extracted app

### Out of scope

- extracting `rizom.foundation`
- extracting `rizom.work`
- extracting `sites/rizom`
- extracting `shared/theme-rizom`
- new visual/theme redesign work
- broad deploy convergence for all Rizom apps in the same change

## Target boundary

### Stays in `brains`

- `sites/rizom`
- `shared/theme-rizom`
- shared framework packages
- shell/runtime internals
- shared deploy/tooling code unless explicitly duplicated for app-local use

### Moves with `rizom.ai`

- `apps/rizom-ai/brain.yaml`
- `apps/rizom-ai/src/`
- `apps/rizom-ai/brain-data/`
- `apps/rizom-ai/config/`
- app-local package metadata and scripts
- app-local deploy workflow/config needed to run the app independently

## Core questions to answer

1. **Shared package consumption**
   - How will the extracted app consume `sites/rizom`, `shared/theme-rizom`, and any other required shared packages?
   - Published package versions, git refs, or another release channel?

2. **Standalone install/build shape**
   - What does `package.json` need in the extracted app repo?
   - Which scripts remain app-local versus framework-provided?

3. **Standalone runtime shape**
   - What exact files must exist for `brain start`, preview rebuilds, and deploys to work outside the monorepo?

4. **Deploy contract**
   - Which workflow/config pieces from the current repo must move into the extracted app repo?
   - Which secrets/env vars are required?

5. **Content and sync contract**
   - How does the extracted app keep its current content-repo linkage and `directory-sync` behavior?

## Workstreams

### 1. Audit `rizom.ai` for monorepo coupling

Identify everything in `apps/rizom-ai` that assumes it lives inside this repo.

Check for:

- workspace-only package resolution
- repo-relative scripts or paths
- imports that depend on unpublished internals
- root-level CI/deploy assumptions
- docs/instructions that only make sense from monorepo root

Deliverable:

- a short list of coupling points grouped into:
  - already safe
  - must be replaced before extraction
  - can stay if a shared package is published first

## Initial audit findings

### Already safe

- `brain.yaml`, `brain-data/`, app-local `src/`, and `config/deploy.yml` already live under `apps/rizom-ai/`
- `tsconfig.json` already extends the published `@rizom/brain/tsconfig.instance.json` entrypoint rather than a repo-local file
- `src/site.ts` already composes from the shared package boundary instead of importing repo-local `sites/rizom` source by relative path
- the runtime rebuild verification flow is already known and validated for `rizom.ai`

### Must change before extraction

#### Boundary fix needed first

The current extraction blocker is a **site/site-content boundary** that has started to be corrected but is not finished yet:

- `@brains/site-rizom` now owns **site logic**
- `apps/rizom-ai` owns **site-content logic** in `src/sections/*`
- dependency publishing decisions should follow that split instead of the old mixed contract

Current `@brains/site-rizom` scope:

- `createRizomSite`
- runtime plugin/config
- base layout
- shared UI primitives and helpers
- explicit content namespace registration (`contentNamespace`)
- no shared ecosystem template/content ownership

Current `rizom.ai` site-content scope:

- `src/sections/*` templates, schemas, formatters, layouts
- `src/templates.ts` content assembly
- local ecosystem template/content helper
- route references under the content namespace `landing-page:*`

After this boundary correction, the publishing/extraction contract is smaller and clearer.

- `apps/rizom-ai/package.json` is still monorepo-oriented:
  - `@rizom/brain` is pinned as `workspace:*`
  - `start` uses `bun run --filter @rizom/brain dev:start`, which assumes the monorepo workspace exists
- `apps/rizom-ai/package.json` does not explicitly declare the shared packages still imported by `src/`
  - `@brains/site-rizom`
  - `@brains/templates`
  - `@brains/utils`
- `apps/rizom-ai/README.md` still assumes monorepo context:
  - repo-root `bun install`
  - `../../` links into monorepo package locations
  - deploy language assumes the current repo-level workflow shape
- the current deploy workflow is root-owned, not app-owned:
  - `.github/workflows/rizom-ai-deploy.yml` lives in `brains`, not under the app repo boundary
- the current deploy workflow uses monorepo-relative build assets and scripts:
  - `bun ../../shell/app/scripts/build.ts`
  - `../../deploy/docker/Dockerfile.prod`
  - `../../deploy/docker/package.prod.json`
  - root-level `bun install --frozen-lockfile`

### Blocked on finishing the boundary cleanup, then shared package publishing

- the extracted app cannot be made standalone until the **site logic vs site-content logic** split is finished cleanly
- only after that split is clear does the publishing/versioning question become well-scoped
- if `@rizom/brain` remains the public CLI/runtime entrypoint, the extracted app still needs compatible published versions of the packages it actually consumes after the boundary cleanup

### Concrete imported shared packages in `apps/rizom-ai/src`

- `@brains/site-rizom`
- `@brains/templates`
- `@brains/utils`

### Current app contract after boundary cleanup

**Site layer imports**

- `@brains/site-rizom`
  - `src/site.ts`
  - `src/routes.ts` (type-only `CreateRizomSiteOptions`)
  - app layout/components that use shared Rizom UI primitives

**Content authoring imports still exposed in app code**

- `@brains/templates`
  - section template declarations in `src/sections/*/index.ts(x)`
  - local ecosystem template in `src/sections/ecosystem.tsx`
- `@brains/utils`
  - section schemas and formatters in `src/sections/*`
  - local ecosystem schema/formatter in `src/sections/ecosystem.tsx`

**Content namespace**

- app-owned landing-page content now registers under `landing-page:*`
- runtime plugin id remains separate (`rizom-site`)

**Site-content plugin usage**

- durable `site-content` is provided through the plugin/runtime layer
- today, Rizom apps get it from the selected brain model preset (`brain: ranger`, `preset: default`)
- `brains/ranger/src/index.ts` includes `site-content` in the `default` preset and capability list
- app `brain.yaml` does **not** need to import or configure `@brains/site-content` directly for normal use
- the extracted app should **not** import `@brains/site-content` directly from app source
- app code provides landing-page templates/routes/content wiring; the plugin handles stored `site-content` entities and operations

### Immediate implication

The first extraction blocker is **not** package publishing by itself. It is the wrong boundary:

- separate **site logic** from **site-content logic**
- stop treating app-local section schema/template/formatter code as part of the site package contract
- keep site-content helpers in the app/content layer rather than the site-runtime API
- then declare the real runtime/build dependencies explicitly
- then stop relying on `workspace:*`
- then replace monorepo-only scripts and deploy assets

### 2. Define the shared dependency contract

List the exact shared packages `rizom.ai` depends on after extraction.

For each dependency, decide:

- package name
- whether it must be published first
- versioning strategy
- pinning strategy for the pilot

#### Current dependency matrix

| Package                | Current role in `rizom.ai`                                                       | Current state     | Pilot status                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `@rizom/brain`         | public CLI/runtime, tsconfig preset                                              | public, versioned | usable now once `workspace:*` is replaced with a real version                                  |
| `@brains/site-rizom`   | site/runtime/UI package plus content-namespace registration (`contentNamespace`) | **private**       | now aligned with the intended site-only boundary                                               |
| `@brains/templates`    | app-local template authoring in `src/sections/*`                                 | **private**       | should not survive as part of the extracted app contract unchanged                             |
| `@brains/utils`        | app-local schema/formatter authoring in `src/sections/*`                         | **private**       | should not survive as part of the extracted app contract unchanged                             |
| `@brains/theme-rizom`  | shared Rizom family theme, consumed indirectly by the site/runtime stack         | **private**       | likely needed in the standalone story even if not directly imported by app `src/`              |
| `@brains/site-content` | plugin/runtime layer for durable `site-content` entities and operations          | **private**       | currently supplied by the `ranger` default preset/runtime, not imported directly by app source |

#### Key constraint

After the boundary cleanup, the remaining problem is no longer that `@brains/site-rizom` is mixed. The remaining problem is that the extracted app contract still exposes low-level **content authoring internals** directly:

- `@brains/templates`
- `@brains/utils`

That contract is still **not extractable as-is** if the goal is a smaller public/app-facing surface.

#### Required order

**Step 1 — keep the corrected boundary**

Keep:

- **site logic** in `@brains/site-rizom`
  - runtime
  - layout shell
  - shared UI
  - route/site composition
- **site-content logic** in the app/content layer
  - templates
  - schemas
  - formatters
  - content helpers
  - content assembly

**Step 2 — reduce the app contract**

Make `rizom.ai` depend only on the layer it should actually own/consume after that split.

**Step 3 — decide publishing/public surface**

Only then decide what needs to be published or exposed publicly for extraction.

#### Recommendation

Do **not** lock the public/extraction contract yet.

First:

1. keep `site-rizom` as **site logic** only
2. keep `rizom.ai` content under the app/content layer and `landing-page:*` namespace
3. decide whether the extraction pilot temporarily accepts direct app-owned `@brains/templates` / `@brains/utils`, or reduces that contract further before extraction

Only after that should the public/export decision be finalized.

#### Immediate pilot contract

Before dry-run extraction, define:

- what the **site layer** for Rizom actually is
- what the **site-content layer** for Rizom actually is
- which of `rizom.ai`'s current imports belong to each layer
- which layer the extracted app should consume directly
- how durable `site-content` is supplied through plugin/preset/runtime without direct app imports
- whether extraction continues to rely on `brain: ranger` / `preset: default`, or needs an explicit equivalent runtime contract
- only then the exact published versions and package names to pin

Deliverable:

- explicit dependency contract for the extracted app, based on the corrected boundary

### 3. Define the standalone app repo shape

Specify the minimum repo contents for extracted `rizom.ai`.

Include:

- `package.json`
- `brain.yaml`
- `src/`
- `brain-data/`
- deploy config/workflow files
- env/secrets expectations

Deliverable:

- a concrete repo shape checklist

### 4. Define the standalone validation workflow

The extracted app must preserve the app-managed rebuild verification flow.

Required validation flow:

1. start app
2. trigger rebuild on the running app via MCP HTTP / `--remote`
3. inspect generated preview output
4. use preview first when configured

Deliverable:

- exact validation commands for the extracted app repo

### 5. Dry-run extraction

Before moving any real repo boundaries, do one dry-run extraction into a temporary directory or temporary repo clone.

Dry-run goals:

- install dependencies
- typecheck
- build
- start app
- trigger preview rebuild
- inspect generated preview output
- identify any remaining repo-coupled assumptions

Deliverable:

- a failure list or a signed-off dry-run

## Pilot checklist

- [x] `rizom.ai` imports are audited for monorepo coupling
- [x] required shared package dependencies are listed explicitly
- [x] site logic vs site-content boundary is made explicit in code
- [x] app-owned content namespace moved to `landing-page:*`
- [ ] shared-package release/pinning strategy is chosen for the pilot
- [x] durable `site-content` plugin/runtime contract is documented without app-level imports
- [ ] extraction choice is made: keep relying on `ranger` default preset vs define an explicit equivalent contract
- [ ] standalone `package.json` shape is defined
- [ ] standalone `brain.yaml` shape is confirmed
- [ ] deploy workflow/config needed by `rizom.ai` is identified
- [ ] env/secrets list is documented
- [ ] content repo linkage is documented
- [ ] dry-run extraction is performed in a temp repo/directory
- [ ] dry-run app can typecheck and build
- [ ] dry-run app can start successfully
- [ ] dry-run app can rebuild preview via `build-site --remote`
- [ ] rebuilt preview output is inspected and correct
- [ ] remaining breakages are documented as follow-up tasks

## Exit criteria

This plan is complete when:

1. `rizom.ai` can run outside the monorepo as its own app repo
2. the extracted app consumes shared Rizom/framework packages without workspace-only assumptions
3. preview rebuild verification still works via the running app
4. deploy-specific files and env expectations are documented for the extracted app
5. the remaining extraction work for `rizom.foundation` and `rizom.work` becomes mechanical follow-through

## Do not do

- do not widen this pilot into an all-app extraction plan
- do not extract shared Rizom packages in the same step
- do not redesign the Rizom theme/runtime again during extraction prep
- do not block the pilot on full parity for `rizom.foundation` and `rizom.work`
- do not replace the validated running-app rebuild workflow with source-only checks

## Related

- `docs/plans/rizom-site-composition.md`
- `docs/plans/rizom-theme-hardening.md`
- `docs/plans/standalone-apps.md`
- `docs/roadmap.md`
