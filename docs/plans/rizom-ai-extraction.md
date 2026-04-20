# Plan: rizom.ai Pilot Extraction

## Status

Proposed.

This plan covers **only** `rizom.ai` as the first apps-only extraction pilot.

## Decision

Use `rizom.ai` as the first extracted Rizom app repo.

Do **not** try to extract all three Rizom apps at once.
Do **not** extract the shared Rizom site/theme layer in this phase.

The goal is to prove that one deployable Rizom app can live outside the monorepo while still consuming the shared Rizom packages that remain in `brains`.

## Why `rizom.ai` first

`rizom.ai` is the lowest-risk pilot because it already has the cleanest validated path:

- the shared `sites/rizom` composition boundary is already in place
- the neutral theme-profile API is already in place
- the preview rebuild flow has already been validated on the running app
- `rizom.ai` has the least app-local theme complexity of the three Rizom apps
- its deploy path is already further along than the other Rizom apps

If `rizom.ai` can be extracted cleanly, the remaining work for `rizom.foundation` and `rizom.work` should become a smaller follow-through instead of a fresh architecture decision.

## Scope

### In scope

- extracting the deployable `rizom.ai` app into its own repo boundary
- making `rizom.ai` consume shared Rizom packages without monorepo-only workspace assumptions
- defining the standalone build, preview rebuild, and deploy workflow for `rizom.ai`
- documenting the exact dependency and release contract required for the extracted app

### Out of scope

- extracting `rizom.foundation`
- extracting `rizom.work`
- extracting `sites/rizom`
- extracting `shared/theme-rizom`
- new visual/theme redesign work
- broad deploy convergence for all Rizom apps in the same change

## Target boundary

### Stays in `brains`

- `sites/rizom`
- `shared/theme-rizom`
- shared framework packages
- shell/runtime internals
- shared deploy/tooling code unless explicitly duplicated for app-local use

### Moves with `rizom.ai`

- `apps/rizom-ai/brain.yaml`
- `apps/rizom-ai/src/`
- `apps/rizom-ai/brain-data/`
- `apps/rizom-ai/config/`
- app-local package metadata and scripts
- app-local deploy workflow/config needed to run the app independently

## Core questions to answer

1. **Shared package consumption**
   - How will the extracted app consume `sites/rizom`, `shared/theme-rizom`, and any other required shared packages?
   - Published package versions, git refs, or another release channel?

2. **Standalone install/build shape**
   - What does `package.json` need in the extracted app repo?
   - Which scripts remain app-local versus framework-provided?

3. **Standalone runtime shape**
   - What exact files must exist for `brain start`, preview rebuilds, and deploys to work outside the monorepo?

4. **Deploy contract**
   - Which workflow/config pieces from the current repo must move into the extracted app repo?
   - Which secrets/env vars are required?

5. **Content and sync contract**
   - How does the extracted app keep its current content-repo linkage and `directory-sync` behavior?

## Workstreams

### 1. Audit `rizom.ai` for monorepo coupling

Identify everything in `apps/rizom-ai` that assumes it lives inside this repo.

Check for:

- workspace-only package resolution
- repo-relative scripts or paths
- imports that depend on unpublished internals
- root-level CI/deploy assumptions
- docs/instructions that only make sense from monorepo root

Deliverable:

- a short list of coupling points grouped into:
  - already safe
  - must be replaced before extraction
  - can stay if a shared package is published first

## Initial audit findings

### Already safe

- `brain.yaml`, `brain-data/`, app-local `src/`, and `config/deploy.yml` already live under `apps/rizom-ai/`
- `tsconfig.json` already extends the published `@rizom/brain/tsconfig.instance.json` entrypoint rather than a repo-local file
- `src/site.ts` already composes from the shared package boundary instead of importing repo-local `sites/rizom` source by relative path
- the runtime rebuild verification flow is already known and validated for `rizom.ai`

### Must change before extraction

#### Boundary fix needed first

The current extraction blocker is a **site/site-content boundary** that has started to be corrected but is not finished yet:

- `@brains/site-rizom` now owns **site logic**
- `apps/rizom-ai` owns **site-content logic** in `src/sections/*`
- dependency publishing decisions should follow that split instead of the old mixed contract

Current `@brains/site-rizom` scope:

- `createRizomSite`
- runtime plugin/config
- base layout
- shared UI primitives and helpers
- explicit content namespace registration (`contentNamespace`)
- no shared ecosystem template/content ownership

Current `rizom.ai` site-content scope:

- `src/sections/*` templates, schemas, formatters, layouts
- `src/templates.ts` content assembly
- app-owned ecosystem section content stored like the other landing-page sections
- route references under the content namespace `landing-page:*`

