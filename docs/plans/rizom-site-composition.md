# Plan: Rizom Site Composition

## Context

`rizom.ai`, `rizom.foundation`, and `rizom.work` no longer fit one shared final site package with small `variant` toggles.

Open problem:

- routes differ
- section order differs
- nav/footer language differs
- hero structure differs
- some sections are app-only
- `foundation` and `work` mockups are still not implemented

If this keeps growing inside one `sites/rizom` variant switchboard, ownership gets hard to trace and extraction later gets harder.

Important current-state nuance: the shared implementation is already mostly `rizom.ai`-shaped. That makes `rizom.ai` the baseline to carve shared base code out of, not the first blocked mockup to finish.

## Decision

Use **shared base + app-owned composition**.

That means:

- shared packages keep reusable Rizom primitives
- each app owns its own final site composition
- do not build deep inheritance or hidden override rules
- prefer explicit composition from shared building blocks

## Ownership split

### Shared/base ownership

Keep only broadly reusable pieces shared:

- common components
- layout primitives
- common section templates that are still genuinely reusable
- shared canvas helpers/effects when not app-specific
- shared brand theme tokens in `shared/theme-rizom`

`sites/rizom` should move toward a base/spine role, not a giant final-site package for all three apps.

### App-owned composition

Each app should own:

- routes
- section inventory
- section ordering
- nav/footer copy and CTAs
- hero treatment
- app-only sections
- final site assembly

Inside monorepo, this can start as app-owned composition code. After extraction, same ownership moves into app-local `src/site.ts`.

## Explicit composition rule

Do not build magic inheritance.

Preferred shape:

- import shared sections/components/helpers directly
- assemble each app route tree directly
- override only pieces app actually owns

Avoid:

- deep override chains
- hidden fallback behavior
- more `if (variant === ...)` sprawl in one shared site package

## Current gaps

### `rizom.ai`

`rizom.ai` now has the same thin wrapper seam as the other two apps:

- `@brains/site-rizom-ai`
- wrapper-owned shell model
- wrapper-owned route export

That means the ownership model is now aligned across all three Rizom apps.

Open work for `rizom.ai` still exists:

- move any remaining AI-final defaults out of shared/base files and into the wrapper where they are truly app-owned
- decide what should remain shared base versus wrapper-owned AI composition
- move that composition into app-local `src/site.ts` when extraction becomes desirable

### `rizom.foundation`

`rizom.foundation` now has explicit app-owned route composition in its thin wrapper:

- `@brains/site-rizom-foundation`
- wrapper-owned shell model
- wrapper-owned route export
- tracked `site-content` for durable editorial sections

Implemented foundation sections now include:

- editorial hero
- argument block
- pull quote
- research section
- events section
- support grid
- about section
- follow/CTA section
- ecosystem

Open work remains, but it is now mostly content/link polish, shared-vs-app ownership cleanup, and later extraction rather than first-pass composition scaffolding.

### `rizom.work`

`rizom.work` now also has explicit app-owned route composition in its thin wrapper:

- `@brains/site-rizom-work`
- wrapper-owned shell model
- wrapper-owned route export
- tracked `site-content` for durable workshop/offer sections

Implemented work sections now include:

- split hero
- diagnostic widget
- problem block
- workshop steps
- personas
- proof/testimonial section
- bridge/closer CTA sections
- ecosystem

Open work is now mostly real CTA destination cleanup, proof/case-study polish, shared-vs-app ownership cleanup, and later extraction.

### Shared-shell cleanup still needed

The biggest shared-shell cleanup is now done:

- `Header.tsx`
- `Footer.tsx`
- `SideNav.tsx`

now read explicit shell models rather than hardcoded app labels.

Open shared cleanup still remains around `routes.ts` and around deciding which currently shared section implementations are truly reusable primitives versus temporary app-specific sections living in `sites/rizom`.

## Concrete cut list

### Keep shared/base

These look broadly reusable and should stay shared if kept small and explicit:

- `sites/rizom/src/components/Section.tsx`
  - layout primitive only
- `sites/rizom/src/components/Button.tsx`
  - reusable CTA primitive if variants stay generic
