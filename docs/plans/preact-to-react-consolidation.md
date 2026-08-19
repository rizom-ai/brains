# Plan: Consolidate SSR rendering on React

## Status

**Proposed.** Retire Preact and render every server-side surface with React 19,
leaving one JSX runtime, one component dialect, and one shared component
library across the site builds, the operator surfaces, and the client apps.

The decision rests on three measured facts, not preference: Preact is used
only to render to string, so the bundle-size advantage that justifies it is
never collected; React cannot be removed regardless, because `ink` requires it
and three surfaces are React 19 SPAs; and the split currently forces the
operator view contract to be implemented twice, in two runtimes, against one
protocol.

## Goal

One rendering runtime for the whole repository.

Today the split is 150 Preact `.tsx` files rendering through
`preact-render-to-string`, against four React packages
(`interfaces/chat-repl` on `ink`, `interfaces/web-chat`, `plugins/admin`,
`plugins/cms`). Preact renders no interactive code anywhere: the only hook in
the entire Preact surface is `useContext`, in
`shared/ui-library/src/ImageRendererProvider.tsx` and
`shared/ui-library/src/Head.tsx`, used for render-time context. There is no
`useState`, no `useEffect`, no hydration entry, and no client bundle.

The cost of keeping both shows up most clearly in the operator surface.
`plugins/dashboard/src/render/declarative-widget.tsx` (827 lines, Preact) and
`plugins/cms/ui-react/src/declarative-workspace.tsx` (1285 lines, React) are
two host implementations of the same semantic protocol from
`shell/plugins/src/operator/operator-view-contract.ts` — the same vocabulary of
panels, cards, columns, tabs, stats, link targets, and launch intents, rendered
twice because the hosts cannot share a runtime.
`shared/ui-library/src/WidgetPrimitives.tsx` (401 lines) is Preact-only, so the
CMS host reimplements its equivalents rather than importing them. Around 2,100
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
- Migrating `plugins/admin`. It is deleted by
  [`studio-consolidation.md`](./studio-consolidation.md) Phase 6; converting it
  first would be discarded work.

## Measured behaviour

Every claim below was executed against React 19.2.8 and Preact 10.27 in this
repository rather than inferred, because the dialect differences are the whole
risk surface.

### The dialect gap is smaller than it looks

`class=` appears 411 times across 28 files and `for=` alongside it. Both render
**correctly** under React 19 — `<div class="a b">x</div>` — with only a
development-time warning. They are warning noise, not breakage.

The one hard failure is a string `style` prop, which throws under React
(`The 'style' prop expects a mapping from style properties to values`). That is
49 occurrences in exactly three files, all in `sites/rizom-ai`: `layout.tsx`
(3), `brain-screens.tsx` (4), and `growth-diagram.tsx` (42, nearly all CSS
custom properties such as `--d:.1s`).

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

### Residual output differences are three known classes

With the dialect normalized, React and Preact still differ in exactly three
semantically neutral ways:

| Class                    | React                     | Preact                |
| ------------------------ | ------------------------- | --------------------- |
| Boolean attributes       | `disabled="" readOnly=""` | `disabled readonly`   |
| Entity escaping          | escapes `>` and `'`       | leaves both raw       |
| Style trailing separator | `style="width:10px"`      | `style="width:10px;"` |

Void elements, SVG attributes, `data-`/`aria-`/`tabIndex`, falsy children,
null/undefined props, and `dangerouslySetInnerHTML` are byte-identical. The
equivalence oracle must therefore be DOM-normalized rather than byte-exact,
with these three classes allowlisted.

## Published surface

`preact` is part of the published authoring contract, so this is a breaking
change, not an additive one. `@rizom/site` declares it as a peer dependency;
`@rizom/ui`, `@rizom/theme-default`, `@rizom/theme-rizom-ai`, and the published
site packages declare it as a publish-peer; and
`docs/external-site-authoring.md` documents it for external authors, who write
Preact JSX against these packages.

Decision: this moves on a `0.3` major for the site authoring line. It cannot
ride the `0.2.x` additive line that
[`public-authoring-api-0.2.md`](./public-authoring-api-0.2.md) governs. Everything
else in scope is `"private": true` and moves freely.

One ordering constraint follows from this: `sites/rizom-ai` and `sites/rizom`
consume `@rizom/site` and `@rizom/site-rizom` as _published tarballs_, not
workspace links. They can only flip once a React-line `@rizom/site` has been
published, so they land one release behind the packages they consume.

## Phases

Each phase is a releasable slice; tests land before or with the code they
cover, inside the phase.

### Phase 1 — Equivalence harness (tests only)

No production change. This builds the oracle that every later phase is graded
against, so it exists before anything moves.

- A DOM-normalizing comparison helper that parses two HTML strings and compares
  structure and attributes, folding the three known difference classes
  (boolean-attribute form, `>`/`'` escaping, style trailing separator).
- Baseline fixtures captured from the current Preact output for one route of
  each shape: an authored site route, an entity list route, an entity detail
  route, the dashboard page (`renderDashboardPageHtml`), one declarative
  operator widget, one email template, one media page, a presentation layout,
  and markdown/prose content.
- Gate: the suite proves current output matches its own baseline.

