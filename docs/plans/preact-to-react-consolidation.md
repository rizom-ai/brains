# Plan: Consolidate SSR rendering on React

## Status

**Implemented on `work/react-renderer-consolidation`; merge and release remain approval-gated.** Preact is retired and every server-side surface renders with React 19,
leaving one JSX runtime, one component dialect, and one shared component
library across the site builds, the operator surfaces, and the client apps.

The decision rests on three measured facts, not preference: Preact is used only
to render to string, so the bundle-size advantage that justifies it is never
collected; React cannot be removed regardless, because `ink` requires it and
three surfaces are React 19 SPAs; and the split currently forces the operator
view contract to be implemented twice, in two runtimes, against one protocol.

**This plan is time-boxed by the release train.** `preact` is a published peer
dependency, and Changesets is still in prerelease mode, so the swap is free
today. Once `changeset pre exit` runs it becomes a `0.3.0` major. Phases 1–4
therefore belong to the `v0.2.0` release decision, not to the cleanup backlog;
Phases 5–6 are internal and unconstrained.

## Goal

One rendering runtime for the whole repository.

Today the split is 150 Preact `.tsx` files rendering through
`preact-render-to-string`, against four React packages
(`interfaces/chat-repl` on `ink`, `interfaces/web-chat`, `plugins/admin`,
`plugins/studio`). Preact renders no interactive code anywhere: the only hook in
the entire Preact surface is `useContext`, in
`shared/ui-library/src/ImageRendererProvider.tsx` and
`shared/ui-library/src/Head.tsx`, used for render-time context. There is no
`useState`, no `useEffect`, no hydration entry, and no client bundle.

The cost of keeping both shows up most clearly in the operator surface.
`plugins/dashboard/src/render/declarative-widget.tsx` (827 lines, Preact) and
`plugins/studio/ui-react/src/declarative-workspace.tsx` (1285 lines, React) are
two host implementations of the same semantic protocol from
`shell/plugins/src/operator/operator-view-contract.ts` — the same vocabulary of
panels, cards, columns, tabs, stats, link targets, and launch intents, rendered
twice because the hosts cannot share a runtime.
`shared/ui-library/src/WidgetPrimitives.tsx` (401 lines) is Preact-only, so the
Studio host reimplements its equivalents rather than importing them. Around 2,100
lines of parallel host code exist for one contract, and the boundary that keeps
them apart is itself maintained code: the containment assertions in
`interfaces/web-chat/test/react-containment.test.ts`, and the
`ui-react/`-with-its-own-tsconfig convention in three packages.

## Non-goals

- Introducing `preact/compat` or any alias shim. That preserves two runtimes
  behind one import specifier and forfeits the entire reason for the change.
- Adding hydration, islands, or client-side interactivity to any surface that
  is server-rendered today. This plan changes the renderer, not the
  architecture; that question belongs to
  [`alternative-site-renderer-spike.md`](./alternative-site-renderer-spike.md).
- Shipping two renderer pipelines or a pipeline selector, even temporarily.
- Reworking the operator view contract. The protocol is unchanged; only the
  number of hosts implementing it changes.
- Migrating the `plugins/admin` browser apps. They are deleted by
  [`studio-consolidation.md`](./studio-consolidation.md) Phase 6; the package
  remains only as a headless administration-workspace provider, so converting
  those apps first would be discarded work.

## Measured behaviour

Every claim below was executed against React 19.2.8 and Preact 10.27 in this
repository rather than inferred, because the dialect differences are the whole
risk surface.

### The dialect gap is smaller than it looks

The syntax-aware implementation inventory found 360 actual `class=` JSX
attributes across 21 files (the raw grep count also included serialized-HTML
test assertions). There are no `for=` JSX attributes today. `class=` renders
**correctly** under React 19 — `<div class="a b">x</div>` — with only a
development-time warning. It is warning noise, not breakage.

