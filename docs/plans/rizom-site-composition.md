# Plan: Rizom Site Composition and Extraction

## Decision

The Rizom site family (rizom.ai, rizom.foundation, rizom.work) should be treated as **one shared site core with three app-owned variants**. The non-overlapping (per-domain) parts live **in the apps**, not in shared packages.

Target shape:

- **One** composable shared site definition (`sites/rizom`) owns the common 90%: routes, default layout, default templates, default sections, and shared Rizom runtime/plugin/static-asset structure.
- **Each** `apps/rizom-*` grows real `src/` containing its own app-local composition, per-domain sections/copy, and any overrides. When an app wants a local skin, it should own that in app-local source (`src/site.ts` and, if needed, `src/theme.css`). Each app's `brain.yaml` and `brain-data/` stay where they are.
- The current `sites/rizom-*` wrapper packages collapse **into** each app's local source.
- The Rizom-specific shared packages that are really part of the shared site (`rizom-ui`, `rizom-runtime`, `rizom-ecosystem`) collapse **into** that shared site. `shared/theme-rizom` stays separate unless there is an explicit later decision to undo site/theme decoupling.

Once that shape lands, extraction to a separate `rizom-sites` repo becomes a small move (shared site + shared theme + 3 apps), not a large untangling. Whether to extract is a second-stage decision.

Do **not**:

- reintroduce a parameterized `sites/rizom` base with config knobs for per-site variation
- grow Rizom-specific shared packages to capture differences between the three sites
- publish new framework packages just to enable extraction

## Why this shape

The previous architecture (one shared `sites/rizom` base + thin app shells consuming it via config) was abandoned because the base grew weird abstractions whenever one site needed to differ. The reaction was three independent wrapper packages with shared code factored into four `shared/rizom-*` packages. That state is in-between: it's the average of "one parameterized base" (too rigid) and "three independent sites" (over-duplicates aesthetics), and it leaves seven Rizom-shaped packages to maintain and eventually extract.

Putting commonality in a shared site and divergence in app `src/` resolves the tension without re-introducing config-driven parameterization. The shared site is _composable_, not parameterized — apps consume it as building blocks and override pieces in their own source code.

### The discipline rule

When one site needs something different, add it to that app's `src/`. Never grow a config knob on the shared site to handle per-app variation. The shared site only grows when something genuinely becomes common to all three.

This rule is what prevents drift back into the old `sites/rizom` pattern. Without it, the shared site accretes parameterization and we end up where we started.

## Current state

- `apps/rizom-*` now have local `src/site.ts` ownership for their final route trees and layout composition.
- `sites/rizom` now exists as the shared Rizom site core.
- `sites/rizom` now owns the shared Rizom runtime, UI, and ecosystem seams.
- `shared/theme-rizom` remains the separate shared theme.
- additive app-local theme layering now exists via `site.themeOverride`, so local `src/theme.css` appends after the shared base theme instead of replacing it.
- `apps/rizom-foundation/src/theme.css` and `apps/rizom-work/src/theme.css` now own app-specific polish; `rizom.ai` currently does not need a local theme override file.
- `shared/theme-rizom` now keeps shared Rizom family tokens, utilities, variant semantics, and current-site ecosystem semantics rather than app-specific section styling.
- All three apps are repo-backed via `directory-sync`; durable content lives in tracked `brain-data/site-content`.

The main architectural cleanup is now complete: `sites/rizom` is the single shared Rizom source package, the old wrapper packages are gone, the old Rizom-only shared packages have been removed, and the shared-vs-local theme boundary is now in the intended shape.

## Theme follow-through status

The theme follow-through is now complete enough to stop treating it as a separate architecture phase.

What landed:

- minimal runtime support for shared base theme + additive local override layering
- app-local theme ownership for the two apps that actually need it:
  - `apps/rizom-foundation/src/theme.css`
  - `apps/rizom-work/src/theme.css`
