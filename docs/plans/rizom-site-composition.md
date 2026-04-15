# Plan: Rizom Site Composition

## Decision

Use **wrapper-owned real sites + extracted shared primitives**.

That means:

- `@brains/site-rizom-ai`, `@brains/site-rizom-foundation`, and `@brains/site-rizom-work` are the real site owners now
- `sites/rizom` is transitional only
- shared code should move toward proper shared abstractions, not remain a pseudo-site
- do not keep a higher-order layout helper or a shared shell config object as the long-term ownership model
- prefer explicit wrapper-owned composition from plain components

## Current state

Already done:

- all three wrappers own their final routes
- all app-specific templates live in the wrappers
- durable site content is tracked under each app's `brain-data/site-content`
- all three apps are repo-backed through `directory-sync`
- shared `sites/rizom/src/routes.ts` is empty
- shared `sites/rizom` no longer defaults to the AI site shell in layout/plugin boot fallback

What remains in `sites/rizom` now is mostly:

- shared runtime glue (`plugin.ts`, `boot.boot.js`, static canvas assets)
- shared layout/frame code
- shared UI primitives (`Section`, `Button`, `Badge`, `Divider`, `ProductCard`)
- the family-owned `ecosystem` section
- transitional shell/chrome pieces that still need cleaner ownership

## Architectural rule

### Wrappers own final composition

Each wrapper should own:

- layout composition
- header/footer/side-nav assembly
- app-specific nav labels and CTA links
- route tree
- section order
- app-only sections
- app-specific canvas selection

### Shared code stays primitive

Shared code should only own things that are genuinely reusable across apps:

- frame/canvas wrapper
- small presentational UI primitives
- shared runtime boot/plugin glue
- shared canvas helpers/assets when truly shared
- family-owned `ecosystem` section
- shared theme tokens in `shared/theme-rizom`

## New layout rule

Do **not** keep or expand this pattern:

- higher-order layout factories
- `createRizomLayout(shell)`
- shared `RizomShellModel` config blobs
- hidden wrapper binding tricks

Preferred shape:

1. shared package exports a plain frame component
2. each wrapper defines its own normal layout component
3. wrapper layout renders its own header/footer/side-nav composition explicitly

## Target component shape

### Shared

Shared package should trend toward something like:

- `RizomFrame`
- `RizomLayoutProps`
- `Section`
- `Button`
- `Badge`
- `Divider`
- `ProductCard`
- shared plugin/boot/canvas exports
- `createEcosystemContent`

`RizomFrame` should only own:

- full-page background canvas element
- centered page container/frame

It should **not** own app chrome.

### Wrapper

Each wrapper should have a small explicit layout component, e.g.:

- `sites/rizom-ai/src/layout.tsx`
- `sites/rizom-foundation/src/layout.tsx`
- `sites/rizom-work/src/layout.tsx`

Those wrapper layouts should render:

- `RizomFrame`
- wrapper-owned header composition
- wrapper-owned side-nav composition
- `<main>{sections}</main>`
- wrapper-owned footer composition

No HOC. No shell model.

## Chrome ownership rule

Header/footer/side-nav should no longer be treated as one shared shell object.

Preferred direction:

- wrappers own the composition directly
- if shared chrome components remain, they should take direct props, not a bundled shell model
- if direct props still feel awkward, move those chrome components fully into wrappers

In other words:

- avoid `shell.brandSuffix`
- avoid `shell.navLinks`
- avoid `shell.footerLinks`
- avoid `shell.sideNav`

Use plain props or wrapper-local components instead.

## Concrete cut list

### Keep shared for now

These are good shared candidates:

- `sites/rizom/src/layouts/*frame*` or equivalent frame-only layout primitive
- `sites/rizom/src/components/Section.tsx`
- `sites/rizom/src/components/Button.tsx`
- `sites/rizom/src/components/Badge.tsx`
- `sites/rizom/src/components/Divider.tsx`
- `sites/rizom/src/components/ProductCard.tsx`
- `sites/rizom/src/components/product-card-types.ts`
- `sites/rizom/src/boot/boot.boot.js`
- `sites/rizom/src/canvases/prelude.canvas.js`
- `sites/rizom/src/canvases/tree.canvas.js`
- `sites/rizom/src/canvases/roots.canvas.js`
- `sites/rizom/src/canvases/constellation.canvas.js`
- `sites/rizom/src/canvases/products.canvas.js`
- `sites/rizom/src/sections/ecosystem/*`
- `sites/rizom/src/compositions/ecosystem.ts`
- `shared/theme-rizom/*`

