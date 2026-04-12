# Rizom Sites — Shared Site and Theme Contract

## Context

This architecture landed.

The Rizom family now shares:

- `sites/rizom`
- `shared/theme-rizom`

Across three variants:

- `ai`
- `foundation`
- `work`

Current app wiring:

- `apps/rizom-ai` → `variant: ai`
- `apps/rizom-foundation` → `variant: foundation`
- `apps/rizom-work` → `variant: work`

## Contract

Each app selects the shared structural site package and the shared theme independently:

```yaml
site:
  package: "@brains/site-rizom"
  variant: ai
  theme: "@brains/theme-rizom"
```

This depends on the now-shipped resolver behavior where `site.package` and `site.theme` resolve independently.

## What the shared site owns

`sites/rizom` owns shared structure and variant-aware behavior:

- routes
- layouts
- section composition
- canvases
- variant-specific head script and runtime markers
- variant-specific content defaults where structure is shared but copy differs

The site plugin sets `data-rizom-variant` and loads the correct canvas asset for the active variant.

## What the shared theme owns

`shared/theme-rizom` owns shared brand tokens and variant-aware accent selection.

Dark-mode accent and secondary color differ by variant. Light mode keeps the shared Rizom visual contract.

## What changed from the old plan

Old plan sections about renaming `theme-rizom`, migrating `site:` from string form, and scaffolding the first rizom app were implementation work. That work is complete.

Current question is no longer architecture bootstrap. Current question is rollout quality:

- keep `sites/rizom` reusable across all three variants
- continue filling out shared sections/content polish
- validate build/deploy behavior for each app path

## Current repo truth

Shared packages:

- `sites/rizom`
- `shared/theme-rizom`

Current consumers:

- `apps/rizom-ai`
- `apps/rizom-foundation`
- `apps/rizom-work`

## Remaining work

1. Keep growing `sites/rizom` as shared sections mature.
2. Prefer shared implementation for structure and theming; keep per-app divergence in instance config/content where possible.
3. Validate each variant against its live deploy path as deploy ownership evolves.
4. Avoid reintroducing one-off branded site/theme packages for single apps unless extraction truly requires it.

## Verification

The contract holds when:

- each Rizom app declares `@brains/site-rizom` + `@brains/theme-rizom`
- variant drives structure/canvas differences without forking packages
- theme remains shared across all three apps
- resolver still treats site package and theme as separate inputs

## Related

- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
- `docs/theming-guide.md`
