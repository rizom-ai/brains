# Plan: Rizom Theme Hardening for App Extraction

## Status

Completed on 2026-04-20.

This document now serves as the landed record for the Rizom theme/runtime hardening work that unblocked apps-only extraction prep.

## Context

The direction is to extract the deployable Rizom apps into separate per-app repos while keeping the shared Rizom site/theme layer in `brains`.

That only works cleanly if the shared theme is reusable without leaking app-specific naming into its public API.

At the time this plan was written, `@brains/theme-rizom` still had two app-coupled edges:

- the shared theme and runtime used a brand-specific variant API (`data-rizom-variant` with values like `ai`, `foundation`, `work`)
- the typography overrides were keyed off those same app-specific variant names

Those issues are now resolved.

## Decision

Before app extraction, harden the shared Rizom theme around **neutral visual-profile semantics** rather than app names.

That means:

- the shared theme keeps owning the family-level color system, typography roles, and profile-specific styling
- app names should no longer appear in the theme API surface
- the current app-specific font overrides should become profile-based typography decisions, not per-app special cases

## Explicit non-goal for this phase

Do **not** make shared font delivery a blocker for extraction.

`@brains/theme-rizom` may continue to centrally define the Rizom family font stack for brand consistency. If font hosting or Google Fonts delivery needs to change later, track that as a separate follow-up. The extraction blocker here is the **app-coupled variant/profile API**, not the existence of shared font choices themselves.

## What changed

### 1. Replace the app-named variant API with a neutral profile API

Current shape:

- runtime config uses `variant`
- boot script writes `data-rizom-variant`
- theme selectors key off `ai`, `foundation`, and `work`

Target shape:

- runtime/site config uses a neutral concept such as `themeProfile` or `styleProfile`
- boot script writes a neutral DOM attribute such as `data-theme-profile` or `data-site-style`
- theme selectors key off neutral visual-profile values rather than app names

The exact profile names can be chosen during implementation, but they should describe the visual/typographic mode rather than the product/domain.

Examples of acceptable naming style:

- `product` / `editorial` / `studio`
- `signal` / `essay` / `workshop`

Avoid names that hardcode current app identity.

### 2. Move font overrides onto the neutral profile layer

Current shape:

- `foundation` switches to editorial typography
- `work` switches to studio typography
- `ai` keeps the product typography

Target shape:

- the shared theme still owns these typography choices
- the overrides are keyed off the neutral profile API instead of app names
- typography becomes part of the shared theme contract, not a hidden consequence of which app is consuming it

This preserves brand consistency while removing app coupling.

### 3. Make this a hard cut, not a staged compatibility bridge

Because all current Rizom consumers are in this repo and are being updated together before extraction, this should be a clean rename rather than a compatibility migration.

Recommended migration shape:

1. rename the runtime/site API to the neutral profile names
2. rename the DOM/theme selectors to the neutral profile names
3. update all current app-local `src/site.ts` usage in the same change
4. remove the old app-named API entirely instead of carrying aliases forward

## Likely file set

Shared theme:

- `shared/theme-rizom/src/theme.css`
- `shared/theme-rizom/src/index.ts`
- `shared/theme-rizom/package.json`

Shared Rizom site/runtime:

- `sites/rizom/src/create-site.ts`
- `sites/rizom/src/runtime/plugin.ts`
- `sites/rizom/src/runtime/boot/boot.boot.js`

Rizom apps:

- `apps/rizom-ai/src/site.ts`
- `apps/rizom-foundation/src/site.ts`
- `apps/rizom-work/src/site.ts`

Docs/tests/reference points:

- `packages/brain-cli/test/register-conventional-site-theme.test.ts`
- `packages/brain-cli/docs/brain-yaml-reference.md`
- any docs/comments describing `data-rizom-variant` or app-named variants

## Recommended target naming

Unless there is a strong reason to choose different neutral names, use this target shape:

- config key: `themeProfile`
- type name: `RizomThemeProfile`
- DOM attribute: `data-theme-profile`
- head init behavior: inline script writes the profile to `<html>` before `/boot.js` runs

Recommended profile values:

- `product` — current `ai`
- `editorial` — current `foundation`
- `studio` — current `work`

Rename mapping for the hard cut:

- `ai` → `product`
- `foundation` → `editorial`
- `work` → `studio`

## Concrete implementation checklist

### Phase 1 — replace the runtime API with the neutral profile API

- [x] In `sites/rizom/src/runtime/plugin.ts`, use `themeProfile` as the runtime config key
- [x] Rename the exported runtime profile type to `RizomThemeProfile`
- [x] Update canvas/profile mapping to key off neutral profile names:
  - `product` → current `tree.canvas.js`
  - `editorial` → current `roots.canvas.js`
  - `studio` → current `constellation.canvas.js`
- [x] Update `buildHeadScript()` to write `data-theme-profile` onto `<html>` before `/boot.js` runs
- [x] Remove the old `variant` / `__RIZOM_VARIANT__` API from the Rizom runtime

### Phase 2 — switch the DOM contract to a neutral attribute

