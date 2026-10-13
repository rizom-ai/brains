---
"@rizom/brain": patch
---

Fix: `@rizom/brain` CLI now resolves `@-prefixed` package references
from `brain.yaml` before resolving the brain config.

The published CLI entrypoint (`packages/brain-cli/scripts/entrypoint.ts`)
called `resolve(definition, env, overrides)` directly, skipping the
dynamic-import step that populates the package registry with refs from
`site.package` and plugin config values. Brains that override
`site.package` in `brain.yaml` would silently fall back to the brain
definition's default site because `resolveSitePackage()` couldn't find
their site in an empty registry.

The dev runner (`shell/app/src/runner.ts`) already had this wiring;
only the published path was missing it.

Discovered booting `apps/mylittlephoney` as the first standalone
extraction (Phase 1 of `docs/plans/harmonize-monorepo-apps.md`). The
brain booted cleanly and rendered the site successfully, but the site
was rover's default professional layout with the blue/orange palette,
not mylittlephoney's `personalSitePlugin` with the pink theme. The
compiled `main.css` had `--palette-brand-blue: #3921D7` instead of
the mylittlephoney pinks.

Extracts the import-and-register logic into
`packages/brain-cli/src/lib/register-override-packages.ts` with a
dependency-injected `PackageImportFn` so it's unit-testable without
hitting the real module resolver. Wires the helper into
`setBootFn()` in the published entrypoint. The dev runner still uses
its own inline copy; a follow-up could dedupe.

Exports `getPackage`, `hasPackage`, and `collectOverridePackageRefs`
from `@brains/app` (previously only `registerPackage` was exported).

Added 5 regression tests in
`packages/brain-cli/test/register-override-packages.test.ts` covering:

- site.package registration
- plugin config ref registration
- combined site + plugin refs in one pass
- no-op on overrides without refs
- swallowing import errors and continuing with remaining refs