- no forced `apps/rizom-ai/src/theme.css` fork; `rizom.ai` continues to use the shared theme directly
- a reduction in bespoke `foundation-*` and `work-*` hook selectors by moving section-local styling into JSX/Tailwind and app-local CSS variables
- a narrower `shared/theme-rizom` that now holds:
  - shared palette + semantic tokens
  - shared typography/utilities
  - shared variant semantics (`ai`, `foundation`, `work`)
  - shared current-site ecosystem-card semantics

Resulting boundary:

- `shared/theme-rizom` owns family-level semantics
- app-local `src/theme.css` owns only app-specific polish
- app-local JSX owns section-local layout/styling whenever that is clearer than maintaining a second CSS API

Remaining work here is no longer architectural cleanup. It is normal product/content polish tracked elsewhere (for example CTA destinations, newsletter/quiz/contact details in `docs/plans/rizom-site-tbd.md`).

### Discipline rules retained after the cleanup

- Do not collapse `shared/theme-rizom` into `sites/rizom`
- Do not turn local `src/theme.css` into full copies of the shared theme
- Do not introduce a new config-heavy theme framework
- Keep app-specific section styling out of the shared theme unless it genuinely becomes common across the whole Rizom family
- Prefer Tailwind + CSS variables over bespoke one-off literals when cleaning future drift

## Implementation prep

### Existing seams we should reuse, not redesign

The current codebase already has the main seam this refactor wants:

- `sites/rizom/src/runtime/base-site.ts` now defines `rizomBaseSite`
- app-local site ownership is already a supported runtime convention via `apps/<name>/src/site.ts`
- app-local theme ownership is already a supported runtime convention via `apps/<name>/src/theme.css`
- `sites/rizom` now re-exports the shared Rizom UI/runtime/ecosystem surface from one place

So the refactor should start by **moving and renaming existing seams**, not by inventing a new site API.

### Concrete impact map

Expected code touch points for the remaining refactor:

- keep evolving `sites/rizom/src/index.ts` as the shared site entrypoint
- continue maintaining local app source under:
  - `apps/rizom-ai/src/site.ts`
  - `apps/rizom-foundation/src/site.ts`
  - `apps/rizom-work/src/site.ts`
- update instance config at:
  - `apps/rizom-ai/brain.yaml`
  - `apps/rizom-foundation/brain.yaml`
  - `apps/rizom-work/brain.yaml`
- update structural tests and assumptions such as:
  - `shell/app/test/site-package-structure.test.ts`
  - any docs/codebase maps that still describe `sites/rizom-*` as the long-term shape

### Safe coding order

This was the successful implementation order:

1. Keep `sites/rizom` as the single shared site entrypoint.
2. Move Rizom-only shared helpers from `shared/rizom-ui`, `shared/rizom-runtime`, and `shared/rizom-ecosystem` into that shared site.
3. Keep all three apps booting from local `src/site.ts` while shared code is consolidated.
4. Delete stale references only after the shared-package collapse is complete.

That order minimized simultaneous breakage and used the already-supported local-site runtime path.

### Targeted validation while implementing

Use the lightest checks that prove each seam still works:

- after introducing `sites/rizom`: targeted typecheck for the new shared site package and any moved shared Rizom code
- after converting each app: boot that app locally from its directory and verify the local `src/site.ts` path resolves
- after removing the wrapper packages: update and run `shell/app/test/site-package-structure.test.ts`
- before calling the refactor done: run workspace lint, typecheck, and the relevant site/app tests

The key regression to watch for is not type shape alone — it is whether `brain.yaml` without `site.package` correctly picks up app-local `src/site.ts` and preserves the prior rendered output.

## Refactor plan

### Step 1 — establish the shared site

Create `sites/rizom` (reusing `@brains/site-rizom` if desired) as a composable site definition. It exposes:

- the common route set
- the default layout
- the default templates
- the default section components
- the shared Rizom runtime/plugin/static-asset structure

Composability shape: each piece can be imported, extended, or replaced by an app. Avoid configuration objects that try to anticipate per-app variation.

Exit criteria:

- `sites/rizom` exists and exports the common building blocks
- no per-site assumptions in its source

