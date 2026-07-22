# Plan: Site Build Robustness

## Status

Complete on `work/site-build-robustness`; awaiting review and merge. Baseline, preflight diagnostics, and prepared snapshots are in place. Site builds now render into immutable generation directories, validate and write an artifact manifest, and publish through an active-output symlink only after success. Existing directory outputs use a tested rollback-capable one-time migration; later symlink replacements use one atomic rename. App `public/` files are captured as binary-safe prepared assets and validated in the artifact manifest. A required renderer signal now spans preparation, images, rendering, CSS, asset writes, and SEO; superseded or shutdown builds cancel and clean staging, while commit remains bounded and non-interruptible. Full Rover preview and production builds pass with environment URLs, staged RSS/SEO, and binary public assets. Manifests now hash every artifact, sitemap timestamps come from the prepared snapshot, and stale uncommitted generations are cleaned without pruning recent or legacy output. Production inventory matches an `origin/main` baseline; remaining content differences are runtime-created topic timestamps/order. Repeated Preact rendering from one prepared fixture is byte-identical, and post-rebase desktop/mobile checks passed for authored, index, and detail routes without horizontal overflow. CMS workspace preview/live action contracts, confirmation, permissions, and queued status are covered. Headless Chromium verification against a running Rover app registered an operator passkey, opened `/cms/workspaces/site`, queued Preview and confirmed Update live site, and observed both builds complete; each resulting manifest accounted for and matched 48 artifact hashes across 30 routes. The architecture overview now documents the final prepared-snapshot, Preact-rendering, and transactional-publication boundaries.

The robustness work is valuable with the current Preact renderer. Supporting Astro or another renderer is an optional later outcome, not the reason for the plan.

## Problem

The current site builder works in production, but several responsibilities are interleaved:

```text
build request
  -> collect and generate routes
  -> prepare images
  -> resolve section content during route rendering
  -> validate and render Preact components
  -> write directly into the environment output directory
  -> process CSS and copy assets
  -> report completion
```

This creates avoidable operational risk:

- cleaning and writing the live output directory before completion can leave partial output after a failure;
- concurrent routes resolve content independently, so a changing source can produce a mixed-time build;
- missing templates and invalid sections may be logged and omitted without becoming actionable build diagnostics;
- the returned failure can lose useful underlying error detail;
- renderer execution has no build-wide cancellation contract;
- output paths, asset collisions, and produced files are not represented by one final artifact manifest;
- build preparation and Preact rendering are difficult to test independently.

The earlier `@brains/site-engine` extraction moved reusable contracts and utilities, but it did not need to replace the Preact builder. The next work should improve correctness and recoverability first.

## Goal

Make this guarantee:

> A site build produces one complete, internally consistent output or leaves the previously published output untouched, with actionable diagnostics explaining any failure.

The primary outcomes are:

1. deterministic build preparation;
2. transactional output publication;
3. structured diagnostics;
4. cancellation and cleanup safety;
5. explicit artifact and asset accounting;
6. independent tests for preparation and rendering; and
7. unchanged behavior for existing Preact sites and public authoring APIs.

## Non-goals

- Do not replace the current Preact renderer as a goal of this work.
- Do not add a second site-builder plugin or ship two runtime pipelines.
- Do not add a public legacy/V2 pipeline selector.
- Do not adopt Astro in the primary implementation.
- Do not redesign routes, entities, site-content, themes, or publication semantics.
- Do not require existing site or theme packages to change.
- Do not move jobs, tools, rebuild policy, build status, CMS workspace behavior, or SEO events out of `plugins/site-builder`.
- Do not promise incremental builds; measure and plan that separately if needed.

## Safety invariants

These invariants apply throughout implementation:

- Production includes only published, public content.
- Preview may include drafts but still includes only public content.
- A failed or cancelled build never replaces the last successful output.
- Build completion and production-success events fire only after output commit.
- No route or asset path may escape its configured output directory.
- Renderer and preparation failures retain their original diagnostic detail.
- Existing URL, metadata, script, image, and CSS behavior remains compatible.
- The current Preact authoring APIs remain the default and require no migration.

## Target pipeline