- [x] In `sites/rizom/src/runtime/boot/boot.boot.js`, remove theme-profile handoff logic so boot only handles client behavior
- [x] Write `data-theme-profile` on `<html>` via inline head init
- [x] Remove `data-rizom-variant` from the boot/runtime contract
- [x] Update comments in the boot script so they describe profile semantics rather than app semantics

### Phase 3 — move the shared theme selectors to neutral profiles

- [x] In `shared/theme-rizom/src/theme.css`, replace selector comments that describe `ai` / `foundation` / `work`
- [x] Add neutral selectors:
  - `[data-theme-profile="product"]`
  - `[data-theme-profile="editorial"]`
  - `[data-theme-profile="studio"]`
- [x] Move the current font overrides onto those neutral selectors
- [x] Move the current accent/secondary overrides onto those neutral selectors
- [x] Keep the visual output intentionally unchanged unless there is an explicit typography adjustment

### Phase 4 — migrate app-local site definitions

- [x] In `apps/rizom-ai/src/site.ts`, change `variant: "ai"` to `themeProfile: "product"`
- [x] In `apps/rizom-foundation/src/site.ts`, change `variant: "foundation"` to `themeProfile: "editorial"`
- [x] In `apps/rizom-work/src/site.ts`, change `variant: "work"` to `themeProfile: "studio"`
- [x] Update `sites/rizom/src/create-site.ts` so `CreateRizomSiteOptions` exposes the neutral `themeProfile` field instead of `variant`
- [x] Make this a clean rename with no backward-compatibility layer

### Phase 5 — update docs, tests, and references

- [x] Update `packages/brain-cli/docs/brain-yaml-reference.md` if it references Rizom app/site variants directly
- [x] Update `packages/brain-cli/test/register-conventional-site-theme.test.ts` if any test data or assertions rely on the old app-named values
- [x] Update comments/docstrings in `shared/theme-rizom/src/index.ts`, `shared/theme-rizom/src/theme.css`, and `sites/rizom/src/runtime/*`
- [x] Search for and replace lingering references outside historical planning notes to:
  - `data-rizom-variant`
  - `__RIZOM_VARIANT__`
  - `variant: "ai" | "foundation" | "work"`

### Phase 6 — clean up remaining references

- [x] update historical planning notes so they read as landed-state docs instead of migration notes
- [x] update any remaining tests or comments that still reference `variant: "ai" | "foundation" | "work"`
- [x] remove any leftover type or doc references to `RizomRuntimeVariant` outside historical planning notes

## Implementation notes

- Keep the change as small as possible; this is an API cleanup, not a redesign
- Preserve the current visual output unless there is a deliberate typography tweak
- Do not introduce a large config matrix or generalized theme framework
- Keep app-local `src/theme.css` additive-only; the shared theme should continue to own family-level semantics

## Exit criteria

This plan is complete when:

1. the shared Rizom theme no longer exposes app names as its public variant/profile API
2. the current typography overrides are expressed as neutral visual profiles rather than app identities
3. all current Rizom apps consume the neutral profile API
4. there is no compatibility bridge carrying the old app-named API forward
5. app extraction no longer depends on carrying app-specific theme semantics out of the monorepo

## Tailwind/CSS-vars optimization follow-through

The profile rename is not the only theme cleanup worth doing before or alongside extraction. The current Rizom theme stack should keep moving toward **CSS vars for values, Tailwind/components for usage**.

### Additional optimization opportunities

1. **Replace the Foundation button CSS hack**
   - move button semantics into shared theme tokens + shared button component usage
   - remove app-local `.rizom-btn*` overrides with `!important`
   - let the editorial profile restyle buttons through CSS vars rather than selector fights

2. **Remove broad global element overrides**
   - avoid app-local selectors like `footer { ... }`
   - prefer explicit component props/classes or app-local wrapper classes

3. **Reduce inline `style={}` usage where CSS vars/Tailwind can express the same thing**
   - especially in shared site runtime/UI and SVG-heavy section components
   - prefer `currentColor`, CSS vars, and Tailwind arbitrary properties over React inline styles when practical

4. **Promote repeated decorative patterns into shared utilities/components**
   - repeated stroked display text
   - panel/card glow treatments
   - dividers and highlight underlines
   - other repeated visual motifs that currently live as long arbitrary-value class strings

5. **Reduce arbitrary-value sprawl when values repeat**
   - if a literal or arbitrary value appears multiple times, consider turning it into:
     - an existing token
     - a new CSS var
     - or a shared component/utility

6. **Expose frequent semantic values through CSS vars first**
   - especially for borders, surfaces, shadows, and diagnostics/panel treatments that are reused across sections

### Checklist

- [x] Move shared button styling toward CSS vars + shared component semantics
- [x] Remove app-local Foundation button override hacks
- [x] Remove broad global element overrides from app-local theme files
- [x] Convert obvious inline style usage to CSS vars/Tailwind classes where practical
- [x] Extract the most repeated decorative patterns into shared utilities/components or shared semantic vars
- [x] Reduce repeated arbitrary values where reuse is clear

## Follow-up, not blocker

Possible later work after extraction starts:

- decide whether Google Fonts delivery should remain centralized, become self-hosted, or become configurable
- add small package-level tests for `@brains/theme-rizom`
- decide whether the package name `theme-rizom` should remain brand-specific long-term or eventually be renamed