The hard failure is a string `style` prop, which throws under React
(`The 'style' prop expects a mapping from style properties to values`). The
syntax inventory found 49 literal occurrences in three `sites/rizom-ai` files,
plus 15 computed string styles in the dashboard, topic map, and agent proximity
map. All become typed style objects; CSS custom properties go through one
bounded helper rather than casts. The same inventory found 48 hyphenated SVG
JSX attributes across four files. React renders them but warns, so Phase 2
normalizes those to camelCase as part of making the tree genuinely
React-correct.

The `yeehaa.io` runtime rehearsal caught two static-HTML cases the initial
inventory missed: lowercase string `onclick` props are warned about and omitted
by React, and a responsive image prop reached a native `<img>` as `srcset`
instead of `srcSet`. Static controls now use data attributes with one
site-shell event boundary, responsive images use the React spelling, and ESLint
plus direct static-markup tests guard both cases. Theme toggling, mobile-menu
open/close, and responsive image output were browser-verified against the
migrated `yeehaa.io` preview.

### Preact already accepts the React dialect

This is what makes the migration safe. Preact renders `className`, `htmlFor`,
and style objects — including custom properties — to identical markup:
`className="a b"` emits `class="a b"`, `htmlFor` emits `for`, and
`style={{"--d":".1s"}}` emits `style="--d:.1s;"`. The entire codebase can
therefore be made React-correct _while still running on Preact_, verified
against unchanged output, before any runtime changes.

### Mixed trees are not viable, and fail asymmetrically

A Preact vnode inside a React tree throws loudly
(`Objects are not valid as a React child`). A React element inside a Preact
tree renders **silently as an empty element** — `<div></div>` — with no error.
Because `@brains/ui-library` is imported by 18 packages, the server-rendered
graph is effectively one tree, and the dangerous direction fails without a
signal. The renderer swap is therefore atomic and cannot be staged
package-by-package.

### Residual output differences are six known classes

The implementation review found one React 19 behavior the proposal's initial
probe missed: `renderToStaticMarkup()` inserts resource hints for eager images.
With the dialect normalized, React and Preact differ in six known classes:

| Class                    | React                                  | Preact                 |
| ------------------------ | -------------------------------------- | ---------------------- |
| Boolean attributes       | `disabled="" readOnly=""`              | `disabled readonly`    |
| Entity escaping          | escapes `>` and `'`                    | leaves both raw        |
| Style trailing separator | `style="width:10px"`                   | `style="width:10px;"`  |
| Eager image hints        | prepends `link[rel=preload][as=image]` | no generated hint      |
| Preconnect placement     | hoists hints ahead of head scripts     | preserves source order |
| SVG focus spelling       | serializes `tabindex`                  | serializes `tabIndex`  |

The first three and SVG focus spelling are serialization-only. Eager image
preloads and preconnect hoisting are React-owned resource optimizations. The
harness folds only image preload links, canonicalizes only preconnect placement,
preserves every other resource hint, and separately tests semantic image and
focus attributes. Void elements, other SVG attributes, `data-`/`aria-`, falsy
children, null/undefined props, and `dangerouslySetInnerHTML` are otherwise
byte-identical. The equivalence oracle is therefore DOM-normalized rather than
byte-exact, with these six classes explicitly allowlisted.

## Published surface: a window, not a major

`preact` is part of the published authoring contract. `@rizom/site` declares it
as a peer dependency, while the published site packages declare it as a
publish-peer; the packed site fixture under
`packages/brain-cli/test/fixtures/public-authoring/site/` pins it; and
`docs/external-site-authoring.md` documents it for external authors, who write
Preact JSX against these packages.

