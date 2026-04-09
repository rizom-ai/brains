# Plan: Collapse `layouts/` into `sites/` and Add Site Inheritance

## Context

The current `layouts/` packages are no longer just layout components. They package together:

- site plugins
- routes
- page templates
- data sources
- layout components

In practice, they function as reusable **site compositions** or **site presets**. They are consumed by multiple sites and by the CLI, so they still have value, but the current package split is harder to reason about than it needs to be.

The direction for the repo should be:

1. move pure reusable UI pieces into `shared/`
2. move site composition concerns into `sites/`
3. allow one site to **extend** another site so we can share structure without duplicating it

## Goals

1. **Remove the `layouts/` layer as a top-level concept**
   - keep the code that matters
   - eliminate the ambiguous package category

2. **Make site composition explicit**
   - sites should be the unit of composition
   - shared primitives should live in `shared/`

3. **Support inheritance / extension between sites**
   - e.g. `sites/professional` as a base, `sites/default` or `sites/yeehaa` layering overrides on top
   - make reuse intentional rather than copy-pasted

4. **Preserve current behavior during migration**
   - no public breaking changes until replacements are in place
   - keep generated output stable

## Non-goals

- Do not turn `shared/` into a dumping ground for site-specific composition logic.
- Do not add inheritance if it only works for one package shape.
- Do not change the public output of sites unless the migration explicitly requires it.
- Do not force every site to use inheritance; some sites should remain standalone.

## Current shape

Today the graph looks roughly like this:

```text
shared/      → reusable utilities, themes, UI primitives
layouts/     → reusable site compositions / presets
sites/       → site bundles that consume layouts
```

Examples of current reuse:

- `sites/default` imports `@brains/layout-professional`
- `sites/yeehaa` imports `@brains/layout-professional`
- `sites/mylittlephoney` imports `@brains/layout-personal`
- `packages/brain-cli` references `@brains/layout-personal`

This shows `layouts/` is acting as shared site composition, not just visual layout.

## Proposed end state

### 1) Shared primitives in `shared/`

Extract anything that is truly reusable and not site-specific:

- layout components that are just presentation primitives
- shared page sections
- shared UI blocks
- data shaping helpers that are not tied to a specific site identity

### 2) Site compositions in `sites/`

Each site package should define a complete site composition:

- routes
- templates
- data sources
- plugin wiring
- theme selection / overrides
- site-specific layout assembly

### 3) Site inheritance / extension

Allow a site to derive from a base site and override just the pieces it needs.

Suggested model:

```ts
site = extendSite(baseSite, {
  routes: [...],
  templates: {...},
  dataSources: [...],
  pluginConfig: {...},
});
```

Possible inheritance levels:

- **routes** — add, replace, or remove route definitions
- **templates** — override or extend page templates
- **data sources** — swap in site-specific data retrieval
- **plugin config** — merge plugin settings
- **static assets** — inherit with optional overrides

## Design principles

### Site inheritance should be explicit

Inheritance must be visible in code and easy to audit. Avoid hidden magical fallback rules.

Good:

- `sites/default` extends `sites/professional`
- `sites/yeehaa` extends `sites/default`

Avoid:

- implicit runtime resolution based on filename conventions
- deep magic that makes it hard to tell where a page came from

### Composition should be deterministic

When sites are merged, the rules should be predictable:

- base first, child overrides second
- arrays should use an explicit merge strategy
- route conflicts should fail loudly unless explicitly overridden
- templates should require named replacements

### Shared vs site-specific boundary should stay clean

If a component can be reused outside one site family, it belongs in `shared/`.
If it is part of a site identity or a site-only content strategy, it belongs in `sites/`.

## Proposed migration path

### Phase 1: Inventory and classify

Inventory the current `layouts/` packages and split their contents into three buckets:

1. **pure primitives** → move to `shared/`
2. **site composition logic** → move to `sites/`
3. **unclear / mixed responsibility** → keep temporarily, then split in later phases

Deliverable:

- a mapping document for each exported symbol in `layouts/*`

### Phase 2: Introduce site composition helpers

Create a small composition layer for sites, either in `shell/app`, `shared/`, or a dedicated package, that can merge:

- routes
- templates
- data sources
- site plugin config
- static assets

This should be the foundation for site inheritance.

### Phase 3: Convert one site family first

Pick the least risky chain and migrate it first, for example:

- `sites/professional` as base
- `sites/default` extends it
- `sites/yeehaa` extends `sites/default`

This proves the inheritance model without moving everything at once.

### Phase 4: Move remaining reusable code

Once the composition layer works:

- move remaining reusable components out of `layouts/`
- update sites to import from `shared/` and local site files
- keep any layout-only wrappers only if they are still genuinely reusable

### Phase 5: Remove `layouts/` packages

When no consumers remain:

- delete `layouts/personal`
- delete `layouts/professional`
- update package references, docs, and lockfile
- remove any compatibility aliases

## Open design questions

### 1) Where should `extendSite()` live?

Options:

- `shell/app` if it is part of runtime resolution
- `shared/` if it is generic and reusable
- a dedicated `site-composition` package if the logic is non-trivial

### 2) What should be mergeable?

At minimum:

- routes
- templates
- data sources
- static assets
- plugin config

Potentially later:

- entity displays
- navigation entries
- route metadata
- site-level UI slots

### 3) How should conflicts work?

Need explicit policy for each field:

- routes: override by path or fail
- templates: override by name or fail
- data sources: append or replace
- plugin config: deep merge

### 4) Should inheritance be single-parent or multi-parent?

Recommendation: start with **single-parent** inheritance.

Reasons:

- easier to reason about
- easier to detect cycles
- simpler conflict resolution
- matches the current mental model of base site + variants

## Risks

- **Hidden coupling** — inheritance can make it unclear where behavior originates
- **Merge bugs** — route/template conflicts could create subtle regressions
- **Overfitting** — a too-generic composition layer could become complicated quickly
- **Migration churn** — package renames will touch sites, docs, tests, and lockfile entries

## Guardrails

- keep inheritance depth shallow
- require explicit override names
- fail on cycles
- test merge results directly
- preserve current site outputs during the first migration wave

## Success criteria

- `layouts/` no longer needed as a top-level package category
- sites can extend other sites without copy/paste
- reusable primitives live in `shared/`
- site composition lives in `sites/`
- the site graph is easier to understand than it is today

## Suggested order of execution

1. classify `layouts/*` exports
2. introduce a site composition helper
3. migrate one site chain
4. move shared primitives
5. remove `layouts/`
6. update docs and package references

## Related docs

- `docs/architecture-overview.md`
- `docs/theming-guide.md`
- `docs/plans/site-builder-decoupling.md`
- `docs/plans/standalone-site-authoring.md`
- `docs/plans/layouts-export-inventory.md`
- `docs/plans/layouts-migration-map.md`
- `docs/plans/harmonize-monorepo-apps.md`