### Transition pieces to simplify or move

These should no longer define the ownership model:

- `sites/rizom/src/layouts/create-rizom-layout.tsx`
- any shared `RizomShellModel` or shell-type config
- `sites/rizom/src/components/Header.tsx`
- `sites/rizom/src/components/Footer.tsx`
- `sites/rizom/src/components/SideNav.tsx`

Goal:

- replace HOC layout with plain frame + wrapper-local layout components
- stop routing wrapper chrome through one shared shell object

### Wrapper-owned code

Each wrapper should own:

- `src/layout.tsx`
- wrapper-local chrome composition
- route export
- wrapper plugin override for app identity/canvas path
- all app-specific templates and sections

## Next implementation slice

### Slice 1: remove HOC layout pattern

1. replace shared layout helper with a plain shared frame component
2. add `layout.tsx` to each wrapper
3. move header/footer/side-nav composition into wrapper layouts
4. stop exporting or relying on `createRizomLayout`
5. stop exporting or relying on a shared shell model

Deliverable:

- wrappers own their layout composition explicitly
- shared package owns only frame/runtime primitives

### Slice 2: simplify chrome ownership

Choose the smaller correct cut:

Option A:

- keep `Header`, `Footer`, and `SideNav` shared temporarily
- change them to direct props
- remove shell object indirection

Option B:

- move `Header`, `Footer`, and `SideNav` into wrappers entirely

Preferred default:

- take the smallest path that eliminates the shell object first
- do not keep the shell object just because the components happen to remain shared for one more step

### Slice 3: extract shared primitives into a real shared package

After wrapper layouts are explicit, move remaining reusable code out of `sites/rizom` into a proper shared abstraction.

Initial candidates:

- frame component
- UI primitives
- product card primitive
- shared canvas runtime assets
- maybe ecosystem if it remains family-owned

## Plugin rule

Shared plugin code should stay narrow.

It should only care about:

- shared boot script registration
- static asset exposure
- optional legacy direct-consumer compatibility while transition lasts

It should not become the place where app layout, nav, or footer ownership lives.

## Current app snapshot

### `rizom.ai`

Now owns:

- wrapper routes
- AI templates/sections
- wrapper plugin identity/canvas selection
- tracked site content

Open work:

- wrapper-owned explicit layout component
- remove any remaining dependence on shared shell/chrome patterns
- later standalone extraction to app-local `src/site.ts`

### `rizom.foundation`

Now owns:

- wrapper routes
- foundation templates/sections
- wrapper plugin identity/canvas selection
- tracked site content

Open work:

- wrapper-owned explicit layout component
- remove any remaining dependence on shared shell/chrome patterns
- later standalone extraction to app-local `src/site.ts`

### `rizom.work`

Now owns:

- wrapper routes
- work templates/sections
- wrapper plugin identity/canvas selection
- tracked site content

Open work:

- wrapper-owned explicit layout component
- remove any remaining dependence on shared shell/chrome patterns
- later standalone extraction to app-local `src/site.ts`

## Extraction follow-through

Once a wrapper's ownership is explicit enough, extraction should follow the published standalone shape from `brain init`, not a monorepo-only special case.

Current extraction blocker for `rizom.ai` remains the same:

- monorepo site packages are not yet the final published consumable shape
- so extraction eventually needs either published shared packages or vendored app-local `src/site.ts` ownership

That is another reason to prefer:

- plain wrapper-owned layout components
- plain shared primitives
- less magic in `sites/rizom`

## Order

Recommended order now:

1. remove HOC layout + shared shell object
2. make wrapper layouts explicit normal components
3. simplify or move header/footer/side-nav ownership
4. extract remaining reusable primitives into a proper shared package
5. keep `ecosystem` family-owned or move it to that shared package if still appropriate
6. extract apps to standalone repos only after layout ownership is clean

## Non-goals

- do not reintroduce a variant-driven pseudo-site in `sites/rizom`
- do not keep a shared shell config blob as the architecture
- do not hide wrapper ownership behind factories or indirect binding
- do not mix content-polish work into this refactor

## Verification

This plan is working when:

1. each wrapper has its own explicit `layout.tsx`
2. `sites/rizom` no longer exports or depends on a higher-order layout helper
3. `sites/rizom` no longer defines ownership through a shared shell object
4. wrappers are visibly the real owners of layout/chrome/routes/templates
5. shared Rizom code is obviously primitive/shared code, not a disguised site
6. extraction into app-local `src/site.ts` becomes straightforward

## Related

- `docs/plans/public-release-cleanup.md`