Under a released `0.2.x` this would be a breaking change requiring `0.3.0`. It
is not one today. Changesets is still in prerelease mode (`.changeset/pre.json`
is `"mode": "pre"`), stable `0.2.0` has not shipped, and the compatibility rules
in [`public-authoring-api-0.2.md`](./public-authoring-api-0.2.md) — semantic
changes wait for `0.3.0`, external packages declare
`@rizom/brain: ">=0.2.0 <0.3.0"` — bind the line _after_ stable release. On the
alpha line the swap is an ordinary change at no version cost.

Decision: land this inside the prerelease window. The deadline is real and
one-way — once `changeset pre exit` runs, `preact` becomes a frozen term of the
stable `0.2.x` authoring contract, and the same swap then costs a `0.3.0` major
plus a peer-range bump for every external package. There is no third option
where it stays cheap.

Sequencing within that window follows from gate 1 of the authoring plan, which
requires nominating a fresh final alpha candidate and rerunning the exact
registry and packed matrices against it. That rerun is scheduled regardless, so
a flip landing _before_ the final-candidate refresh is absorbed by work already
planned and the matrix runs once. Landing after it forces a second full matrix
run and invalidates freeze evidence just gathered.

If the migration cannot be scheduled before prerelease exit, the correct
outcome is to defer the whole plan to `0.3.0` rather than split it. A stable
`@rizom/site` on Preact wrapping an internal React graph is the two-runtime tax
made permanent and published.

One further ordering constraint: `sites/rizom-ai` and `sites/rizom` publish
exact dependencies on `@rizom/site` and `@rizom/site-rizom`. Their source flips
atomically with the repository, but Phase 4 must prove the site-lane version
plan rewrites those exact dependencies to the React-line versions before any
package is published. The site release then publishes the SDK before its
dependents in topological order; no package may publish against the old Preact
SDK merely because workspace linking hid the mismatch during development.

## Phases

Each phase is a releasable slice; tests land before or with the code they
cover, inside the phase.

### Phase 1 — Equivalence harness (tests only) ✅

No production change. This builds the oracle that every later phase is graded
against, so it exists before anything moves.

- A DOM-normalizing comparison helper that parses two HTML strings and compares
  structure and attributes, folding the three known difference classes
  (boolean-attribute form, `>`/`'` escaping, style trailing separator, and
  React-owned eager-image preload links, preconnect hoisting, and SVG focus
  attribute spelling).
- Baseline fixtures captured from the current Preact output for one route of
  each shape: an authored site route, an entity list route, an entity detail
  route, the dashboard page (`renderDashboardPageHtml`), one declarative
  operator widget, one media page, a printable attachment, a presentation
  layout, and markdown/prose content. There is no JSX email-template renderer
  in the current repository; the proposal's email item was stale.
- Gate: the suite proves current output matches its own baseline.

### Phase 2 — React dialect, still on Preact ✅

The largest diff in the plan and the smallest risk in it: no runtime changes.

- Tests first: extend the Phase 1 suite to assert the normalized output is
  unchanged by this phase.
- Syntax-aware codemod `class=` → `className=` across the 21 files, convert the
  49 literal and 15 computed string `style` props to objects, camel-case the 48
  hyphenated SVG attributes across four files, use `srcSet` for native responsive
  images, and move static string event handlers to the site shell's event
  boundary. Serialized-HTML assertions are not source syntax and remain
  unchanged.
- Add ESLint rules banning `class=`, `for=`, `srcset=`, lowercase string event
  handlers, string-valued `style`, and hyphenated non-ARIA/data SVG attributes
  in `.tsx`, so the dialect cannot regress before the flip.
- Gate: Phase 1 harness passes. Note that string-to-object style conversion
  adds Preact's trailing separator, which the harness folds.

### Phase 3 — The renderer flip (atomic) ✅

Per the interop finding this cannot be subdivided.

- Tests first: a repository test asserting no `preact` import, dependency, or
  `jsxImportSource` survives outside `node_modules`, historical changelogs, and
  the migration plan itself.
