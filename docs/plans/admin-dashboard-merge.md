# Plan: Keep dashboard separate, remove the hydration pipeline

> This plan supersedes the earlier "merge dashboard into admin" direction. The repo should solve the real problems — route shadowing and dead hydration infrastructure — without collapsing `@brains/dashboard` into `@brains/admin`.

## Context

Two real problems exist, but they do **not** require a package merge.

**Problem 1 — route shadowing.** `plugins/dashboard` currently registers both:

- a direct plugin web route (`/dashboard` or `/` depending on resolver defaults) via `getWebRoutes()` returning static HTML from `dashboard-page.tsx`, and
- a site-builder route/template that emits prerendered `/dashboard/index.html`

The webserver mounts plugin web routes before falling through to static serving (`interfaces/webserver/src/server-manager.ts`), so on brains that include site-builder the direct web route wins. That means the site-builder-produced dashboard output is shadowed.

**Problem 2 — unused hydration infrastructure.** The site-builder hydration pipeline (compile `hydration.tsx` → `hydration.compiled.js`, inject Preact runtime, emit per-template hydration scripts) has exactly one consumer in the repo: `plugins/dashboard/src/templates/dashboard/hydration.tsx`. Dashboard's own layout says "currently no client-side interactivity needed," and no other plugin declares hydrated templates. `docs/plans/memory-reduction.md` also calls out the hydration bundle as startup-memory bloat.

**Architectural conclusion.** The bug is caused by dashboard being exposed through **two delivery paths**. The waste is caused by preserving a hydration system that no longer has meaningful users. The smallest correct fix is therefore:

- keep dashboard as its own operator plugin
- remove the site-builder dashboard template path
- remove hydration support entirely

That direction also aligns with `docs/plans/cms-on-core.md`, which explicitly says to reuse `plugins/dashboard` and not build a second dashboard inside `plugins/admin`.

## Goal

Keep the current package split:

- `@brains/dashboard` owns the widgets dashboard
- `@brains/admin` owns the CMS shell

But remove the duplicate site-builder dashboard path and delete the hydration pipeline across the monorepo.

End result:

- Dashboard is served **only** from `@brains/dashboard`'s plugin web route.
- CMS is served from `@brains/admin`.
- No site-builder dashboard template exists.
- No `hydration.tsx`, `hydration.compiled.js`, `HydrationManager`, or template `interactive` field remains.
- Public-site SSR in site-builder stays intact; only client-side hydration support is removed.

## Non-goals

- Merging `@brains/dashboard` into `@brains/admin`
- Changing widget-registration topic names (`dashboard:register-widget`, `dashboard:unregister-widget` stay unchanged)
- Adding a shared admin/dashboard chrome
- Moving dashboard from its current route policy to `/admin`
- Changing the dashboard's rendered output beyond what naturally follows from removing the dead template path
- Changing Sveltia CMS behavior
- Reworking operator auth

## End state

- `@brains/dashboard` remains a standalone plugin and continues to own:
  - widget registry
  - system widgets
  - dashboard datasource
  - dashboard HTML page
- `@brains/admin` remains a standalone plugin and continues to own:
  - CMS shell at `/cms`
- Dashboard route policy stays:
  - **core / headless brains:** dashboard at `/`
  - **site presets:** dashboard at `/dashboard`
- CMS route policy stays:
  - `/cms`
- Dashboard no longer registers a site-builder template or a site-builder route.
- Site-builder no longer contains hydration infrastructure.
- No package in the repo imports from `hydration.compiled.js` or ships a `precompile` script for hydration.

## Scope

### Dashboard plugin — keep, simplify

`plugins/dashboard/` stays in the repo.

**Keep:**

- `dashboard-page.tsx`
- `dashboard-datasource.ts`
- `widget-registry.ts`
- `system-widgets.ts`
- message subscriptions for:
  - `dashboard:register-widget`
  - `dashboard:unregister-widget`
- direct web route via `getWebRoutes()`

**Remove from `plugins/dashboard/src/plugin.ts`:**

- template registration (`context.templates.register({ dashboard: ... })`)
- site-builder route registration via `plugin:site-builder:route:register`

**Source cleanup:**

- Move the schema currently living at `plugins/dashboard/src/templates/dashboard/schema.ts` to a non-template location such as `plugins/dashboard/src/widget-schema.ts`.
- Update `dashboard-page.tsx`, `dashboard-datasource.ts`, `src/index.ts`, and tests to import from the new schema location.
- Delete the rest of `plugins/dashboard/src/templates/dashboard/` after the move.

This leaves dashboard with one clear runtime model: a service plugin that renders static HTML directly from its own web route.

### Admin plugin — unchanged in responsibility

`plugins/admin/` should **not** absorb dashboard code.

Keep admin focused on CMS:

- continue serving the Sveltia shell
- continue generating CMS config YAML
- continue using `/cms`

No dashboard widgets route is added to admin. No shared admin/dashboard chrome is introduced in this pass.

### Route policy — keep existing behavior

Keep the current resolver-driven path policy in `shell/app/src/brain-resolver.ts`:

- dashboard defaults to `/` without site-builder
- dashboard defaults to `/dashboard` with site-builder
- admin defaults to `/cms` when dashboard or site-builder is present

That policy already matches the intended product surface and does not need redesign for this fix.

### Hydration pipeline — delete

**Core files to remove:**

- `scripts/compile-hydration.ts`
- `shell/app/scripts/precompile.ts`
- `plugins/site-builder/src/hydration/hydration-manager.ts`
- the now-empty `plugins/site-builder/src/hydration/` directory