```text
SiteBuilderPlugin
  jobs, tools, rebuilds, status, CMS, completion events
                    |
                    v
Prepare immutable build snapshot
  routes, validated content, metadata, images, scripts, assets
                    |
                    v
Render with current Preact builder into staging
                    |
                    v
Validate artifact manifest
                    |
                    v
Commit the validated generation through one active-output pointer
                    |
                    v
Emit success and run post-build handling
```

The plugin remains the operational owner. `@brains/site-engine` may own preparation and transactional build utilities when they can remain free of plugin/runtime dependencies. The Preact renderer may stay in `plugins/site-builder` unless extracting it provides a concrete simplification after the robustness work.

## Core build model

Introduce a prepared build model that contains resolved data rather than live service callbacks.

The exact names may change, but the shape should be comparable to:

```ts
type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface PreparedSiteBuild {
  buildId: string;
  environment: "preview" | "production";
  site: PreparedSiteMetadata;
  routes: PreparedRoute[];
  themeCSS?: string;
  images: Record<string, ResolvedSiteImage>;
  staticAssets: Record<string, string>;
  publicAssetDir?: string;
  globalHeadScripts: string[];
}

interface PreparedRoute {
  id: string;
  path: string;
  title: string;
  description: string;
  layout: string;
  fullscreen: boolean;
  sections: PreparedSection[];
  headScripts: string[];
}

interface PreparedSection {
  id: string;
  template: string;
  data: JsonValue;
}
```

Preparation may use schemas, registries, entity services, and datasource callbacks. Those runtime values must not appear in `PreparedSiteBuild`.

A JSON round-trip or equivalent structured-clone test should succeed. This provides deterministic fixture snapshots and preserves the option to pass the prepared model to another process later. Renderer component bindings remain separate and may still be Preact functions.

## Structured diagnostics

Build failures and warnings should use one typed model:

```ts
interface SiteBuildDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  routeId?: string;
  sectionId?: string;
  template?: string;
  path?: string;
}
```

The plan must define severity before changing current behavior. At minimum:

- missing layouts, output-path escapes, write failures, and publication-safety violations are fatal;
- missing templates and invalid section content must appear in `BuildResult` rather than only logs;
- preview and production policy for invalid optional content must be explicit and tested;
- callers and status projections receive safe summaries while logs retain the original cause.

Do not silently tighten every warning into a fatal error during structural refactoring. Make policy changes separately and deliberately.

## Transactional output

Each build writes an immutable generation adjacent to the active output:

```text
dist/
  .site-builds/
    preview/<build-id>/
    production/<build-id>/
  site-preview      -> active preview generation
  site-production   -> active production generation
```

After rendering:

1. validate that all expected route files and declared assets exist;
2. verify every artifact path is inside the generation directory;
3. write an artifact manifest;
4. prepare a new active-output pointer;
5. replace the old pointer in one filesystem operation;
6. retain the previous generation until the new one is confirmed active;
7. remove old generations according to a bounded retention policy.

The preferred pointer is a temporary symlink renamed over the existing symlink on the same filesystem. If symlink behavior is not reliable on every supported deployment target, use a small active-generation manifest that the webserver resolves, replacing that manifest through an atomic file rename. Validate the selected mechanism on local development and deployed Linux environments before depending on it.

A two-step directory backup/rename sequence is rollback-capable but not an atomic serving cutover: readers can observe a missing path between renames. Do not describe or ship that fallback as atomic unless serving is paused during commit.

The shared optimized-image directory is an additive cache rather than the committed site root. A failed build may leave unused cached variants, but the previously published HTML must never reference new files until the active pointer changes. Cache pruning is separate maintenance work.

## Artifact manifest

A successful render produces a manifest containing at least:

- environment and build id;
- route id, URL path, and output file;
- copied public assets;
- template and site-package static assets;
- generated CSS files;
- referenced image variants;
- global and route-scoped scripts;
- warnings;
- optional content hashes for deterministic comparison.

The manifest supports commit validation, tests, build diagnostics, and comparison between the current and future implementations without introducing a runtime dual-builder mode.

## Behavioral baseline

Before changing the pipeline, characterize the behavior that must remain stable:

- static routes and generated entity list/detail routes;
- route replacement, ordering, pagination, and navigation;
- preview drafts versus published-only production content;
- public visibility filtering in both environments;
- inline, site-content, datasource, and overlay content;
- route title and page-label enrichment;
- missing-template and schema-validation behavior;
- fullscreen sections, layouts, and UI slots;
- site metadata, canonical URLs, analytics, and component-supplied head metadata;
- global and route-scoped runtime scripts;
- static-asset collision precedence;
- app `public/` assets;
- image entity resolution, variants, Markdown references, and shared caching;
- theme composition, fonts, Tailwind utilities, and dark/light behavior;
- progress, build status, warnings, failure results, and completion events;
- CMS Preview and Update live site workflows.

Add one representative golden build fixture that exercises these capabilities. Prefer byte comparison where stable; otherwise use normalized HTML/CSS snapshots and focused semantic assertions.

## Implementation phases

### Phase 0: Baseline and failure inventory

1. Add the representative golden build fixture.
2. Record route inventory, output files, normalized HTML/CSS, scripts, images, diagnostics, and progress.
3. Add failure-injection tests for:
   - content resolution;
   - invalid section data;
   - missing templates and layouts;
   - image resolution;
   - CSS processing;
   - asset copying; and
   - output commit.
4. Inventory which files and services belong to preparation, rendering, output commit, and plugin orchestration.
5. Add dependency rules preventing shared build utilities from importing plugin internals.

Exit criteria:

- current success and failure behavior is visible in tests;
- publication and visibility invariants have explicit coverage; and
- later phases can be compared with the baseline.

### Phase 1: Preflight and diagnostics

1. Add the typed diagnostic model to build results and status handling.
2. Preflight route paths, layout references, template references, and static-asset paths before touching output.
3. Reject path traversal and invalid absolute output paths.
4. Surface missing-template and validation problems through diagnostics.
5. Preserve underlying causes in logs while returning safe structured summaries.
6. Define collision diagnostics while retaining existing precedence until an intentional policy change.

Exit criteria:

- known structural problems are reported before output mutation;
- no relevant failure exists only in logs; and
- current valid builds remain unchanged.

### Phase 2: Prepare a consistent build snapshot

1. Add `PreparedSiteBuild` contracts and preparation services.
2. Generate and freeze the route inventory before rendering.
3. Resolve all section content before writing route files.
4. Apply preview/production and public-visibility filtering during preparation.
5. Apply schema validation, title/page-label enrichment, fullscreen metadata, scripts, and static-asset collection once.
6. Resolve the image manifest before route rendering.
7. Snapshot or inventory app `public/` assets used by the build.
8. Add serialization and deterministic fixture tests.
9. Adapt the current `PreactBuilder` to consume the prepared model while keeping its component bindings unchanged.

Exit criteria:

- rendering performs no entity or datasource reads;
- every route in a build sees one consistent prepared snapshot;
- the prepared model contains no service callbacks or component functions; and
- output matches the baseline.

### Phase 3: Transactional staging and commit

1. Render into a unique staging directory.
2. Make CSS processing and asset copying target staging.
3. Produce and validate the artifact manifest.
4. Implement commit, rollback, and stale-staging cleanup.
5. Keep the previous successful preview or production output available until commit.
6. Emit normal completion/status/SEO events only after commit.
7. Add failure tests at every commit step.

Exit criteria:

- injected failures never damage the previous output;
- incomplete staging directories are not served;
- preview and production commit independently; and
- a successful build produces a validated manifest.

### Phase 4: Cancellation and lifecycle safety

1. Thread an `AbortSignal` through build preparation, image work, rendering, CSS processing, and asset copying where supported.
2. Stop before commit when a build is cancelled or superseded.
3. Treat the final commit section as non-interruptible and bounded.
4. Clean staging output after cancellation.
5. Preserve accurate job and build-status transitions.
6. Verify shutdown waits for or safely aborts admitted build work.

Exit criteria:

- cancelled builds never publish output;
- cancellation does not leak staging directories or workers;
- build status distinguishes cancelled, failed, and successful runs; and
- lifecycle tests remain deterministic.

### Phase 5: Deterministic assets and output