- `sites/rizom/src/components/Badge.tsx`
  - reusable label primitive
- `sites/rizom/src/components/Divider.tsx`
  - reusable separator primitive
- `sites/rizom/src/components/ProductCard.tsx`
  - reusable only if treated as a generic card primitive, not as `rizom.ai` page structure
- `sites/rizom/src/sections/answer/*`
  - likely reusable as centered prose block
- `sites/rizom/src/sections/ownership/*`
  - likely reusable as feature-grid/about block
- `sites/rizom/src/sections/ecosystem/*`
  - clearly shared across all three apps
- `sites/rizom/src/canvases/prelude.canvas.js`
  - shared canvas helpers
- `sites/rizom/src/boot/boot.boot.js`
  - shared boot behavior if it stops assuming one fixed route structure
- `shared/theme-rizom/*`
  - shared brand tokens and common styling primitives

### Likely `rizom.ai`-specific

These are current baseline pieces, but they should not remain implicit shared defaults forever:

- `sites/rizom/src/routes.ts`
  - current full route stack is effectively `rizom.ai` composition
- `sites/rizom/src/components/Header.tsx`
  - hardcoded `rizom.ai` branding + AI-shaped nav labels
- `sites/rizom/src/components/Footer.tsx`
  - hardcoded `rizom.ai` branding + links
- `sites/rizom/src/components/SideNav.tsx`
  - hardcoded labels and anchors
- `sites/rizom/src/sections/hero/*`
  - current hero matches AI/shared baseline, not foundation/work mockups
- `sites/rizom/src/sections/problem/*`
  - current 3-card problem grid fits AI baseline more than other apps
- `sites/rizom/src/sections/products/*`
  - current product-stack layout is closest to AI
- `sites/rizom/src/sections/quickstart/*`
  - quickstart terminal block is AI-specific
- `sites/rizom/src/sections/mission/*`
  - current closing CTA shape is AI-biased
- `sites/rizom/src/canvases/tree.canvas.js`
  - AI-specific background effect

### `rizom.foundation`-owned work

Needs app-owned composition plus likely new section code for:

- editorial hero
- argument block
- pull quote
- research section
- events section
- support grid / support cards
- about composition using shared ownership-like primitives where useful
- follow/CTA composition
- `sites/rizom/src/canvases/roots.canvas.js` integration through foundation-owned composition

Likely result:

- foundation reuses shared primitives
- foundation owns route tree and section order
- foundation adds new section templates where current shared set is missing required structure

### `rizom.work`-owned work

Needs app-owned composition plus likely new section code for:

- split hero
- diagnostic widget
- problem block
- workshop steps
- personas grid
- proof/testimonial/partners block
- bridge / closer CTA sections
- about composition using shared ownership-like primitives where useful
- `sites/rizom/src/canvases/constellation.canvas.js` integration through work-owned composition

Likely result:

- work reuses shared primitives
- work owns route tree and section order
- work adds new section templates for interactive or bespoke mockup pieces

### Transition rule for current plugin code

Current plugin/config layer still exposes one `variant` switch:

- `sites/rizom/src/plugin.ts`
- `sites/rizom/src/index.ts`

Short term: keep it working while split happens.

Long term:

- shrink shared plugin responsibility to shared asset/boot wiring only
- stop using one plugin-driven variant switch as final ownership model for all three apps

## Proposed file shape

Keep change small. Do not refactor whole site at once.

### Shared/base files

Keep in `sites/rizom` or move within it toward neutral base roles:

- `src/components/Section.tsx`
- `src/components/Button.tsx`
- `src/components/Badge.tsx`
- `src/components/Divider.tsx`
- `src/components/ProductCard.tsx` if kept generic
- `src/sections/answer/*`
- `src/sections/ownership/*`
- `src/sections/ecosystem/*`
- `src/boot/boot.boot.js`
- `src/canvases/prelude.canvas.js`
- shared theme wiring in `shared/theme-rizom`

### AI composition files

Treat these as eventual `rizom.ai` composition pieces, even if they stay put short term:

- `src/routes.ts`
- `src/components/Header.tsx`
- `src/components/Footer.tsx`
- `src/components/SideNav.tsx`
- `src/sections/hero/*`
- `src/sections/problem/*`
- `src/sections/products/*`
- `src/sections/quickstart/*`
- `src/sections/mission/*`
- `src/canvases/tree.canvas.js`

### New app-owned composition entrypoints

Add thin composition files instead of more `variant` branching inside shared files.

Suggested first shape:

- `sites/rizom/src/compositions/foundation.ts`
- `sites/rizom/src/compositions/work.ts`
- later `sites/rizom/src/compositions/ai.ts`

Each composition file should own:

- route list
- section order
- nav model
- footer model
- side-nav labels
- selected canvas asset

Short term, these can still be consumed by current plugin package while repo ownership stays in monorepo.

### New foundation-only section files

Likely add:

- `sites/rizom/src/sections/pull-quote/*`
- `sites/rizom/src/sections/research/*`
- `sites/rizom/src/sections/events/*`
- `sites/rizom/src/sections/support/*`

Optional if needed after first pass:

- foundation-specific hero variant file instead of mutating shared `hero`

### New work-only section files

Likely add:

- `sites/rizom/src/sections/diagnostic/*`
- `sites/rizom/src/sections/workshop/*`
- `sites/rizom/src/sections/personas/*`
- `sites/rizom/src/sections/proof/*`
- `sites/rizom/src/sections/closer/*`

Optional if needed after first pass:

- work-specific hero variant file instead of mutating shared `hero`

## Minimal implementation mechanism

Keep first cut boring. Use existing `SitePackage` + `extendSite()` support instead of inventing a new composition framework.

### Composition object shape

Use a small explicit model for shell-level differences:

```ts
interface RizomShellLink {
  href: string;
  label: string;
}

interface RizomShellModel {
  brandSuffix: "ai" | "foundation" | "work";
  primaryCta: RizomShellLink;
  navLinks: RizomShellLink[];
  footerLinks: RizomShellLink[];
  sideNav: Array<{ href: string; label: string }>;
}
```

Keep it shell-only.

Do **not** put route composition, section content, or template behavior into one giant config blob.

### Shared readers of that model

Refactor these pieces to accept explicit props instead of reading hardcoded AI values:

- `Header`
- `Footer`
- `SideNav`
- `DefaultLayout` or thin layout wrappers around it

### Smallest viable site-composition seam

Use `extendSite()` from `@brains/site-composition` and wrap shared layout/components with app-specific shell data.

Suggested pattern:

1. keep one base site package with reusable layouts/templates/static assets
2. create thin composition wrappers that call `extendSite(baseSite, overrides)`
3. override only:
   - routes
   - layout wrapper
   - plugin config when canvas/asset wiring differs

This keeps first implementation slice inside existing runtime contracts:

- `SitePackage.layouts`
- `SitePackage.routes`
- `SitePackage.plugin`
- `SitePackage.staticAssets`

### Suggested file additions for that seam

- `sites/rizom/src/compositions/types.ts`
  - shell model types only
- `sites/rizom/src/compositions/foundation.ts`
- `sites/rizom/src/compositions/work.ts`
- later `sites/rizom/src/compositions/ai.ts`
- `sites/rizom/src/layouts/create-rizom-layout.tsx`
  - returns layout component closed over a `RizomShellModel`
- optional `sites/rizom/src/base-site.ts`
  - exports reusable base `SitePackage`

### Plugin change rule

Keep plugin change minimal.

Short term plugin should only care about things like:

- selected canvas asset
- shared boot script registration
- shared static asset registration

Do not keep growing plugin config into ownership/config for full route trees or nav labels.

## First implementation slice

Do not start with all three apps. Start with smallest ownership cut that proves direction.

### Slice 1: foundation-first composition seam

1. extract current shared site into an explicit base site export
2. add `RizomShellModel` + generic shell readers
3. keep current AI output working through existing/default shell model
4. add `foundation` composition wrapper using `extendSite()`
5. add first missing foundation-only section

Target result:

- one new composition seam exists
- `foundation` can diverge without growing more `variant` conditionals everywhere
- `ai` still works
- no new inheritance machinery exists

### Slice 2: foundation route completion

1. add remaining foundation-only sections
2. wire section order to match mockup more closely
3. add tracked foundation site content
4. boot-check foundation

### Slice 3: work composition seam reuse

1. add `work` composition entrypoint using same seam
2. add work-only sections one by one
3. boot-check work

## Phase plan

### Phase 1: carve base from current shared site

Goal: separate reusable primitives from app-specific composition.

Open work:

1. identify which current `sites/rizom` pieces are truly reusable
2. make shared header/footer/nav pieces neutral or primitive-only
3. stop using one shared hardcoded route stack as final output for all apps
4. define small composition surface apps can assemble explicitly

Deliverable:

- shared base pieces exist without forcing one final site structure

### Phase 2: keep `rizom.ai` stable while base split happens

Reason:

- current shared site is already mostly `rizom.ai`
- it is useful as the baseline for deciding what is truly reusable
- it is not the variant currently blocked on unfinished mockup implementation

Open work:

1. keep `rizom.ai` working while shared/base pieces are carved out
2. avoid redesigning `rizom.ai` at the same time as the base split
3. note which remaining pieces are truly `rizom.ai`-specific and should later move into app-owned composition

Deliverable:

- `rizom.ai` remains stable while shared/base boundaries become clearer

### Phase 3: implement `rizom.foundation` first

Reason:

- narrower than `work`
- less interactive
- better first proof for app-owned composition

Open work:

1. define foundation-specific route tree
2. implement missing foundation-only sections
3. wire real app-owned nav/footer labels
4. add tracked foundation site content for those sections
5. boot-check foundation in monorepo

Deliverable:

- `rizom.foundation` mockup substantially represented in app-owned composition

### Phase 4: implement `rizom.work`

Open work:

1. define work-specific route tree
2. implement diagnostic/widget and workshop-specific sections
3. wire work-specific nav/footer labels
4. add tracked work site content for those sections
5. boot-check work in monorepo

Deliverable:

- `rizom.work` mockup substantially represented in app-owned composition

### Phase 5: finish `rizom.ai` explicit composition

Wrapper seam now exists for `rizom.ai`, so remaining work is narrower:

1. stop relying on shared package defaults as the final `rizom.ai` site assembly where that is still true
2. keep only genuinely reusable base pieces shared
3. move `rizom.ai` composition into app-local `src/site.ts` when extraction becomes desirable

Deliverable:

- all three Rizom apps follow the same ownership model in practice, not just via wrapper package names

### Phase 6: extraction follow-through

Once an app's composition is stable:

1. scaffold standalone repo with published CLI
2. move final site composition into app-local `src/site.ts`
3. keep only genuinely reusable Rizom primitives shared
4. move app-only styling into local `src/theme.css` when needed
5. deploy and verify
6. remove old monorepo app

## Order

Recommended order:

1. carve shared base from current Rizom site code
2. keep `rizom.ai` stable while that split happens
3. finish `rizom.foundation`
4. finish `rizom.work`
5. give `rizom.ai` explicit app-owned composition last
6. extract each app only after its own composition is stable

## Non-goals

- Do not create deep site inheritance machinery.
- Do not force all three apps to extract at once.
- Do not keep app-specific route trees trapped behind one shared `variant` switch.
- Do not bundle repo extraction with a giant branding refactor.

## Verification

This plan is working when:

1. shared Rizom code is clearly reusable base code, not hidden final-site behavior
2. `rizom.foundation` and `rizom.work` each have app-owned route composition
3. `rizom.ai` also ends with explicit app-owned composition rather than implicit shared defaults
4. shared pieces can still be imported directly without override magic
5. extraction path for each app becomes straightforward: move composition into local `src/site.ts`

## Decision for first implementation pass

First app-owned compositions should live **temporarily as thin site-package wrappers under `sites/`** until extraction.

Reason:

- smallest runtime change now
- keeps current resolver/package flow intact
- lets extracted repos later move same composition into local `src/site.ts` with less churn

## Related

- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