**Template system changes:**

Remove the `interactive` field from template/view types and associated plumbing:

- `shell/templates/src/types.ts`
- `shell/templates/src/render-types.ts`
- `shell/templates/src/render-service.ts`
- `shell/templates/test/capabilities.test.ts`

**Site-builder changes:**

Delete hydration handling from:

- `plugins/site-builder/src/lib/preact-builder.ts`

Specifically remove:

- `HydrationManager` import
- `HydrationManager` instantiation
- route post-processing for interactive templates
- HTML mutation that injects hydration assets/data scripts

**Dashboard template files to delete:**

- `plugins/dashboard/src/templates/dashboard/index.ts`
- `plugins/dashboard/src/templates/dashboard/layout.tsx`
- `plugins/dashboard/src/templates/dashboard/formatter.ts`
- `plugins/dashboard/src/templates/dashboard/hydration.tsx`

After the schema move, nothing in `templates/dashboard/` should remain.

### Build wiring — delete hydration compile support

Remove hydration compile plumbing from:

- `packages/brain-cli/scripts/build.ts`
- `turbo.json`
- root `package.json`
- `shell/app/package.json`
- `.gitignore`

Concretely:

- remove the `precompile` task
- remove `brain-precompile`
- remove `hydration.compiled.js` ignore rules
- remove any build comments or docs referring to hydration compilation

### Package/dependency cleanup

Because dashboard no longer ships Preact templates, remove dead dashboard-only deps from `plugins/dashboard/package.json` if they are no longer used:

- `preact`
- `preact-render-to-string`
- `@brains/ui-library`
- the dashboard `precompile` script

Do **not** remove `@brains/dashboard` from brain packages or presets. The package stays and brains should continue to wire it normally.

### Tests to update

Update or delete tests that assume hydration exists:

- `plugins/site-builder/test/unit/hydration-compilation.test.ts`
- any dashboard tests importing schema from `templates/dashboard/schema`
- `shell/templates/test/capabilities.test.ts` cases covering `interactive`

Keep resolver tests around dashboard/admin route defaults in:

- `shell/app/test/instance-overrides.test.ts`

Those route defaults are still valid under this plan.

## Plan doc updates

- `docs/plans/memory-reduction.md` — remove hydration-specific sections that are now being fully deleted rather than optimized
- `docs/plans/unify-build-pipeline.md` — remove references to `compile-hydration.ts`

## Documentation

Write `docs/hydration-pattern.md` before deleting the implementation.

Capture:

- file conventions (`hydration.tsx`, `hydration.compiled.js`)
- compile step behavior
- runtime contract (`window.preact`, hydration data-script shape)
- template `interactive` field
- site-builder injection mechanism
- reasons the pattern was removed
- the pre-deletion commit SHA so the implementation is easy to recover from git if a future plugin needs hydration again

## Consumers verified (via grep)

- `hydration.tsx`: only `plugins/dashboard/src/templates/dashboard/hydration.tsx`
- `HydrationManager`: only site-builder hydration path
- template `interactive` field: only shell template types/tests and site-builder flow
- widget registration topic consumers: other plugins already talk to dashboard over messaging and should remain unchanged

No other plugin currently justifies preserving hydration as a platform feature.

## Sequence

Order chosen to keep the repo typecheckable during the transition:

1. Write `docs/hydration-pattern.md`.
2. Move dashboard schema out of `templates/dashboard/` and update imports.
3. Remove dashboard template registration and site-builder route registration from `plugins/dashboard/src/plugin.ts`.
4. Delete the remaining dashboard template/hydration files.
5. Remove hydration handling from site-builder.
6. Remove the `interactive` field from template system types and tests.
7. Remove compile/precompile wiring from build scripts, package manifests, and `.gitignore`.
8. Clean up now-unused dashboard dependencies.
9. Update plan/docs references (`memory-reduction.md`, `unify-build-pipeline.md`).
10. Run targeted checks, then full validation if needed.

## Verification

1. `bun run typecheck` passes monorepo-wide.
2. `bun run lint` passes.
3. Relevant tests pass in affected workspaces: `@brains/dashboard`, `@brains/site-builder`, `@brains/templates`, and resolver tests in `shell/app`.
4. `rover` default preset starts cleanly and:
   - `GET /dashboard` serves the dashboard from the dashboard plugin web route
   - `GET /cms` serves the CMS shell from admin
   - `GET /` remains owned by site-builder
5. `rover` core preset still works and:
   - `GET /` serves the dashboard
   - `GET /cms` serves the CMS shell
6. No file anywhere in the tree matches:
   - `hydration.tsx`
   - `hydration.compiled.js`
   - `HydrationManager`
7. No template type exposes an `interactive` field.
8. No package declares a hydration `precompile` script or depends on `brain-precompile`.
9. Plugins contributing widgets through `dashboard:register-widget` continue to work without modification.

## What's preserved

- The standalone `@brains/dashboard` package and its widget contract
- Existing route semantics for dashboard and CMS
- Site-builder SSR for public pages
- `docs/hydration-pattern.md` as the recovery document for the removed hydration approach
- Git history containing the full pre-deletion implementation

## What's lost

- The unused hydrated dashboard path
- The hydration compile/runtime machinery that only existed to support that path

Nothing load-bearing should be lost: dashboard already renders static HTML successfully through its direct web route.

## Related

- `docs/plans/cms-on-core.md`
- `docs/plans/memory-reduction.md`
- `docs/plans/unify-build-pipeline.md`
- `docs/plans/external-plugin-api.md`