This has now landed for `rizom.ai`.

`rizom.ai` now declares landing-page content in app-owned `src/site-content.ts`, and `@brains/site-content` derives/registers the underlying templates from that definition.

After this boundary correction, the publishing/extraction contract is smaller and clearer.

- `apps/rizom-ai/package.json` is still partly monorepo-oriented:
  - `@rizom/brain` is still pinned as `workspace:*`
  - default `start` now uses `bunx brain start`
  - old workspace-specific path is retained explicitly as `start:workspace`
- `apps/rizom-ai/package.json` does not explicitly declare the shared package still imported by `src/`
  - `@brains/site-rizom`
- `apps/rizom-ai/README.md` still assumes monorepo context:
  - repo-root `bun install`
  - `../../` links into monorepo package locations
  - deploy language assumes the current repo-level workflow shape
- the current deploy workflow is root-owned, not app-owned:
  - `.github/workflows/rizom-ai-deploy.yml` lives in `brains`, not under the app repo boundary
- the current deploy workflow uses monorepo-relative build assets and scripts:
  - `bun ../../shell/app/scripts/build.ts`
  - `../../deploy/docker/Dockerfile.prod`
  - `../../deploy/docker/package.prod.json`
  - root-level `bun install --frozen-lockfile`

### Blocked on finishing the boundary cleanup, then shared package publishing

- the extracted app cannot be made standalone until the **site logic vs site-content logic** split is finished cleanly
- only after that split is clear does the publishing/versioning question become well-scoped
- if `@rizom/brain` remains the public CLI/runtime entrypoint, the extracted app still needs compatible published versions of the packages it actually consumes after the boundary cleanup

### Concrete imported shared packages in `apps/rizom-ai/src`

- `@brains/site-rizom`

This import is now effectively standing in for shared Rizom UI/layout authoring.
That is the wrong long-term package boundary: `@brains/site-rizom` should remain the actual Rizom site package, and the shared app-facing UI surface should move to a dedicated Rizom UI package.

### Current app contract after boundary cleanup

**Site layer imports**

- `@brains/site-rizom`
  - app layout/components that currently use shared Rizom UI primitives

`src/site.ts` no longer composes `createRizomSite(...)` directly.
Rizom site/theme defaults now come from the selected brain model, and local `src/site.ts` only supplies app-local site overrides.

What remains here is shared Rizom UI authoring, not site composition.
Those imports should move out of `@brains/site-rizom` and into a dedicated shared Rizom UI package.

**Content authoring imports removed from app code**

`apps/rizom-ai/src` no longer imports:

- `@brains/templates`
- `@brains/utils`

Those low-level authoring concerns now route through app-owned `src/site-content.ts` plus `@brains/site-content`.

**Content namespace**

- app-owned landing-page content now registers under `landing-page:*`
- runtime plugin id remains separate (`rizom-site`)

**Site-content plugin usage**

- durable `site-content` is provided through the plugin/runtime layer
- today, Rizom apps get it from the selected brain model preset (`brain: ranger`, `preset: default`)
- `brains/ranger/src/index.ts` includes `site-content` in the `default` preset and capability list
- app `brain.yaml` does **not** need to import or configure `@brains/site-content` directly for normal use
- the extracted app should **not** import `@brains/site-content` directly from app source
- `@brains/site-content` now owns landing-page content definition/wiring for `rizom.ai`
- `shell/app` now supports conventional local `src/site-content.ts` loading and bundling
- `@brains/site-content` should be treated as runtime infrastructure, not an app dependency blocker

### Immediate implication

The first extraction blocker is **not** package publishing by itself. It was the remaining site-content registration gap.

That gap is now closed for `rizom.ai`:

- `site-rizom` is on the correct site-only boundary
- durable `site-content` belongs to the plugin/runtime layer
- landing-page content definition/wiring now runs through `@brains/site-content`
- `apps/rizom-ai/src` no longer imports low-level schema/template/formatter authoring primitives directly

The remaining work is now the actual extraction contract work:

- declare the real runtime/build dependencies explicitly
- stop relying on `workspace:*`
- replace monorepo-only scripts and deploy assets
- optionally simplify `site-rizom` further once the remaining Rizom apps migrate

### 2. Define the shared dependency contract

List the exact shared packages `rizom.ai` depends on after extraction.

For each dependency, decide:

- package name
- whether it must be published first
- versioning strategy
- pinning strategy for the pilot

#### Current dependency matrix