### Step 2 — collapse the Rizom-specific shared site packages into the shared site

This step has now been completed for the old shared Rizom packages that lived at:

- `shared/rizom-ui`
- `shared/rizom-runtime`
- `shared/rizom-ecosystem`

`sites/rizom` now owns that shared Rizom code directly. `shared/theme-rizom` remains the separate shared theme.

Exit criteria:

- `shared/rizom-ui`, `shared/rizom-runtime`, and `shared/rizom-ecosystem` are removed from the workspace
- nothing outside `sites/rizom` imports `@brains/rizom-ui`, `@brains/rizom-runtime`, or `@brains/rizom-ecosystem`
- `shared/theme-rizom` remains independently consumable

### Step 3 — fold each wrapper into its app's local source

This step has now been completed for the former wrapper packages that lived at `sites/rizom-ai`, `sites/rizom-foundation`, and `sites/rizom-work`.

- move the wrapper-owned `src/` into the corresponding app as local source, centered on `apps/rizom-*/src/site.ts` with helper modules alongside it as needed
- update imports so the app composes from `@brains/site-rizom` instead of `@brains/site-rizom-*`
- remove the explicit `site.package` ref from `brain.yaml` once the app is using the local `src/site.ts` convention
- only remove an explicit `site.theme` ref if the app also adopts a local `src/theme.css`; otherwise keep using the shared Rizom theme explicitly
- delete the wrapper package and its workspace entry

After this, each app owns its variant and overrides directly. Imports from `@brains/site-rizom` provide the common 90%.

Exit criteria:

- `sites/rizom-*` wrapper packages are removed from the workspace
- each `apps/rizom-*` boots from its own local `src/site.ts`

### Step 4 — verify and clean up

- `bun install`
- typecheck and lint the workspace
- boot all three apps; verify they render the same as before the refactor (skins intact, content unchanged)
- delete the empty `sites/rizom/` leftover directory
- update docs, codebase maps, security/public-release inventory, and any tests that still reference `sites/rizom-*` or `shared/rizom-*` paths

Exit criteria:

- the repo contains `sites/rizom`, `shared/theme-rizom`, and three `apps/rizom-*` instances (with real `src/`) and nothing else Rizom-specific
- all three apps boot and visually match prior output

### Step 5 — decide later whether to extract

After the refactor, the Rizom footprint is a small set of things (shared site + shared theme + 3 apps). Whether to move them to a separate `rizom-sites` repo is then a small, separate decision driven by actual need (CI cost, repo size, confidentiality, contributor scope), not by the desire to escape an unmanageable tangle.

Do not extract until there is a concrete reason to.

Exit criteria:

- extraction is reconsidered against real motivation, not used as a forcing function for the architecture above

## What not to do

- do not reintroduce `sites/rizom` as a parameterized base
- do not grow Rizom-specific shared packages alongside `sites/rizom`
- do not add config knobs to the shared site to handle per-app variation — put the variation in the app
- do not collapse `shared/theme-rizom` into the site unless there is an explicit separate decision to reverse site/theme decoupling
- do not publish new framework packages to enable extraction
- do not split into three separate app repos
- do not turn the theme follow-through into a new abstraction system; keep it to additive local overrides over the shared base theme
- do not bundle content/CTA/product polish into this refactor

## Verification

This plan is successful when:

1. `sites/rizom` exists and owns the common Rizom site shape
2. `shared/rizom-ui`, `shared/rizom-runtime`, and `shared/rizom-ecosystem` are gone, collapsed into the shared site
3. `shared/theme-rizom` remains a separate theme unless a future explicit decision changes that boundary
4. the three `sites/rizom-*` wrapper packages are gone, folded into app-local `src/site.ts`
5. each `apps/rizom-*` owns its own variant and any overrides in its own source
6. all three apps still boot and visually match prior output
7. no parameterized base or shared-package fan-out has reappeared

## Related

- `docs/plans/rizom-site-tbd.md`
- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
- `docs/plans/rover-test-apps.md`