1. Centralize output-path normalization.
2. Make static-asset collision order explicit and test it.
3. Verify renderer output against the artifact manifest.
4. Add optional hashes for parity and reproducibility tests.
5. Define cleanup behavior for orphaned site files and stale staging directories.
6. Confirm repeated builds from the same prepared input produce equivalent output.

Exit criteria:

- all written files are accounted for;
- no source can write outside staging;
- repeated builds are reproducible within documented limits; and
- asset conflicts are actionable rather than accidental.

### Phase 6: Clarify the renderer seam

After the robustness work, evaluate the smallest useful rendering boundary.

1. Define a narrow renderer interface around `PreparedSiteBuild`, staging output, progress, diagnostics, and cancellation.
2. Test the engine/output lifecycle with a fake renderer.
3. Keep Preact layout and template bindings outside the prepared data.
4. Leave `PreactBuilder` in its current package unless extraction clearly reduces coupling or improves ownership.
5. If extraction is useful, move it in a separate follow-up without changing site output or public authoring APIs.

Exit criteria:

- preparation and output-commit tests do not require Preact;
- Preact rendering tests do not require a live shell;
- the default implementation remains Preact; and
- package movement is an evidence-based outcome, not a completion requirement.

### Phase 7: Optional alternative-renderer spike

Run only as a separate feasibility exercise after the robustness phases.

Astro is one possible candidate, not a predetermined replacement.

1. Consume a serialized prepared build.
2. Render into the same staging/manifest/commit lifecycle.
3. Cover one authored route, one entity list, one entity detail route, images, scripts, metadata, and theme CSS.
4. Keep existing Preact site packages compatible; native Astro templates would require their own bindings or authoring surface.
5. Compare output, build time, dependency cost, diagnostics, and author experience.
6. Retain Preact as the default unless another renderer demonstrates a meaningful benefit.

The alternative-renderer spike is not required to complete this plan.

## Worktree execution strategy

Implement the behavior-changing phases in a dedicated worktree rather than shipping legacy and V2 runtime pipelines side by side.

1. Land or establish baseline tests before structural changes.
2. Create a dedicated feature worktree.
3. Keep the worktree rebased regularly to limit drift.
4. Build the robustness changes behind existing internal APIs where possible.
5. Run the same fixture/content through `main` and the feature worktree.
6. Compare artifact manifests and normalized output.
7. Replace the old internal path in the feature branch rather than retaining a public selector.
8. Merge only after preview, production, CMS, and failure-injection validation passes.

The worktree isolates development but does not replace compatibility and output-parity testing.

## Validation

Run targeted checks throughout:

```bash
bun run --filter @brains/site-engine typecheck
bun run --filter @brains/site-engine lint
bun run --filter @brains/site-engine test
bun run --filter @brains/site-builder-plugin typecheck
bun run --filter @brains/site-builder-plugin lint
bun run --filter @brains/site-builder-plugin test
```

For behavior-affecting phases:

1. start the full Brain test app using its documented model/package command;
2. request a preview rebuild on the running app through MCP HTTP or the CMS;
3. inspect `dist/site-preview` and its artifact manifest;
4. request a production build and verify publication filtering;
5. inject a late render/commit failure and confirm the previous output remains served;
6. exercise CMS Preview and Update live site actions;
7. verify representative desktop and mobile routes;
8. compare output against the baseline worktree.

Run full repository checks when public template/site contracts or package boundaries change.

## Completion criteria

The plan is complete when:

- failed and cancelled builds leave the last successful site untouched;
- route content and metadata come from one consistent prepared snapshot;
- preview and production visibility rules remain fail-safe;
- build results contain actionable structured diagnostics;
- output paths and asset collisions are validated;
- every successful build has a validated artifact manifest;
- preparation, rendering, and commit behavior can be tested independently;
- existing site and theme packages require no migration;
- Preact remains the production renderer with equivalent output; and
- architecture documentation describes the final boundaries accurately.

A separate renderer package or Astro implementation is not required for completion.

## Plan retirement

Delete this plan after transactional build behavior, prepared snapshots, diagnostics, cancellation, and artifact accounting are documented as shipped behavior. Track any later Preact extraction or alternative-renderer implementation in a separate, narrower plan based on what the robustness work reveals.