| Package              | Current role in `rizom.ai`                                                     | Current state     | Pilot status                                                                    |
| -------------------- | ------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------- |
| `@rizom/brain`       | public CLI/runtime, tsconfig preset                                            | public, versioned | usable now once `workspace:*` is replaced with a real version                   |
| `@brains/site-rizom` | Rizom site/default wiring package; currently also carrying app-facing UI usage | **private**       | should remain the site package, but stop being the app-facing shared UI surface |
| `@brains/rizom-ui`   | planned shared Rizom UI/layout authoring package                               | not created yet   | intended destination for remaining app-visible shared Rizom UI imports          |

#### Current constraint

After the boundary cleanup and `rizom.ai` migration, the remaining problem is no longer low-level content authoring in app source.

The remaining extraction constraints are now:

- `apps/rizom-ai/package.json` still uses a monorepo-oriented dependency choice (`@rizom/brain: workspace:*`)
- deploy workflow/assets are still repo-owned
- `@brains/site-rizom` still carries temporary `contentNamespace` / `templates` passthrough for the not-yet-migrated Rizom apps
- `apps/rizom-ai/src` still imports shared Rizom UI/layout primitives from private `@brains/site-rizom`

So extraction still needs one more explicit answer: keep `@brains/site-rizom` as the actual Rizom site package, and move the remaining app-facing shared Rizom UI into a separate shared package.

#### Required order

**Step 1 — keep the corrected boundary**

Keep:

- **site logic** behind the brain model defaults
  - Rizom runtime
  - layout shell
  - shared UI
  - route/site composition
- **durable site-content** in `@brains/site-content`
  - stored route/section content entities
  - content operations/tools

`@brains/site-content` and `@brains/theme-rizom` should be treated as runtime defaults/infrastructure, not app dependencies.

`@brains/site-rizom` should also stop being an app dependency once app-local `src/site.ts` composition is removed.

**Step 2 — extend `@brains/site-content`**

Move landing-page content definition/wiring there:

- templates
- schemas
- formatters
- content namespace registration
- final template construction/registration

**Step 3 — reduce the app contract**

Make `rizom.ai` depend only on the layer it should actually own/consume after that split.

**Step 3 — decide publishing/public surface**

Only then decide what needs to be published or exposed publicly for extraction.

#### Recommendation

The missing answer is now explicit:

1. keep `@brains/site-rizom` as the actual Rizom site package
2. keep durable content on `@brains/site-content`
3. treat `site-content` and `theme-rizom` as runtime defaults/infrastructure, not app deps
4. introduce a dedicated shared Rizom UI package (for example `@brains/rizom-ui`) for app-facing Rizom UI/layout primitives
5. move remaining app-visible Rizom UI imports there instead of repurposing the site package into UI-only authoring
6. then finalize the remaining package pinning / deploy contract

Only after that should the public/export decision be finalized.

#### Immediate pilot contract

Before dry-run extraction, define:

- what the **Rizom site package** is
- what the **shared Rizom UI package** is
- what the **site-content layer** for Rizom is
- how `@brains/site-content` owns landing-page content definition/wiring
- which of `rizom.ai`'s current imports disappear once the shared Rizom UI package exists
- how durable `site-content` is supplied through plugin/preset/runtime without direct app imports
- whether extraction continues to rely on `brain: ranger` / `preset: default`, or needs an explicit equivalent runtime contract
- only then the exact published versions and package names to pin

#### Proposed package/file split

**Rizom site package**

- `@brains/site-rizom`
  - remains the actual Rizom site package
  - owns runtime plugin/static assets/default layout/base site
  - owns `createRizomSite(...)`
  - remains the package used by brain-model default site wiring and transitional app `src/site.ts` composition

**Shared Rizom UI package**

- `@brains/rizom-ui` (name tentative)
  - owns only shared Rizom UI/layout authoring primitives
  - belongs in `shared/`, not `sites/`
  - should export only the minimum shared surface apps actually need

**Initial shared UI export target**

- `Badge`
- `Button`
- `Divider`
- `Footer`
- `Header`
- `ProductCard`
- `RizomFrame`
- `Section`
- `SideNav`
- `renderHighlightedText`

UI-local presentational types may remain exported if useful, but runtime/site-builder-facing contracts should not.

**Keep out of the shared UI package**

- `createRizomSite`
- `RizomRuntimePlugin`
- base site/runtime config/static asset exports
- `RizomLayoutProps`
- `socialLinksToRizomLinks`

`RizomLayoutProps` and social-link mapping should become app-local helpers so the shared UI package does not expose `SiteInfo` / site-builder contracts.

Deliverable:

- explicit dependency contract for the extracted app, based on the corrected boundary