- Flip `jsxImportSource` in `tsconfig.json` and
  `shared/typescript-config/instance.json`, the 41 package tsconfigs, and the
  49 per-file pragmas. Add `DOM`/`DOM.Iterable` to the root lib set: React's
  ambient fallback web interfaces otherwise conflict with Bun's complete
  request/form-data types in non-UI packages.
- Replace `preact-render-to-string`'s `render()` with `react-dom/server`'s
  `renderToStaticMarkup()` at its call sites —
  `plugins/site-builder/src/lib/preact-builder.ts` (renamed),
  `plugins/dashboard/src/dashboard-page.tsx`,
  `shared/media-page-composer/src/media-template-renderer.ts` — and in the
  render-asserting tests. `renderToStaticMarkup`, not `renderToString`: nothing
  hydrates, so hydration markers are unwanted bytes.
- Repoint the two `useContext` imports from `preact/hooks` to `react`.
- Swap the dependency in the 23 declaring `package.json` files and in
  `packages/brain-cli/scripts/build.ts`'s external list.
- Gate: Phase 1 harness passes with residual diffs only in the six
  allowlisted classes. A warmed 500-render comparison of the per-request
  dashboard measured Preact at 0.099 ms average / 0.074 ms p50 / 0.101 ms p95
  and React at 0.516 ms average / 0.397 ms p50 / 0.796 ms p95. The relative
  increase is material, but the absolute average penalty is about 0.42 ms per
  operator-page request and accepted.

### Phase 4 — Published surface (ships in the same alpha as Phase 3) ✅

Separated for review discipline, not for sequencing; the peer dependency is
what external authors install against, so it cannot lag the flip.

- Tests first: the packed-consumer fixtures under
  `packages/brain-cli/test/fixtures/public-authoring/` typecheck against a
  React-line packed `@rizom/brain` and `@rizom/site`, including the `site`
  fixture's own peer declaration.
- Swap `preact` for `react`/`react-dom` in the peer and publish-peer blocks of
  `@rizom/site` and the published site packages. Theme packages are CSS-only
  and correctly declare neither JSX runtime.
- Update `docs/external-site-authoring.md` and
  `docs/external-plugin-authoring.md`, including the dialect change for authors
  who wrote `class=`.
- No major bump: this rides the `0.2.0-alpha` line while Changesets remains in
  prerelease mode. Release-surface review still precedes code-quality review —
  the change is version-cheap, not review-cheap.
- Hard gate: this phase must merge **before** `changeset pre exit`. After
  prerelease exit the same change is a `0.3.0` major.
- Gate the site release plan: versioned manifests for `sites/rizom-ai` and
  `sites/rizom` must reference the React-line SDK/site versions, and publishing
  must remain topological. Workspace linking is not accepted as evidence.

### Phase 5 — Collapse the duplicated operator host ✅

The payoff phase, and the reason the earlier ones are worth doing.

- Tests first: host-renderer conformance for every block shape in the operator
  view contract, asserted once against the unified host and exercised from both
  the widget and workspace entry points.
- Extract one React host renderer in private `@brains/operator-view-react`,
  consumed by the dashboard widget host and the Studio/Studio workspace host.
- `shared/ui-library`'s widget primitives become importable by the workspace
  host; the Studio-side reimplementations are deleted.
- Coordinate with [`studio-consolidation.md`](./studio-consolidation.md) Phase 7,
  which re-homes operator widget content into a Studio Overview workspace.
  With one runtime that re-homing is a move rather than a port.

### Phase 6 — Remove the containment scaffolding ✅

- Delete the runtime-boundary assertions from
  `interfaces/web-chat/test/react-containment.test.ts` — specifically
  "keeps React imports inside `ui-react`" and the `importsReact` helper.
  **Keep** the behavioural assertions in that file; the conversation-id,
  session, and prompt-input expectations are real product tests that happen to
  live there.
- Collapse the `ui-react/` tsconfig split now that the root config's
  `jsxImportSource` is correct for every file.
