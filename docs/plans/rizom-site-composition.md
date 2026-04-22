# Plan: Rizom Site Composition and Extraction

## Decision

The Rizom site family (rizom.ai, rizom.foundation, rizom.work) should be treated as **one shared site core with three app-owned variants**. The non-overlapping (per-domain) parts live **in the apps**, not in shared packages. The current extraction direction is **apps-only**: keep the shared Rizom site/theme layer in `brains`, and move the deployable app instances into separate per-app repos.

Target shape:

- **One** composable shared site definition (`sites/rizom`) owns the common 90%: routes, default layout, default templates, default sections, and shared Rizom runtime/plugin/static-asset structure.
- **Each** `apps/rizom-*` grows real `src/` containing its own app-local composition, per-domain sections/copy, and any overrides. When an app wants a local skin, it should own that in app-local source (`src/site.ts` and, if needed, `src/theme.css`). Each app's `brain.yaml` and `brain-data/` stay where they are.
- The current `sites/rizom-*` wrapper packages collapse **into** each app's local source.
- The Rizom-specific shared packages that are really part of the shared site (`rizom-ui`, `rizom-runtime`, `rizom-ecosystem`) collapse **into** that shared site. `shared/theme-rizom` stays separate unless there is an explicit later decision to undo site/theme decoupling.

Once that shape lands, the extraction boundary becomes clear: `sites/rizom` and `shared/theme-rizom` stay in `brains` as reusable shared packages, while `rizom.ai`, `rizom.foundation`, and `rizom.work` can move into their own repos for deploy isolation.

Do **not**:

- reintroduce a parameterized `sites/rizom` base with config knobs for per-site variation
- grow Rizom-specific shared packages to capture differences between the three sites
- duplicate the shared Rizom site/theme layer into each app repo

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
- The Rizom apps now use `brain-data/site-info/site-info.md` as the source of truth for site-wide title/description defaults, CTA data, and copyright/meta labels; app-local `routes.ts` stays focused on page structure and page-specific overrides.

The main architectural cleanup is now complete: `sites/rizom` is the single shared Rizom source package, the old wrapper packages are gone, the old Rizom-only shared packages have been removed, and the shared-vs-local theme boundary is now in the intended shape.

## Extraction and CI/CD status

### Extraction

Extraction is now an **active follow-through**, not a deferred idea.

What is true now:

- the Rizom site family is in the intended smaller shape for apps-only extraction: shared `sites/rizom` core + `shared/theme-rizom` + three app-owned variants
- there is now a concrete operational reason to isolate the deployable apps: unrelated monorepo commits currently trigger fragile site deploy paths too often
- the current extraction target is **one repo per deployable app** (`rizom.ai`, `rizom.foundation`, `rizom.work`), while the shared Rizom site/theme layer stays in `brains`
- `sites/rizom` should become a reusable shared package consumed by multiple app repos rather than something extracted into its own Rizom-specific repo

What is **not** true now:

- there is no current plan to extract a combined `rizom-sites` repo
- there is no current plan to copy the shared Rizom site/theme layer into three separate repos
- there is no reason to block app extraction on full in-monorepo deploy convergence first if the shared package boundary is made reusable

### CI/CD

The site-architecture work is ahead of the deploy-workflow cleanup.

Current status:

- repo-level CI exists and covers install, typecheck, lint, and tests
- shared model-image publishing exists for the deployable brain models used by the Rizom sites
- `rizom.ai` now owns its deploy workflow/config in its extracted standalone repo
- `rizom.foundation` and `rizom.work` are the remaining in-repo Rizom apps and are **not yet** fully converged on the same extracted deploy scaffold

So the correct status is:

- architecture: largely complete
- extraction: active, with an apps-only target
- CI: in place
- CD: partially converged, with `rizom.ai` ahead of `rizom.foundation` and `rizom.work`

The next infrastructure follow-through here is to complete the theme-hardening cleanup first, then make `sites/rizom` and `shared/theme-rizom` consumable outside the monorepo, then extract the Rizom apps one by one instead of expanding the current in-monorepo deploy setup.

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

## Completed work

The site-composition refactor itself is done.

Completed:

- `sites/rizom` is the single shared Rizom site core
- the old Rizom-only shared packages were collapsed into `sites/rizom`
- the old `sites/rizom-*` wrapper packages were removed
- all three apps now boot from app-local `src/site.ts`
- the shared-vs-local theme boundary is in the intended shape
- the `site-info` boundary is now in the intended shape: site-wide title/description defaults, CTA data, and copyright/meta labels come from `brain-data/site-info/site-info.md`, while app-local `routes.ts` remains page-structure-focused

That means the architecture is now in the intended steady state:

- shared structure in `sites/rizom`
- shared family theme in `shared/theme-rizom`
- per-site variation in app-local source under `apps/rizom-*`

## Remaining work

### 1 — harden the shared Rizom theme before extraction

The first remaining follow-through is theme cleanup for apps-only extraction.

Do next:

- complete the work tracked in [rizom-theme-hardening.md](./rizom-theme-hardening.md)
- replace the app-named Rizom variant API with a neutral visual-profile API
- move the current typography overrides onto that neutral profile layer instead of keying them to app names
- keep the shared theme as the single source of Rizom family semantics while preserving app-local additive overrides only where needed

Exit criteria:

- the shared Rizom theme/profile API no longer leaks app names
- current typography differences are expressed as neutral shared profiles
- extraction no longer depends on carrying app-specific theme semantics out of the monorepo

### 2 — make the shared Rizom layer reusable outside the monorepo

The next remaining follow-through is package-boundary cleanup for apps-only extraction.

Do next:

- make `sites/rizom` consumable as a stable shared package by app repos instead of relying on monorepo-only workspace wiring
- do the same for `shared/theme-rizom` if extracted apps still depend on the shared family theme directly
- keep the shared/core boundary stable: shared structure/theme in framework packages, per-site variation in app-local source
- update any docs, release metadata, or package settings that still assume the Rizom apps only run from this monorepo

Exit criteria:

- a Rizom app can consume the shared Rizom site/theme layer without depending on workspace-local package resolution
- the shared Rizom layer remains single-source in `brains`
- extraction no longer requires moving `sites/rizom` itself

### 3 — extract the deployable apps one by one

Once the shared package boundary is reusable, extract the deployable app instances into separate repos for deploy isolation.

Do next:

- choose a pilot app for the first extraction
- move only the app repo boundary, not the shared Rizom site/theme packages
- preserve app-local ownership of `brain.yaml`, `brain-data/`, `src/site.ts`, and deploy configuration in each extracted repo
- use the first extraction to validate the dependency, release, and deploy story before moving the other two apps

Exit criteria:

- at least one Rizom app runs from its own repo against the shared Rizom packages still hosted in `brains`
- unrelated `brains` commits no longer trigger that app's deploy path
- the remaining two app extractions are mechanical follow-through rather than a new architecture decision

## What not to do

- do not reintroduce `sites/rizom` as a parameterized base
- do not grow Rizom-specific shared packages alongside `sites/rizom`
- do not add config knobs to the shared site to handle per-app variation — put the variation in the app
- do not collapse `shared/theme-rizom` into the site unless there is an explicit separate decision to reverse site/theme decoupling
- do not extract `sites/rizom` into a separate `rizom-sites` repo as part of this step
- do not duplicate the shared Rizom site/theme layer into each app repo
- do not turn the theme follow-through into a new abstraction system; keep it to additive local overrides over the shared base theme
- do not bundle content/CTA/product polish into this refactor

## Verification

This plan is successful when:

1. `sites/rizom` remains the shared Rizom site core inside `brains`
2. `shared/theme-rizom` remains the separate shared family theme
3. each Rizom app repo owns its own variant and overrides in app-local source
4. no parameterized base or new Rizom-specific shared-package fan-out reappears
5. `brain-data/site-info/site-info.md` remains the real source of truth for site-wide identity and chrome defaults
6. at least one extracted Rizom app runs against the shared Rizom packages without monorepo-only workspace coupling
7. unrelated `brains` commits no longer force deploy churn for extracted Rizom apps

## Related

- `docs/plans/rizom-theme-hardening.md`
- `docs/plans/rizom-site-tbd.md`
- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
- `docs/plans/rover-test-apps.md`