#### Concrete target shape for landing-page content

The intended final shape is:

- app-owned `src/site.ts` keeps only **site logic**
- app-owned `src/site-content.ts` declares **landing-page content definitions**
- `@brains/site-content` performs the low-level template construction/registration internally
- app source stops importing `createTemplate`, `StructuredContentFormatter`, and eventually any low-level `z` helpers that only exist to satisfy the template plumbing layer

Target split:

**`src/site.ts`**

Owns only:

- `createRizomSite(...)`
- `themeProfile`
- layout shell
- routes

It should no longer own:

- `contentNamespace`
- template registration
- template assembly

**`src/site-content.ts`**

Owns only app content definition, for example:

- landing-page namespace
- section keys
- section layouts
- section field definitions / content shape
- section formatter metadata

It should not have to call low-level template helpers directly.

**`@brains/site-content`**

Owns:

- durable `site-content` entities
- content operations/tools
- content-namespace registration
- template construction from app-provided definitions
- final template registration with the render/template system

#### Concrete migration target for `rizom.ai`

Current app-owned files like:

- `src/sections/*/index.ts(x)`
- `src/sections/*/schema.ts`
- `src/sections/*/formatter.ts`
- `src/templates.ts`
- `src/sections/ecosystem.tsx`

should collapse toward app-owned **section definitions** that are consumed by `src/site-content.ts`, rather than exporting raw `Template` objects.

Conceptually, the end state looks like:

```ts
// src/site.ts
export default createRizomSite({
  packageName: "rizom-ai-site",
  themeProfile: "product",
  layout: AiLayout,
  routes: aiRoutes,
});
```

```ts
// src/site-content.ts
export default {
  namespace: "landing-page",
  sections: {
    hero: {
      description: "Rizom site hero — full-viewport intro with CTA row",
      layout: HeroLayout,
      title: "Hero Section",
      fields: {
        headline: { label: "Headline", type: "string" },
        subhead: { label: "Subhead", type: "string" },
        primaryCtaLabel: { label: "Primary CTA Label", type: "string" },
        primaryCtaHref: { label: "Primary CTA Href", type: "string" },
        secondaryCtaLabel: { label: "Secondary CTA Label", type: "string" },
        secondaryCtaHref: { label: "Secondary CTA Href", type: "string" },
      },
    },
    products: {
      description: "Rizom products section — array of product cards",
      layout: ProductsLayout,
      title: "Products Section",
      fields: {
        cards: {
          label: "Cards",
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            fields: {
              variant: {
                label: "Variant",
                type: "enum",
                options: ["rover", "relay", "ranger"],
              },
              label: { label: "Label", type: "string" },
              badge: { label: "Badge", type: "string" },
              headline: { label: "Headline", type: "string" },
              description: { label: "Description", type: "string" },
              tagline: {
                label: "Tagline",
                type: "array",
                optional: true,
                minItems: 1,
                items: { type: "string" },
              },
              tags: {
                label: "Tags",
                type: "array",
                minItems: 1,
                items: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};
```

This is the minimal intended shape:

- plain object export
- one declarative field definition replaces both the current schema file and formatter file
- `@brains/site-content` derives the runtime schema and markdown formatter internally from the same field metadata

Start with a plain object export.
Only introduce a helper if type inference or normalization becomes painful, and if so it should be generic to site content rather than landing-page-specific.

The important part is the ownership boundary:

- app provides high-level content definitions
- `@brains/site-content` owns the low-level template/schema/formatter wiring

#### Audit result against current `rizom.ai` sections

The current `rizom.ai` landing-page sections fit this shape without a custom formatter layer.

Covered directly by the proposed `fields` model:

- scalar strings (`hero`, `answer`, `mission`, `quickstart`)
- arrays of strings (`quickstart.okLines`, `products.tagline`, `products.tags`)
- arrays of objects (`problem.cards`, `ownership.features`, `products.cards`, `ecosystem.cards`)
- enums (`products.cards[].variant`, `ecosystem.cards[].suffix`)
- optional fields (`products.cards[].tagline`)
- array cardinality (`problem.cards.length(3)`, `minItems` cases in other sections)

Current `rizom.ai` does **not** appear to require:

- custom formatter functions
- custom parser functions
- computed template-time transforms in the formatter layer

So the first implementation target for `@brains/site-content` only needs to support:

- `string`
- `enum`
- `object`
- `array`
- `optional`
- `minItems`
- exact array length

#### Ecosystem should become normal content

Do **not** preserve `createEcosystemContent(...)` as a special helper path.

This cleanup has now landed for the current Rizom apps:

- ecosystem uses normal app-owned `brain-data/site-content/home/ecosystem.md` content
- each app owns its own ecosystem copy
- the special helper and inline route fallback were removed

That keeps the contract simpler:

- no special ecosystem content assembly path
- no active-site-specific content helper in the extraction boundary
- no redundant route-level fallback when stored `site-content` already exists
- all landing-page sections use the same site-content mechanism

The remaining migration should target the low-level authoring plumbing:

- remove `createTemplate(...)`
- remove `StructuredContentFormatter(...)`
- replace duplicated schema + formatter declarations with one field definition
- keep ecosystem on the same ordinary app-owned site-content path as every other section

#### Why skip the intermediate step

Do **not** add a temporary shape where apps merely move raw template registration into `@brains/site-content` but still construct raw templates themselves.

That would create migration churn without solving the real contract problem.

Go directly to the final target:

- `@brains/site-content` owns landing-page content definition/wiring
- apps stop depending on low-level authoring primitives

### 3. Define the standalone app repo shape

Specify the minimum repo contents for extracted `rizom.ai`.

Include:

- `package.json`
- `brain.yaml`
- `src/`
- `brain-data/`
- deploy config/workflow files
- env/secrets expectations

Deliverable:

- a concrete repo shape checklist

### 4. Define the standalone validation workflow

The extracted app must preserve the app-managed rebuild verification flow.

Required validation flow:

1. start app
2. trigger rebuild on the running app via MCP HTTP / `--remote`
3. inspect generated preview output
4. use preview first when configured

Deliverable:

- exact validation commands for the extracted app repo

### 5. Dry-run extraction

Before moving any real repo boundaries, do one dry-run extraction into a temporary directory or temporary repo clone.

Dry-run goals:

- install dependencies
- typecheck
- build
- start app
- trigger preview rebuild
- inspect generated preview output
- identify any remaining repo-coupled assumptions

Deliverable:

- a failure list or a signed-off dry-run

## Pilot checklist

- [x] `rizom.ai` imports are audited for monorepo coupling
- [x] required shared package dependencies are listed explicitly
- [x] site logic vs site-content boundary is made explicit in code
- [x] app-owned content namespace moved to `landing-page:*`
- [ ] shared-package release/pinning strategy is chosen for the pilot
- [ ] keep `@brains/site-rizom` as the real Rizom site package
- [ ] create shared `@brains/rizom-ui` for the minimal app-facing Rizom UI/layout surface
- [ ] localize `RizomLayoutProps` and social-link mapping in Rizom app layouts
- [ ] switch remaining app-facing Rizom UI imports to `@brains/rizom-ui`
- [x] durable `site-content` plugin/runtime contract is documented without app-level imports
- [x] `@brains/site-content` is extended to own landing-page content definition/wiring for `rizom.ai`
- [x] direct app imports of `@brains/templates` / `@brains/utils` are removed from `apps/rizom-ai/src`
- [ ] extraction choice is made: keep relying on `ranger` default preset vs define an explicit equivalent contract
- [ ] standalone `package.json` shape is fully defined (`start` is now aligned; dependency pinning still remains)
- [ ] standalone `brain.yaml` shape is confirmed
- [ ] deploy workflow/config needed by `rizom.ai` is identified
- [ ] env/secrets list is documented
- [ ] content repo linkage is documented
- [ ] dry-run extraction is performed in a temp repo/directory
- [ ] dry-run app can typecheck and build
- [ ] dry-run app can start successfully
- [x] dry-run app can rebuild preview via `build-site --remote` in the current monorepo app flow
- [x] rebuilt preview output is inspected and correct for the migrated `rizom.ai` app flow
- [ ] remaining breakages are documented as follow-up tasks

## Exit criteria

This plan is complete when:

1. `rizom.ai` can run outside the monorepo as its own app repo
2. the extracted app consumes shared Rizom/framework packages without workspace-only assumptions
3. preview rebuild verification still works via the running app
4. deploy-specific files and env expectations are documented for the extracted app
5. the remaining extraction work for `rizom.foundation` and `rizom.work` becomes mechanical follow-through

## Do not do

- do not widen this pilot into an all-app extraction plan
- do not extract shared Rizom packages in the same step
- do not redesign the Rizom theme/runtime again during extraction prep
- do not block the pilot on full parity for `rizom.foundation` and `rizom.work`
- do not replace the validated running-app rebuild workflow with source-only checks

## Related

- `docs/plans/rizom-site-composition.md`
- `docs/plans/rizom-theme-hardening.md`
- `docs/plans/standalone-apps.md`
- `docs/roadmap.md`
