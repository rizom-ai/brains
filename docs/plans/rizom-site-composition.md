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

`rizom.ai` is the least blocked of the three because the current shared site already largely matches its structure.

That means:

- it can keep running on the current implementation while the split begins
- it should act as the source material for identifying reusable base pieces
- it does not need to be the first app-specific composition rewrite

Open work for `rizom.ai` still exists, but it is lower urgency:

- separate its app-specific composition from shared/base pieces
- eventually give it the same explicit app-owned composition shape as the other Rizom apps
- move that composition into app-local `src/site.ts` when extraction becomes desirable

### `rizom.foundation`

Needs composition closer to its mockup, including likely sections such as:

- editorial hero
- argument block
- pull quote
- research section
- events section
- support grid
- about section
- follow/CTA section
- ecosystem

### `rizom.work`

Needs composition closer to its mockup, including likely sections such as:

- split hero
- diagnostic widget
- problem block
- workshop steps
- personas
- proof/testimonial section
- bridge/closer CTA sections
- ecosystem

### Shared-shell cleanup still needed

Current shared Rizom shell still has hardcoded AI-shaped pieces that must stop being final shared behavior:

- `Header.tsx`
- `Footer.tsx`
- `SideNav.tsx`
- `routes.ts`

Those should either become neutral shared primitives or move under app-owned composition.

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

### Phase 5: give `rizom.ai` explicit app-owned composition

Once the base split pattern is proven by `foundation` and `work`:

1. create explicit `rizom.ai` composition too
2. stop relying on shared package defaults as the final `rizom.ai` site assembly
3. keep only genuinely reusable base pieces shared
4. move `rizom.ai` composition into app-local `src/site.ts` when extraction becomes desirable

Deliverable:

- all three Rizom apps follow the same ownership model

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

## Related

- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