- Single `@types/react` version repository-wide. The `dedupe-react` esbuild
  plugin stays — it dedupes browser-bundle entrypoints and is still required.

## Ordering rationale

The harness comes first because the dangerous failure mode is silent: a Preact
parent rendering a React child emits an empty element with no error, so the
migration needs an output oracle before it needs any code change. Phase 2
carries all the textual churn while the runtime is untouched, which means the
riskiest-looking diff in the plan is verifiable against unchanged output and
independently shippable. That leaves Phase 3 as a configuration and
call-site change small enough to reason about, which is the only way an atomic
flip across 23 packages is acceptable. Phase 4 is bound to Phase 3's alpha
because a peer dependency that disagrees with the runtime is worse than either
state alone. Phases 5 and 6 collect the benefit and remove the scaffolding once
there is nothing left to contain.

Against the release train, this is the binding constraint on the whole plan:
Phases 1–4 must land before `changeset pre exit`, and ideally before gate 1 of
[`public-authoring-api-0.2.md`](./public-authoring-api-0.2.md) nominates the final
alpha candidate, so the registry and packed matrices are run once against a
React-line candidate instead of twice. Phases 5 and 6 are internal-only and can
follow stable `0.2.0` at any time.

Against `studio-consolidation.md`: land Phases 1–4 **before** its Phase 7, so
that moving operator content into Studio Overview does not mean porting it
across runtimes, and before its Phase 8 rebuilds the dashboard as the public
card — otherwise that rebuild happens in Preact and is flipped immediately
after. If studio consolidation has already begun, sequence after its Phase 1
rename rather than concurrently, since that rename rewrites the same Studio files
Phase 5 touches.

## Risks

- **Silent blank output from a mixed tree.** The Preact-parent/React-child
  direction produces empty elements with no error. Guarded by the Phase 3
  no-`preact`-survives test plus the Phase 1 harness; the atomicity of Phase 3
  is a consequence of this risk, not a stylistic preference.
- **Per-request SSR latency.** The dashboard renders per request and the Phase 3
  benchmark measured React roughly 5.2× slower than Preact, but still below
  0.8 ms at p95 for the representative page and about 0.42 ms slower on average.
  That absolute cost is accepted for the single operator-page request path.
- **Missing the prerelease window.** This is the highest-cost risk and it is a
  scheduling risk, not a technical one. `preact` is a published peer dependency;
  once `changeset pre exit` runs it is frozen into the stable `0.2.x` contract
  and the swap costs a `0.3.0` major plus a peer-range bump for every external
  package. The plan is cheap today and expensive the day after prerelease exit,
  so its scheduling decision belongs with the `v0.2.0` release decision rather
  than in the cleanup backlog.
- **External author breakage.** Site and theme authors write Preact JSX today.
  On the alpha line they are expected to track breaking changes, and Phase 4's
  documentation update covers the dialect shift; it cannot be mitigated
  technically without shipping two pipelines, which is a non-goal.
- **Renderer-owned resource handling.** React 19 inserts eager-image preload
  links and hoists preconnect hints. The equivalence helper folds only
  `rel=preload`/`as=image` and canonicalizes only preconnect placement; tests
  retain all other hints and image attributes so the allowlist cannot hide
  arbitrary head changes.
- **Escaping changes reaching stored or compared output.** React escapes `>`
  and `'` where Preact does not. Anything that diffs, hashes, or snapshots
  rendered HTML outside the Phase 1 harness — build manifests, artifact
  accounting — must be checked in Phase 3.
- **Collision with studio consolidation.** Both plans rewrite
  `plugins/studio/ui-react/` and `plugins/dashboard/src/render/`. The ordering
  rule above resolves it; running them concurrently does not.

## Related work

- [Studio consolidation](./studio-consolidation.md)
- [Public authoring API `0.2`](./public-authoring-api-0.2.md)
- [Alternative site renderer spike](./alternative-site-renderer-spike.md)
