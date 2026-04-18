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
- The Rizom apps currently underuse `site-info`: route `title` / `description` and layout chrome are still mostly hardcoded in app-local `routes.ts` and `layout.tsx` instead of being driven by `brain-data/site-info/site-info.md`.

The main architectural cleanup is now complete: `sites/rizom` is the single shared Rizom source package, the old wrapper packages are gone, the old Rizom-only shared packages have been removed, and the shared-vs-local theme boundary is now in the intended shape.

## Extraction and CI/CD status

### Extraction

Extraction is now a **later decision**, not an active part of the refactor.

What is true now:

- the Rizom site family is in the intended smaller shape for a future move if we ever want one: shared `sites/rizom` core + `shared/theme-rizom` + three app-owned variants
- the current roadmap is to **keep the Rizom apps in this monorepo** unless a concrete operational reason appears
- valid reasons to revisit extraction later would be things like CI cost, contributor isolation, confidentiality, or deploy/release ownership boundaries

What is **not** true now:

- there is no current plan to extract Rizom just because the architecture cleanup is done
- there is no current plan to split the three Rizom apps into separate repos
- there is no current need to publish new framework packages to make extraction possible

### CI/CD

The site-architecture work is ahead of the deploy-workflow cleanup.

Current status:

- repo-level CI exists and covers install, typecheck, lint, and tests
- shared model-image publishing exists for the deployable brain models used by the Rizom sites
- `rizom.ai` has an in-repo deploy workflow (`.github/workflows/rizom-ai-deploy.yml`) plus app-local deploy config
- `rizom.foundation` and `rizom.work` are **not yet** fully converged on the same checked-in app-local deploy scaffold in this repo

So the correct status is:

- architecture: largely complete
- extraction: deferred
- CI: in place
- CD: partially converged, with `rizom.ai` ahead of `rizom.foundation` and `rizom.work`

The next infrastructure follow-through here is to converge the remaining Rizom app deploys on the current `brain init --deploy` / Kamal scaffold shape rather than inventing a separate Rizom-specific deployment path.

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

That means the architecture is now in the intended steady state:

- shared structure in `sites/rizom`
- shared family theme in `shared/theme-rizom`
- per-site variation in app-local source under `apps/rizom-*`

## Remaining work

### 1 — fix the `site-info` boundary

The most immediate architecture follow-through is to stop hardcoding site-wide identity in app code when `siteInfo` is already available at layout render time.

Current mismatch:

- `RizomLayoutProps` already includes `siteInfo`
- app-local `layout.tsx` files currently hardcode most header/footer/CTA chrome
- app-local `routes.ts` files currently hardcode top-level page `title` / `description`
- `brain-data/site-info/site-info.md` is present but mostly placeholder and not acting as the real source of truth

Do next:

- make the Rizom layouts actually consume `siteInfo`
- move site-wide identity/chrome data out of app-local hardcoded constants where appropriate:
  - default title / description
  - primary CTA
  - footer/meta/copyright
  - any nav/footer links that should be content-managed rather than code-owned
- keep `routes.ts` focused on page structure, sections, and page-specific overrides
- decide explicitly which values stay route-local and which become site-wide defaults
- update the current Rizom file set consistently:
  - `apps/rizom-ai/src/layout.tsx`
  - `apps/rizom-ai/src/routes.ts`
  - `apps/rizom-ai/brain-data/site-info/site-info.md`
  - `apps/rizom-foundation/src/layout.tsx`
  - `apps/rizom-foundation/src/routes.ts`
  - `apps/rizom-foundation/brain-data/site-info/site-info.md`
  - `apps/rizom-work/src/layout.tsx`
  - `apps/rizom-work/src/routes.ts`
  - `apps/rizom-work/brain-data/site-info/site-info.md`

Discipline rule:

- if a value is truly site-wide, prefer `site-info`
- if a value is page-specific, keep it in `routes.ts`
- do not leave the same semantic value duplicated in both places without an explicit override rule

Exit criteria:

- `brain-data/site-info/site-info.md` is the obvious source of truth for site-wide identity
- app-local `routes.ts` no longer duplicates site-wide metadata by default
- layout chrome is no longer silently split between placeholder `site-info` content and hardcoded constants
- each Rizom app follows the same boundary rule for site-wide vs page-local data

### 2 — deploy scaffold convergence

The next remaining follow-through is deployment scaffolding.

Do next:

- converge `rizom.foundation` and `rizom.work` on the same app-local deploy scaffold shape already exercised by `rizom.ai`
- keep Rizom app deploy workflows aligned with the current `brain init --deploy` / Kamal templates
- update any lingering docs, tests, or codebase maps that still describe the pre-consolidation deploy shape

Exit criteria:

- the remaining Rizom app deploy workflows are reconciled onto the current shared scaffold shape
- deploy drift is no longer a reason to reconsider extraction prematurely

### 3 — decide later whether to extract

After the refactor, the Rizom footprint is small enough that extraction would now be a separate operational decision rather than an architectural rescue.

Current decision: **do not extract now**.

Revisit extraction only if one of these becomes materially true:

- Rizom-specific CI/CD ownership or churn justifies isolation
- contributor or confidentiality boundaries require a separate repo
- release cadence or operational ownership diverges enough from the framework repo to justify the split

Until then, keep the Rizom apps in the monorepo and finish deploy-workflow convergence first.

Exit criteria:

- extraction is reconsidered only against real operational motivation
- deploy convergence is complete before any extraction decision is reopened

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

1. `sites/rizom` remains the shared Rizom site core
2. `shared/theme-rizom` remains the separate shared family theme
3. each `apps/rizom-*` continues to own its own variant and overrides in app-local source
4. no parameterized base or new Rizom-specific shared-package fan-out reappears
5. `brain-data/site-info/site-info.md` is the real source of truth for site-wide identity and chrome defaults
6. the remaining Rizom deploy workflows are reconciled onto the shared app-local scaffold shape
7. extraction stays deferred unless a concrete operational reason appears

## Related

- `docs/plans/rizom-site-tbd.md`
- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
- `docs/plans/rover-test-apps.md`