### Phase 2 — React dialect, still on Preact

The largest diff in the plan and the smallest risk in it: no runtime changes.

- Tests first: extend the Phase 1 suite to assert the normalized output is
  unchanged by this phase.
- Codemod `class=` → `className=`, `for=` → `htmlFor=` across the 28 files, and
  convert the 49 string `style` props in `sites/rizom-ai` to objects.
- Add an ESLint rule banning `class=`, `for=`, and string-valued `style` in
  `.tsx`, so the dialect cannot regress before the flip.
- Gate: Phase 1 harness passes. Note that string-to-object style conversion
  adds Preact's trailing separator, which the harness folds.

### Phase 3 — The renderer flip (atomic)

Per the interop finding this cannot be subdivided.

- Tests first: a repository test asserting no `preact` import, dependency, or
  `jsxImportSource` survives outside `node_modules`.
- Flip `jsxImportSource` in `tsconfig.json` and
  `shared/typescript-config/instance.json`, the 41 package tsconfigs, and the
  49 per-file pragmas.
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
- Gate: Phase 1 harness passes with residual diffs only in the three
  allowlisted classes; a measured before/after on the per-request dashboard
  route (`plugins/dashboard/src/plugin.ts:503`).

### Phase 4 — Published surface (ships in the same release as Phase 3)

Separated for review discipline, not for sequencing; the peer dependency is
what external authors install against, so it cannot lag the flip.

- Tests first: the packed-consumer fixtures under
  `packages/brain-cli/test/fixtures/public-authoring/` typecheck against a
  React-line packed `@rizom/brain` and `@rizom/site`.
- Swap `preact` for `react`/`react-dom` in the peer and publish-peer blocks of
  `@rizom/site`, `@rizom/ui`, `@rizom/theme-default`, `@rizom/theme-rizom-ai`,
  and the published site packages.
- Update `docs/external-site-authoring.md` and
  `docs/external-plugin-authoring.md`, including the dialect change for
  authors who wrote `class=`.
- Major version bump on the site authoring line. Release-surface review
  precedes code-quality review.
- `sites/rizom-ai` and `sites/rizom` follow in the next release, once the
  packages they consume are published on the React line.

### Phase 5 — Collapse the duplicated operator host

The payoff phase, and the reason the earlier ones are worth doing.

- Tests first: host-renderer conformance for every block shape in the operator
  view contract, asserted once against the unified host and exercised from both
  the widget and workspace entry points.
- Extract one React host renderer for the operator view contract, consumed by
  the dashboard widget host and the CMS/Studio workspace host.
- `shared/ui-library`'s widget primitives become importable by the workspace
  host; the CMS-side reimplementations are deleted.
- Coordinate with [`studio-consolidation.md`](./studio-consolidation.md) Phase 7,
  which re-homes operator widget content into a Studio Overview workspace.
  With one runtime that re-homing is a move rather than a port.

### Phase 6 — Remove the containment scaffolding

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
flip across 23 packages is acceptable. Phase 4 is bound to Phase 3's release
because a peer dependency that disagrees with the runtime is worse than either
state alone. Phases 5 and 6 collect the benefit and remove the scaffolding once
there is nothing left to contain.

Against `studio-consolidation.md`: land Phases 1–4 **before** its Phase 7, so
that moving operator content into Studio Overview does not mean porting it
across runtimes, and before its Phase 8 rebuilds the dashboard as the public
card — otherwise that rebuild happens in Preact and is flipped immediately
after. If studio consolidation has already begun, sequence after its Phase 1
rename rather than concurrently, since that rename rewrites the same CMS files
Phase 5 touches.

## Risks

- **Silent blank output from a mixed tree.** The Preact-parent/React-child
  direction produces empty elements with no error. Guarded by the Phase 3
  no-`preact`-survives test plus the Phase 1 harness; the atomicity of Phase 3
  is a consequence of this risk, not a stylistic preference.
- **Per-request SSR latency.** The dashboard renders per request at
  `plugins/dashboard/src/plugin.ts:503`, and `renderToStaticMarkup` is slower
  than `preact-render-to-string`. Expected to be immaterial for one admin page,
  but it is measured in Phase 3 rather than assumed, and it is the only place in
  the repository where the difference can be felt.
- **External author breakage.** Site and theme authors write Preact JSX today.
  Mitigated by the major bump and documentation in Phase 4; it cannot be
  mitigated technically without shipping two pipelines, which is a non-goal.
- **Escaping changes reaching stored or compared output.** React escapes `>`
  and `'` where Preact does not. Anything that diffs, hashes, or snapshots
  rendered HTML outside the Phase 1 harness — build manifests, artifact
  accounting — must be checked in Phase 3.
- **Collision with studio consolidation.** Both plans rewrite
  `plugins/cms/ui-react/` and `plugins/dashboard/src/render/`. The ordering
  rule above resolves it; running them concurrently does not.

## Related work

- [Studio consolidation](./studio-consolidation.md)
- [Complete the operator view composition contract](./public-operator-surface-authoring.md)
- [Public authoring API `0.2`](./public-authoring-api-0.2.md)
- [Alternative site renderer spike](./alternative-site-renderer-spike.md)
