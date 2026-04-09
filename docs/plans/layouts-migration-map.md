# Plan: `layouts/` Migration Map

## Context

This document turns the `layouts/*` inventory into an execution plan.

It assumes the direction from `site-composition-inheritance.md`:

- site composition should live in `sites/`
- generic primitives should live in `shared/`
- sites should be able to extend other sites explicitly
- `layouts/` is a temporary compatibility layer, not the final architecture

## Migration goals

1. **Replace `@brains/layout-*` consumers with `@brains/site-*` consumers**
2. **Introduce base site packages that other sites can extend**
3. **Keep behavior stable during the migration**
4. **Delete the legacy `layouts/` packages only after all imports are moved**

## Proposed target topology

The cleanest target shape is:

- `sites/professional` — base professional site composition
- `sites/personal` — base personal site composition
- `sites/default` — extends `sites/professional`
- `sites/yeehaa` — extends `sites/default`
- `sites/mylittlephoney` — extends `sites/personal`

This keeps the existing site names intact while moving the reusable composition layer into `sites/`.

`packages/brain-cli` should then re-export the base site authoring surface from the new site packages instead of from `@brains/layout-*`.

## Migration phases

### Phase 1: Create the new base site packages

Add new packages that absorb the current `layouts/*` contents:

- `sites/professional`
- `sites/personal`

Each package should own:

- plugin wrapper / factory
- routes
- templates
- data sources
- site-specific config and schema exports
- site-specific profile/frontmatter extensions
- the current layout component(s) that still belong to the site composition layer

### Phase 2: Flip existing site consumers

Update the existing site packages to depend on the new base site packages:

- `sites/default` → extends `sites/professional`
- `sites/yeehaa` → extends `sites/default`
- `sites/mylittlephoney` → extends `sites/personal`

These packages should keep their current public identity, but their internals should become thin composition layers rather than direct consumers of `@brains/layout-*`.

### Phase 3: Update the CLI authoring surface

Update `packages/brain-cli/src/entries/site.ts` so standalone site authoring re-exports the new base site packages.

This is important because `brain init` and standalone site scaffolding should point at the new architecture, not the legacy layout packages.

### Phase 4: Add temporary compatibility shims

If needed, keep `layouts/*` as thin compatibility packages that re-export from the new `sites/*` packages.

Rules for shims:

- no new logic
- no new source of truth
- only re-export while consumers are being migrated
- delete them once the last import has moved

### Phase 5: Remove legacy `layouts/`

After all consumers are moved:

- remove `layouts/personal`
- remove `layouts/professional`
- remove workspace references
- clean up docs, tests, and lockfile entries

## Package-by-package migration map

### `layouts/professional` → `sites/professional`

Move the following into the new base site package:

- `ProfessionalSitePlugin`
- `professionalSitePlugin`
- `routes`
- `HomepageListLayout`
- `AboutPageLayout`
- `SubscribeThanksLayout`
- `SubscribeErrorLayout`
- `HomepageListDataSource`
- `AboutDataSource`
- `professionalSiteConfigSchema`
- `ProfessionalSiteConfig`
- `ProfessionalSiteConfigInput`
- `professionalProfileSchema`
- `professionalProfileExtension`
- `ProfessionalProfile`
- `ProfessionalLayout`

Consumer updates:

- `sites/default` should import from `@brains/site-professional`
- `sites/yeehaa` should import from `@brains/site-default` after `sites/default` is converted to extend `sites/professional`
- `packages/brain-cli/src/entries/site.ts` should re-export the new base package surface

### `layouts/personal` → `sites/personal`

Move the following into the new base site package:

- `PersonalSitePlugin`
- `personalSitePlugin`
- `routes`
- `HomepageLayout`
- `AboutPageLayout`
- `HomepageDataSource`
- `AboutDataSource`
- `personalSiteConfigSchema`
- `PersonalSiteConfig`
- `PersonalSiteConfigInput`
- `personalProfileSchema`
- `personalProfileExtension`
- `PersonalProfile`
- `PersonalLayout`

Consumer updates:

- `sites/mylittlephoney` should import from `@brains/site-personal`
- `packages/brain-cli/src/entries/site.ts` should re-export the new base package surface

## Consumer-by-consumer migration map

### `sites/default`

Current role:

- site package that uses the professional composition layer directly

Target role:

- thin site package extending `sites/professional`

Likely changes:

- replace direct `@brains/layout-professional` imports
- keep `entityDisplay` customizations here
- keep site identity and theme binding here

### `sites/yeehaa`

Current role:

- site package that uses the professional composition layer directly

Target role:

- thin site package extending `sites/default`

Likely changes:

- replace direct `@brains/layout-professional` imports
- keep label overrides here
- inherit the rest from `sites/default`

### `sites/mylittlephoney`

Current role:

- site package that uses the personal composition layer directly

Target role:

- thin site package extending `sites/personal`

Likely changes:

- replace direct `@brains/layout-personal` imports
- keep label overrides here
- inherit the rest from `sites/personal`

### `packages/brain-cli`

Current role:

- curated authoring surface for standalone site repos

Target role:

- curated authoring surface that re-exports `@brains/site-personal` and `@brains/site-professional`

Likely changes:

- swap `@brains/layout-*` re-exports to `@brains/site-*`
- preserve the same authoring convenience API where possible
- update docs and examples for the new package names

## Shared extraction pass

After the package move, identify any reusable primitives inside the old layout files and extract them into `shared/`.

Examples of possible shared candidates:

- header/navigation primitives
- repeated card layouts
- reusable page section wrappers
- shared CTA blocks
- shared render helpers

Only move something into `shared/` if it is genuinely reusable outside one site family.

## Compatibility and rollout rules

- do not change output markup unless a migration step requires it
- keep package names stable for consumers until the new packages exist
- prefer temporary shims over a large-bang rewrite
- update docs in the same change as code movement when possible
- verify each consumer package after it is switched

## Success criteria

- every `@brains/layout-*` import has a replacement
- `sites/default`, `sites/yeehaa`, and `sites/mylittlephoney` no longer depend on `layouts/*`
- `packages/brain-cli` re-exports the new site packages
- `layouts/` is either empty or deleted
- reusable primitives have been extracted to `shared/` where appropriate

## Related docs

- `docs/plans/site-composition-inheritance.md`
- `docs/plans/layouts-export-inventory.md`
- `docs/architecture-overview.md`
- `docs/plans/standalone-site-authoring.md`
