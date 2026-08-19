# NPM Package Boundary Plan

## Status

Accepted direction. Near-term: the external authoring path is already alpha-usable through `@rizom/brain/*`, and this plan narrows the publishing target before more official package refactors and broader external adoption. Builds on the now-landed external plugin API and the generated `@rizom/brain/*` public contract.

Re-fact-checked against the tree 2026-08-14:

- `@rizom/brain` (packages/brain-cli) ships `.`, `./cli`, `./model`, `./plugins`, `./entities`, `./services`, `./interfaces`, `./templates`, `./deploy`, and `./tsconfig.instance.json`. The Tier 2 list below has been corrected to match: `./site` and `./themes` no longer ship from `@rizom/brain` (site moved to the separate `@rizom/site` package under the site release lane), and `./model` shipped without the registry edit the curation rule requires.
- Declaration cleanliness is already guarded: `findInternalDeclarationImports` in `packages/brain-cli/scripts/build.ts` fails the build when generated declarations contain `@brains/*` imports.
- `bun run arch:check` submits the Git-selected TypeScript/JavaScript inventory to one dependency-cruiser graph, asserts workspace-family coverage, and enforces circular, unresolved, plugin, entity, and interface boundaries in dedicated CI. It does not yet include the published-official-plugin dependency rule from migration step 4. Its existing tier rules permit any `shell/*` import, so they do not constrain which shell package an entity or interface reaches for.
- The blessed `z` root export (utils section below) is implemented from the public `@rizom/brain` root entry, so external plugin fixtures no longer declare their own `zod` dependency.
- Milestone A is DONE (`@brains/prompt`) and A2 is DONE (`@brains/style-guide`). Package-by-package migration then stopped: see "Reframing: most `entities/` packages are not entities" below. Publishable-clean is 5 of 18 (`@brains/prompt`, `@brains/style-guide`, `@brains/doc`, `@brains/products`, `@brains/series`) after the style-guide contract was promoted onto the SDK — 18, not 19, since `@brains/site-info` moved to `plugins/`; authoring shape and dependency shape are separate achievements this plan had been conflating. Measured 2026-08-15: the next step is declarative-surface capability _and_ dependency promotion together, not either alone. Only 5 packages are declarative; the other 12 still extend `EntityPlugin` and need templates, datasources, or handlers that `defineEntity` does not have, so promoting dependencies alone frees no package. See "Decision: promote `@brains/contracts` and curated `@brains/utils` slices".
- A repo-wide inventory of all 19 entity and 7 interface packages (migration step 1, applied beyond `@brains/note`) is recorded under "Related finding: internal facade bypass audit" below.

New external-facing plugin/entity work should not add private `@brains/*` shortcut imports when a suitable public `@rizom/brain/*` surface exists or should be added. Existing packages can migrate package-by-package, but new work should move toward the public-only shape instead of deepening private coupling.

## Goal

Make official plugins/entities publishable to npm without exposing internal workspace packages as part of the public authoring contract.

The public contract should answer two questions:

1. What packages can an external plugin author depend on?
2. What packages can an official publishable plugin/entity package depend on?

## Publishing source

Official plugin/entity packages should publish from this monorepo first. Extract packages to separate repositories only when independent lifecycle, ownership, or community-maintenance needs justify the extra release infrastructure.

## Naming convention

Public plugin packages should use distinctive Rizom Brain names for npm discovery:

- official packages: `@rizom/brain-plugin-*`, for example `@rizom/brain-plugin-note`
- scoped third-party packages: `@scope/rizom-brain-plugin-*`, for example `@yeehaa/rizom-brain-plugin-calendar`
- unscoped third-party packages: `rizom-brain-plugin-*`

Recommended discovery keywords:

```json
["rizom", "rizom-brain", "rizom-brain-plugin"]
```

Keep `@brains/*` as the private workspace/internal implementation scope, not the public npm plugin namespace.

## Package tiers

### Tier 1: public runtime package

- `@rizom/brain`

This is the installed product and public authoring package. It owns the stable plugin-authoring subpaths already planned/documented under `@rizom/brain/*`.

### Tier 2: public authoring subpaths

Published from `@rizom/brain`, not separate `@brains/*` npm packages unless a later need proves otherwise. Shipping today (verified 2026-08-14):

- `@rizom/brain` (root: blessed `z`, brain definition)
- `@rizom/brain/model`
- `@rizom/brain/plugins`
- `@rizom/brain/entities`
- `@rizom/brain/services`
- `@rizom/brain/interfaces`
- `@rizom/brain/templates`
- `@rizom/brain/deploy`
- `@rizom/brain/cli` (bin) and `@rizom/brain/tsconfig.instance.json` (tooling asset, not an authoring surface)
- no `@rizom/brain/ui` subpath: the UI library publishes separately as `@rizom/ui` (see Milestone B decision)

Site authoring is no longer a `@rizom/brain` subpath: `./site` and
`./themes` were removed and the public site surface is the separate
`@rizom/site` package, released through the site lane (see
`public-authoring-api-0.2.md`).

These subpaths are the SDK. They must have generated declarations with no `@brains/*` imports (enforced by `findInternalDeclarationImports` in `scripts/build.ts`).

Subpath curation rule (decided 2026-06-10): the list above is the
registry. Adding a subpath requires a named concrete consumer (a
package or fixture that needs it today, not speculatively), a
declaration-leak-clean build, and an edit to this list in the same
change. `./deploy` is ratified retroactively — it serves fleet deploy.
`./model` is ratified retroactively as of 2026-08-14; it shipped
without the required registry edit, which is the exact accretion this
rule exists to prevent. Anything that can't name its consumer stays
internal; this rule exists so the SDK doesn't accrete the way
`@brains/utils` did.

### Tier 3: official publishable plugin/entity packages

Examples:

- internal workspace: `@brains/note` → public package: `@rizom/brain-plugin-note`
- internal workspace: `@brains/topics` → public package: `@rizom/brain-plugin-topics`
- internal workspace: `@brains/blog` → public package: `@rizom/brain-plugin-blog`
- internal workspace: `@brains/link` → public package: `@rizom/brain-plugin-link`
- internal workspace: `@brains/decks` → public package: `@rizom/brain-plugin-decks`
- internal workspace: `@brains/social-media` → public package: `@rizom/brain-plugin-social-media`

These packages may be published as official plugins, but they should consume only the same public authoring contract available to external plugins.

Allowed dependencies for published official plugins:

- `@rizom/brain` public subpaths
- normal third-party npm dependencies
- optional public UI/template package or subpath once defined

Disallowed dependencies for published official plugins:

- shell internals
- app internals
- private `@brains/*` workspaces
- internal shared packages such as `@brains/utils` unless intentionally promoted to a public npm package

### Tier 4: private internal workspaces

Examples:

- `@brains/utils`
- `@brains/ui-library`
- shell service implementations
- registries, storage adapters, DB helpers, test harnesses

These may remain workspace-internal implementation details. They can be used by the runtime package and internal implementation code, but should not appear in published plugin package dependencies or generated declarations.

## Decision: do not publish `@brains/utils` as the SDK

`@brains/utils` is currently useful, but publishing it directly would freeze an accidental grab bag as public API. Instead:

- keep `@brains/utils` private/internal for now
- promote only proven stable utilities into curated `@rizom/brain/*` subpaths
- expose a blessed `z` from the root `@rizom/brain` export for plugin/entity schema authoring, avoiding schema-version skew without publishing all utilities

### Zod version policy (decided 2026-06-10; updated after Zod 4 migration)

The blessed `z` cannot diverge from the workspace zod: the public
subpaths re-export schemas built with the workspace `z`, and mixing zod
majors in author code produces incompatible schema classes. So:

1. The blessed `z` **is** the workspace zod — now Zod 4. Plugin packages
   must not declare their own `zod` dependency; they use the blessed
   export exclusively (enforce with the step-4 dependency rules). The
   zod major is an SDK internal that authors inherit.
2. The repo-wide Zod 4 migration was a **release blocker for the first
   stable (non-alpha) `@rizom/brain`**; do not reintroduce Zod 3 into
   repo-owned schema boundaries or external plugin examples.
3. External plugin packages import `z` from `@rizom/brain`, not from `zod`,
   so the SDK owns the schema-version boundary.

The internal grab-bag has already been broken up: ops/env/cert moved to `@brains/deploy-support`, shared contracts to `@brains/contracts`, presentation/UI helpers to `@brains/ui-library`, entity URL/preview helpers to `@brains/site-composition`, formatters to `@brains/content-formatters`, and image markdown to `@brains/image`. Remaining boundary work is the curation question below: deciding which of the surviving `@brains/utils` primitives belong on the public `@rizom/brain/*` surface.

Candidate utilities to promote deliberately:

- public schema helpers that are part of entity/plugin contracts
- `Logger` type or a narrow public logger interface
- `ProgressReporter` type if plugin authors implement jobs
- stable ID helpers only if official plugins cannot avoid them
- frontmatter/markdown helpers required by entity adapters
- public error/result helpers used by tools/jobs

Non-candidates for promotion without more review:

- broad formatting internals
- filesystem/path helpers
- package build helpers
- internal process/env helpers
- implementation-specific logger constructors

## Decision: promote `@brains/contracts` and curated `@brains/utils` slices (decided 2026-08-14)

Measured against real usage rather than argued from principle. These
two are the most-shared private dependencies across `entities/`
(`utils` 17 packages, `contracts` 12), so they gate more migrations
than any capability does.

### `@brains/contracts` — promote a curated majority

It is not a grab bag. 1620 lines across 22 individually-named contract
modules (`actor-ref`, `job-result`, `message-channels`, `publish-types`,
`style-guide`, `progress-steps`, …), whose whole purpose is typed
contracts crossing package boundaries — which is what an authoring SDK
is. It is already a dependency of `@brains/plugins`, and the SDK already
re-exports contract-shaped symbols such as `AgentResponse` and
`ChatContext`, so it is partially surfaced already.

What entity packages actually import is a coherent slice:
`fetchStyleGuide` / `formatVoiceGuidance` / `styleGuideFromEntity` (8
each), `generationResultSchema` (6), `PUBLISH_CHANNELS` /
`PublishProvider` (5), `JobResult` (5), `actorRefKey` / `ActorRef` (5),
`PROGRESS_STEPS` (3).

Modules that stay internal for now: `db-config`, `projection-wave`,
`site-build`, `inbound-email`, `playbook-lifecycle-starter`.

### `@brains/utils` — promote slices, never the package

The earlier decision stands: publishing the package would freeze an
accidental grab bag (26 subpaths, 2603 lines). But usage is heavily
concentrated, and the concentration matches the promotion candidates
already listed above almost exactly:

| Subpath        | Import sites | Symbols actually used                                                                                  |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `zod`          | 139          | `z`                                                                                                    |
| `logger`       | 48           | `Logger`                                                                                               |
| `string-utils` | 41           | `slugify`, `slugifyUrl`, `truncateText`, `firstSentence`, `generateIdFromText`, `calculateReadingTime` |
| `error`        | 21           | `getErrorMessage`                                                                                      |
| `progress`     | 17           | `ProgressReporter`                                                                                     |
| `markdown`     | 10           | `parseMarkdown`, `updateFrontmatterField`                                                              |
| `hash`         | 8            | `computeContentHash`                                                                                   |

**`z` is already on the SDK root.** The largest single usage is not a
missing capability — those 139 sites are importing from the wrong
place. Swapping them is mechanical and removes over half the utils
problem without any surface change.

### Measured effect, and the honest limit

With contracts and these slices on the SDK, publishable-clean goes from
1 package to 3: `prompt`, `style-guide`, `wishlist`. Necessary but not
sufficient. It clears the two most-shared blockers and exposes the next
tier: `ui-library` (11 packages, now decided — publish as `@rizom/ui`),
`content-formatters` (8), `atproto-contracts` (8),
`media-page-composer` (4).

### Order of work (revised 2026-08-14 after measuring)

The first ordering put the `z` swap first as "mechanical and
self-proving". Measurement killed it: **every** package that imports
`@brains/utils` also imports `@brains/utils/logger`, so swapping only
`zod` leaves all 17 still on utils and makes zero packages cleaner. It
is not a step, it is part of the utils promotion.

Worse, promoting utils slices cannot come first at all. The curation
rule requires a consumer in the same change, and the only two packages
on the SDK today — `prompt` and `style-guide` — use no utils. Promoting
them now would be speculative by definition.

Contracts does have a consumer today, so the order inverts:

1. **Promote the style-guide contract module** onto the SDK —
   **DONE 2026-08-14**. Named consumer: `@brains/style-guide`, which is
   now publishable-clean; its `src` imports only `@brains/sdk/entities`.
   Publishable-clean is 2 of 18. Promotion required three edits beyond
   the re-export, each caught by an existing gate rather than
   remembered: `@brains/contracts` added to the SDK package (already in
   the declaration-inline allowlist), the new symbols classified in the
   export ledger, and the same symbols published in
   `docs/public-release/AUTHORING_API_0.2.md`, the frozen stable-API
   document. Any future promotion pays the same three.
2. **Extend the declarative surface, one capability at a time, with a
   named migrating consumer** — measured 2026-08-15, this is what
   actually blocks everything below it. Only `prompt` and `style-guide`
   are declarative; the other 15 entity packages all still extend
   `EntityPlugin`. `defineEntity`/`defineEntityPackage` accept type,
   purpose, metadata, markdown codec, config, seed, and projections and
   nothing else, while every remaining package needs at least one of
   templates (12 packages), datasources (10), or handlers/tools/widgets
   (14). So dependency promotion alone frees nobody: a class-based
   package that stops importing `@brains/utils` still imports
   `@brains/plugins` for `EntityPlugin` and is no closer to
   publishable-clean.

   The first capability pair looked like templates and datasources,
   proven by `@brains/doc` — 396 lines, one test, and the only
   class-based package whose sole needs are templates, datasources, and
   an entity type config. Templates work: a `templates` slot on
   `defineEntity` registers through the existing `EntityPlugin` hook and
   `Template` inlines cleanly into the published declarations.

   **Datasources do not, and the reason is structural — measured
   2026-08-15 by attempting it.** The published declarations may not
   import `@brains/*` (`findInternalDeclarationImports` fails the build),
   so every referenced type is inlined into `dist/*.d.ts`. A type that
   inlines to something nominally distinct from its source is therefore
   unusable across the boundary, and the golden-fixture compile catches
   it because one fixture resolves the surface through `dist` while
   another resolves it through source.

   Two types fail that test:

   - `Logger` is a class with six private fields. Inlined, it is a
     different type — "separate declarations of a private property
     'level'" — so nothing is assignable. Fixed by
     `LoggerContract` in `@brains/utils/logger`, a structural interface
     `Logger` satisfies; `BaseEntityDataSource` now takes the contract.
     Any future promotion of a class with private state hits the same
     wall and needs the same treatment.
   - `DataSource` is worse: its `fetch` takes `BaseDataSourceContext`,
     which carries a scoped `entityService`, which reaches
     `ProjectionStore`. Publishing the datasource API therefore drags the
     entity-service runtime across the boundary. No structural wrapper
     fixes this in passing — it needs a _public_ data source contract
     that does not hand the author a runtime service.

   **Resolved 2026-08-15 by `defineEntityDataSource`.** The public
   contract is an entity-backed data source declared as configuration plus
   pure functions over already-loaded entities — `transform`, `list`, and
   an optional `detail`. `BaseEntityDataSource` was already config-driven
   and did all the entity reads itself, so the declarative form needed no
   runtime service at all. Nothing in the contract references
   `entityService`, `DataSource`, or `BaseDataSourceContext`, and it
   therefore inlines as plain data.

   One capability had to be added rather than wrapped: `@brains/doc`
   overrode `fetch` so its detail view could show the whole ordered doc
   set and derive prev/next from the display order. The detail hook now
   receives `siblings` — the same list the runtime already loads to
   resolve navigation — which removed the last reason to reach for the
   entity service.

   `@brains/doc` is migrated and imports only `@brains/sdk/entities`.
   Publishable-clean is 3 of 18. Its plugin id became the package-scoped
   `@brains/doc:doc`, matching `prompt` and `style-guide`; capability ids
   are unchanged, so only plugin-id assertions moved.
   **`@brains/products` followed, and needed two more capabilities.**
   Attachments are now declarative — the entity declares the attachment
   type and a provider factory, and the runtime owns registration and
   teardown, so no package holds unregister handles. That required the
   same structural treatment one level down:
   `MediaAttachmentContext` in `@brains/media-page-composer` was a
   `Pick<EntityPluginContext, "entityService" | …>`, which names the
   runtime service; it is now an interface naming the four members
   providers actually use.

   Products also reads two entity types in one data source, which the
   entity-backed form cannot express. `defineDataSource` is the general
   form: one `fetch` over a narrow `EntityQueryReader` (`list` and
   `get`), with the runtime validating the returned data against the
   caller's schema. That keeps both the entity service and the schema
   type off the public surface, and subsumes the entity-backed form,
   which stays as sugar for the common case.

   Publishable-clean is 4 of 18. Two more incidental findings: products'
   `route` config was declared and never read, and `ogImageId` had to
   move into product metadata for the same reason `sourcePath` did in
   doc.

   The remaining 13 packages all need at least one of: generation
   handlers (8), eval handlers (9), dashboard widgets (5), job handlers
   (5), instructions (5), or create interception (5). No single
   capability frees a package on its own from here.

   Two ledger notes: the twelve new symbols are
   `advanced-with-consumer`, not `stable`, because their consumer is an
   in-repo package rather than a golden fixture; and
   `parseMarkdownWithFrontmatter` and `paginationInfoSchema` moved out of
   `internal/removable` deliberately — they are pure helpers over plain
   data with a real consumer, unlike `DataSource` and
   `BaseDataSourceContext`, which stay removable and unexported.

3. **Promote the remaining entity-facing contract modules** as their
   consumers migrate, not before.
4. **Promote the utils slices**, alongside the first package that needs
   them. `@brains/doc` needs exactly two — `slugify` and the `Logger`
   type — so those two go with its migration and the rest keep waiting
   for their own consumers. The earlier "all seven as one unit" reading
   was wrong: it came from measuring which packages a _subset_ frees
   while assuming the authoring shape was already solved. It is the
   declarative capability, not the slice count, that frees a package.

   Promoting all seven eventually clears utils for 13 of 17; the other four
   (`agent-discovery`, `conversation-memory`, `social-media`, and
   `site-info` — now a plugin rather than an entity, but on the same
   promotion path) also touch tail subpaths — `safe-public-fetch`,
   `p-limit`, `sort`, `env-schema`, `fetch-like` — which are on the
   plan's existing non-candidate list and need refactoring out rather
   than promoting.

Where promoted symbols land, decided by concern rather than by a
`utils` bucket, so the surface cannot accrete the way `@brains/utils`
did:

- `@rizom/brain/plugins` — runtime contracts a plugin author receives
  or implements: `Logger`, `ProgressReporter`, `getErrorMessage`.
- `@rizom/brain/entities` — content/text helpers used when authoring
  entities: slug and text helpers, markdown helpers, content hashing,
  and the style-guide contract.

There is deliberately no `@rizom/brain/utils` subpath: the name would
invite exactly the accretion this plan is trying to avoid.

## Decision: publish the UI library as `@rizom/ui` (Milestone B, decided 2026-08-14)

Supersedes "keep UI private until there is a narrow public surface",
which deferred the call pending measurement. The measurement:

- 11 of 19 entity packages import `@brains/ui-library` — the single
  largest remaining blocker to publishable-clean, ahead of
  `content-formatters` and `atproto-contracts` at 8 each.
- They use roughly 20 components, concentrated rather than scattered:
  `Head` (15 sites), `Card` (14), `formatDate` (9), `MarkdownContent`
  (7), `CardTitle` (7), `EmptyState` (6), `CardMetadata` (6),
  `ListPageHeader` (5), then `StatusBadge`, `OgCard`, `LinkButton`,
  `CoverImage`, `Pagination`, `Breadcrumb`, `BackLink`, widget
  primitives.
- The package is ~6300 lines.

**Decision: publish it as `@rizom/ui`, a separate package on its own
release lane.** Not a `@rizom/brain` subpath.

Why not the other two options the earlier decision listed:

- _Package-local components plus preact_ duplicates ~20 components
  across 11 packages, and guarantees they drift. Worse than the problem.
- _Narrow renderer contracts from `@rizom/brain/templates`_ only works
  if what packages need is a rendering seam. It isn't — they need
  concrete shared components. Wrapping a design system in a contract
  layer to avoid admitting it is a design system is indirection with no
  payoff.

Why a separate package rather than a `@rizom/brain` subpath:

- It is a design system with its own cadence. Component churn should not
  force a Brain SDK version bump, and vice versa.
- Precedent exists and worked: `@rizom/site` was split out of
  `@rizom/brain` for the same reason and ships through the site lane.
- It keeps the Brain SDK about authoring contracts. Bundling a
  component library into it is exactly the accretion the subpath
  curation rule exists to prevent.

Consequences to settle when this is implemented:

- The published surface must be curated the way `@rizom/brain/*` is —
  an export ledger entry and a stable-API document section, not a
  wholesale `export *` of 6300 lines.
- `preact` becomes a public peer dependency, so its version is part of
  the contract.
- Theme packages (`@brains/theme-*`) and `@brains/rizom-ui` need
  checking for overlap before this lands; they may belong in the same
  package or may need a boundary of their own.

## Decision: promote auth to a public interface surface (decided 2026-08-14)

`@brains/auth-service` is the one dependency in the audit below that no
import swap can resolve. Five packages reach it directly, and they do
so through `getActiveAuthService()` — a module-level singleton
(`shell/auth-service/src/auth-service-plugin.ts:133`) returning
`AuthService | undefined`. There is no auth namespace on any plugin
context, so these packages read ambient shell state instead of
receiving a capability. They cannot reach the public-only shape this
plan requires until that is fixed.

The concrete surface in use is seven operations plus one type:

| Operation                          | Consumer                      |
| ---------------------------------- | ----------------------------- |
| `resolveSession(request)`          | `interfaces/web-chat`         |
| `createAuthLoginResponse(request)` | `interfaces/web-chat`         |
| `resolveBearerGrant(...)`          | `interfaces/mcp`              |
| `getIssuer()`                      | `interfaces/a2a`              |
| `getA2APeerTrust(domain)`          | `interfaces/a2a`              |
| `grantA2APeerTrust(...)`           | `entities/agent-discovery`    |
| `revokeA2APeerTrust(...)`          | `entities/agent-discovery`    |
| `AuthPrincipal` (type only)        | `interfaces/chat`, `web-chat` |

Plus `isLoopbackIssuer` and `issuerFromRequest`, pure functions
imported by `interfaces/a2a`.

Decisions:

1. **Split by concern, not by package.** Transport authentication
   (`resolveSession`, `createAuthLoginResponse`, `resolveBearerGrant`,
   `getIssuer`) is meaningful only to an interface. It goes on
   `InterfacePluginContext` as `context.auth`, surfaced through
   `@rizom/brain/interfaces`. It does **not** go on
   `BasePluginContext` — entity packages must not see it.
2. **A2A peer trust is a separate domain capability, not transport
   auth.** `getA2APeerTrust` / `grantA2APeerTrust` /
   `revokeA2APeerTrust` get their own narrow namespace rather than
   riding along on `context.auth`. `entities/agent-discovery` mutating
   auth-service state is the sharpest boundary violation in the audit,
   and naming it "auth" would preserve the confusion that produced it.
   Whether that namespace lands on the entity context or the package
   converts to a compound `plugins/` package is settled during the
   slice, not here — but it is a trust capability either way.
3. **Presence becomes explicit.** `interfaces/mcp` currently infers
   "HTTP auth is configured" from `getActiveAuthService() !== undefined`.
   The public surface exposes an explicit predicate instead;
   undefined-sniffing a singleton is not a contract.
4. **`AuthPrincipal` is a contract type**, so it moves to the public
   contract surface alongside the namespace, not into consumer-local
   redefinitions.
5. **`interfaces/chat` is the migration template.** It already takes
   `identityAccess: () => ChatIdentityAccess | undefined` as a
   constructor parameter (`chat-interface.ts:137`) with
   `getActiveAuthService` only as the default argument. It is
   structurally injectable today; the other four are not. Migrate the
   remaining consumers to that shape first, then remove the default.

Sequencing: this slice is a prerequisite for any interface package
reaching the public-only shape, but it is **not** a prerequisite for
Milestone A — `@brains/note` does not touch auth. Run it after
Milestone A proves the entity shape, and before the first interface
package migrates.

## Import policy matrix

| Importer                           | Allowed imports                                                                    | Forbidden imports                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| External plugin package            | `@rizom/brain/*`, third-party deps                                                 | `@brains/*`, shell/app internals                    |
| Official publishable plugin/entity | `@rizom/brain/*`, third-party deps, approved public UI surface                     | shell/app internals, private `@brains/*` workspaces |
| `@rizom/brain` public entries      | curated contract modules only                                                      | exports that leak `@brains/*` declarations          |
| Internal runtime implementation    | internal workspaces as needed                                                      | leaking internal types through public entries       |
| Tests/fixtures                     | public entries for external-authoring tests; internal harnesses for internal tests | using internal imports in public fixture tests      |

## Migration strategy

### 1. Inventory official plugin dependencies

For each candidate official plugin/entity package, classify imports as:

- already public via `@rizom/brain/*`
- should be promoted to public contract
- should remain internal and be replaced by a local implementation or different abstraction
- should move to third-party dependency

Proof-package selection was corrected on 2026-08-14 — see "Correction:
the proof package is `@brains/prompt`, not `@brains/note`" below. Use
`@brains/topics` later as a second-stage proof once the UI/template and
formatter boundaries are clearer.

A repo-wide pass of this inventory across all entity and interface
packages is recorded in "Related finding: internal facade bypass
audit" below. Its categories A, C, and D land before Milestone A.

### 2. Expand public entries only from concrete needs

Add exports to `@rizom/brain/*` one small slice at a time. Each slice must satisfy the public contract rules:

- generated declarations contain no `@brains/*` imports
- external fixture or official plugin typecheck proves usage
- no shell/app implementation classes leak through the API

### 3. Convert one official plugin to public-only imports

Use `@brains/prompt` as the first proof package (see the correction
below for why it replaced `@brains/note`).

Acceptance for that package:

- package source imports no private `@brains/*` workspaces except its own package-relative imports
- package declarations/build output do not require private workspaces
- unit tests, package evals, and Rover evals still pass

### 4. Add enforcement

Enforcement splits into two independently-landable halves (split
decided 2026-08-14). The internal half does not depend on the
`@brains/note` proof and should not wait for it — it is only writable
while the tree is clean, and it decays the moment it isn't.

**4a. Internal facade boundary — LANDED 2026-08-14.**
`entities-can-only-import-plugin-facade-and-shared` and
`interfaces-can-only-import-plugin-facade-and-shared` in
`.dependency-cruiser.js` replace the former
`*-can-only-import-shell-and-shared` rules. Entity and interface
packages may now reach `shared/*` and the `shell/plugins` facade only;
every other `shell/*` service is rejected, and the `plugins/`
service-plugin tier stays forbidden as before. One temporary exception
allows `shell/auth-service`, carrying an inline comment naming the auth
surface slice that deletes it. Verified by probe: an entity importing
`@brains/templates` and an interface importing a `plugins/` package are
both rejected, while the `shell/auth-service` exception passes.

This was only writable because categories A, C, and D of the audit
below had already landed — the rule is meaningless against dependency
lists that are simultaneously over- and under-stated.

**4b. Published-plugin boundary — still gated on the Milestone A
proof.** Once one package proves the shape, add:

- published official plugins cannot import private workspaces
- public entry declarations cannot contain `@brains/*`
- external plugin fixture cannot import `@brains/*`
- declared and imported dependencies agree per package, so neither
  phantom nor stale entries can hide a boundary crossing (categories C
  and D of the audit below); `arch:check` sees only import edges and
  `manypkg check` sees only version consistency, so a dependency
  declared-but-unimported is invisible to both. 4a closed the current
  instances but does not prevent the next one.

### 5. Repeat package by package

Refactor packages in isolated worktrees, one package at a time. Do not combine public SDK expansion, dependency enforcement, and multiple package migrations in one PR unless the change is purely mechanical and already proven.

Sequencing gate (decided 2026-06-10, superseded 2026-08-14): before
rolling out to the remaining entity packages, design the
adapter/handler scaffolding helpers from the related-finding section
below and land them on the public surface — otherwise twenty-plus
packages get migrated twice (once raw, once onto the helpers).

The rest of the original gate — "the `@brains/note` proof waits only
for the blessed `z`; note already extends the public `EntityPlugin`, so
its migration is an import swap" — was wrong on every clause and is
retracted. See the correction below.

## Correction: the proof package is `@brains/prompt`, not `@brains/note` (2026-08-14)

Checked against the tree, the original Milestone A framing failed three
ways:

1. **The blessed `z` already ships.** `@rizom/brain/entities` exports
   it directly. Nothing was waiting on it.
2. **`EntityPlugin` is not public.** It is exported from no entry under
   `packages/brain-cli/src/entries/`. Entity packages cannot extend it
   through the public surface at all.
3. **The migration is not an import swap.** The public entity surface
   is _declarative_ — `defineEntity`, `defineEntityPackage`,
   `defineProjection`, `z`, `EntityOf` — while every entity package in
   the repo is written in the _imperative_ base-class style
   (`class X extends EntityPlugin`, `BaseEntityAdapter`, job-handler
   base classes). The golden fixture at
   `packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts`
   is 62 lines with no classes. Migration is a rewrite between two
   authoring styles.

`@brains/note` was selected as "smallest" by dependency count, which
measured the wrong axis. At 918 lines of src it needs five capabilities
the declarative surface does not cover: an AI generation job handler, an
upload/markdown-import job handler, PDF extraction via
`@brains/document`, create-interception (`CreateInput`,
`CreateExecutionContext`, `CreateInterceptionResult`), and an atproto
projection with lexicons — `defineProjection` covers entity→entity
derivation, not atproto record publication. Proving the model there
means designing five public capabilities simultaneously, exactly what
step 5 forbids.

**Selected instead: `@brains/prompt`** — 170 lines of src, using only
`EntityPlugin` + `BaseEntityAdapter`, which is the shape `defineEntity`

- `defineEntityPackage` already targets. `@brains/style-guide` (195
  lines, same two symbols) is the natural second, then `@brains/wishlist`
  (543 lines, same two symbols). `@brains/note` becomes a later milestone
  that drives the handler/projection surface deliberately.

Selection criterion going forward: pick proof packages by _capability
shape_ — which public helpers they require — not by dependency count.

## Suggested first worktree

Branch/worktree:

```bash
refactor/npm-package-boundaries
```

### Milestone A: non-UI publish-path proof

First implementation slice, against `@brains/prompt`:

1. inventory `@brains/prompt` imports
2. map each non-relative import to a public/private decision
3. add only the smallest missing `@rizom/brain/*` public exports needed by prompt
4. convert prompt to the declarative `define*` surface
5. run targeted typecheck/tests plus a declaration-leak-clean build

This milestone intentionally avoids the UI/template question. It proves the official-package dependency model, public SDK gaps, declaration cleanliness, and package-build shape without freezing a broader UI surface.

**Known gap this slice must close (found 2026-08-14).** `defineEntity`
accepts only `type`, `purpose`, `metadata`, and an optional `markdown`
codec; `declarative-entity-plugin.ts` never calls
`getEntityTypeConfig`, so declaratively-defined entities always take
the `EntityPlugin` defaults. `@brains/prompt` deliberately overrides
them with `{ embeddable: false, projectionSource: false,
projectionSourceRole: "excluded" }` — prompts are system configuration,
not user content. Since `embeddable` and `projectionSource` both
default to `true`, migrating prompt without first extending
`defineEntity` would silently start embedding prompts and treating them
as projection sources. That is a behavior regression, not a cosmetic
one, and it is the first concrete instance of step 2's "expand public
entries only from concrete needs" — with prompt as the named consumer.

The markdown codec itself is expressive enough: `decode` receives
parsed frontmatter and returns `{content, metadata}`, which covers
prompt's derived `slug`, and `encode` covers its `toMarkdown`. No
extension needed there.

**Status 2026-08-14: the `config` slot is landed.** `defineEntity` now
accepts `config?: EntityDefinitionConfig` (weight, embeddable,
projectionSource, projectionSourceRole), `DeclarativeEntityPlugin`
overrides `getEntityTypeConfig` to return it, and it is exported from
`@brains/plugins` and `@rizom/brain/entities`. Covered by two tests in
`shell/plugins/test/entity-definition.test.ts` asserting through the
entity registry: declared config registers, and undeclared config
registers no overrides so the runtime keeps its own defaults.

### Milestone A: DONE (2026-08-14)

`@brains/prompt` is migrated. `entities/prompt/src` is a single 75-line
file whose only non-relative import is `@brains/sdk/entities` — no
`@brains/plugins`, no `@brains/utils`, no shell internals. The package
collapsed from four source files (plugin class, schema module, adapter
class, barrel) to one definition plus a markdown codec, and its three
test files became one. `slugify` was inlined rather than imported from
`@brains/utils`, which published packages may not depend on.

Four things the slice established that the packed fixtures had not:

1. **`isolatedDeclarations` was never exercised on the golden path.**
   Every in-repo package sets it; the fixture at
   `packages/brain-cli/test/fixtures/public-authoring/entity/` does not.
   Under it, `defineEntity` and `defineEntityPackage` results cannot be
   inferred — both need explicit annotations, and the metadata schema
   must be a nameable type rather than an inline `z.object`. This is an
   ergonomic gap in the declarative surface for any author using the
   repo's own compiler settings, and it means `EntityDefinition` and
   `EntityPackageDefinition` must stay exported for annotation use.
2. **Declarative packages get package-scoped plugin ids.** `scope()` in
   `instantiatePluginPackageDefinition` yields
   `${packageName}:${localId}`, so prompt's plugin id is now
   `@brains/prompt:prompt` rather than bare `prompt`. This is correct —
   it is what stops independently published packages colliding — and the
   _capability_ id in the brain definition stays bare, so bundles and
   `brain.yaml` overrides are unaffected. Only code matching on
   instantiated plugin ids needed updating.
3. **The canonical brain had no path to register a declarative
   package.** `CapabilityEntry` takes a `PluginFactory`, and metadata is
   bound by the package registry only for `brain.yaml` package refs, not
   for direct imports. `packageCapability()` in `canonical-brain.ts`
   bridges the two — binding metadata and adapting to the factory shape.
   It lives in layer 3 deliberately: instantiation is the composer's
   job, so declaratively-authored packages never reach for shell
   internals to register themselves.
4. **The entity-type config slot was load-bearing, as predicted.**
   Without it prompt would have silently become embeddable.

### Capability census: prompt was the only free package (2026-08-14)

A feature scan across all 19 entity packages, run after prompt landed,
corrects an earlier mis-selection. `@brains/prompt` was the **only**
package with no capability beyond schema and adapter. Every other one
needs at least `onRegister`:

| Capability needed    | Packages |
| -------------------- | -------- |
| `onRegister`         | 17       |
| `registerHandler`    | 13       |
| `createTemplate`     | 11       |
| `DataSource`         | 10       |
| generation handlers  | 8        |
| `interceptCreate`    | 6        |
| `attachments`        | 6        |
| `getProjectionRules` | 5        |

Selecting proof packages by line count or by grepping for base-class
names was not enough — it missed lifecycle hooks entirely. Selection
must be by the capability census above.

The `onRegister` bodies are heterogeneous: style-guide subscribes to a
channel and seeds a default; wishlist subscribes and registers a
dashboard widget; products registers attachment providers; site-info
reads identity for a datasource. So there is no single narrow
declaration that covers them, and a general `onRegister` escape hatch
was rejected: handing declarative packages the whole plugin context
undoes the curation the surface exists for. The direction is
per-capability declarations, matching what the service surface already
does with `defineJob`, `defineTool`, and `defineDashboardWidget`.

### Landed capability: declarative entity seeding (2026-08-14)

`defineEntity({ seed })` declares a default entity the brain should hold
before anyone authors one. `EntitySeedDefinition` carries a named
trigger, an id, a lazy `content()`, and optional metadata. Seeding is
create-if-absent, so it can never overwrite authored content.

Triggers are named (`content-sync-completed`) rather than raw channel
strings, and `SEED_TRIGGER_CHANNELS` in `declarative-entity-plugin.ts`
maps them to internal channels, so the public surface never names a
channel. Only the one trigger with a consumer exists, per the curation
rule. Covered by four tests: not created before the signal, created on
the signal, existing entity untouched, and inert when no seed is
declared.

### Milestone A2: `@brains/style-guide` DONE (2026-08-14)

Migrated onto seeding. `entities/style-guide/src` is now one file
importing only `@brains/sdk/entities` and `@brains/contracts` (a shared
package, permitted). Four source files and two test files collapsed to
one each; no custom markdown codec was needed.

**Storage shape changed deliberately.** The guide's structured data
(`name`, `messaging`, `voice`, `visual`) previously lived in markdown
frontmatter with entity `metadata` pinned to `{}`, and `fetchStyleGuide`
re-parsed it out of `content` on every read. It now lives in `metadata`,
which is what the default codec already produces, and `content` holds
only the guidance prose. `styleGuideFromEntity` in `@brains/contracts`
is the single reader; entities whose metadata does not satisfy the
schema — including pre-migration rows — degrade to
`DEFAULT_STYLE_GUIDE` rather than erroring, and repopulate on the next
directory-sync import since the markdown file on disk is the source of
truth. No compatibility shim was kept (decided with the user; matches
AGENTS.md's default).

### Reframing: most `entities/` packages are not entities (2026-08-14)

Three successive attempts to pick "the next cheap package" under-read
what the packages do, because a capability grep measures base classes
and misses both cross-cutting dependencies and service behaviour. The
full two-axis analysis:

**Dependency axis** — private workspaces each package needs beyond
`@brains/sdk`:

| Dependency                    | Packages | Status                                                              |
| ----------------------------- | -------- | ------------------------------------------------------------------- |
| `@brains/utils`               | 17       | Plan already decided: never publish wholesale, curate into subpaths |
| `@brains/contracts`           | 12       | Undecided                                                           |
| `@brains/ui-library`          | 11       | Decided 2026-08-14: publish as `@rizom/ui`                          |
| `@brains/atproto-contracts`   | 8        | Undecided                                                           |
| `@brains/content-formatters`  | 8        | Undecided                                                           |
| `@brains/media-page-composer` | 4        | Undecided                                                           |

**Only `@brains/prompt` is publishable-clean.** `@brains/style-guide`
still imports `@brains/contracts`, so Milestone A2 proved the authoring
shape, not the dependency shape. Those are separate achievements and
this plan has been conflating them.

**Behaviour axis.** Inspecting rather than grepping shows most of these
packages are service-shaped, not entity-shaped:

- `site-info` serves a request/response channel
  (`SITE_METADATA_GET_CHANNEL`), subscribes to entity updates and
  re-broadcasts, takes package config, and derives content from identity
  through a `SiteInfoService`.
- `agent-discovery` ships a `ServicePlugin`, confirmable tools, and
  auth-state mutations.
- `doc`, `blog`, `link`, `portfolio`, `products`, `topics`,
  `social-media`, `decks`, `conversation-memory` register view templates
  and data sources.

`entities/AGENTS.md` says entity packages must not mix in service-plugin
responsibilities, and `plugins/AGENTS.md` describes the 1:1 entity +
service case as a compound package under `plugins/`. By those rules,
several of these are misfiled.

**First recategorisation landed 2026-08-14: `@brains/site-info` moved
to `plugins/`.** It is genuinely compound, not merely awkward: one
entity plus a 178-line `SiteInfoService` that is 1:1 with it, resolving
the entity against config defaults and identity fallbacks and
publishing the result to `plugins/site-builder` over
`SITE_METADATA_GET_CHANNEL`, re-broadcasting on change. That resolution
needs identity access and package config, neither of which
`defineEntity` has or should have. Entity schema, types and adapter now
sit under `src/entity/` per `plugins/AGENTS.md`; the package name is
unchanged, deliberately, to avoid the consumed-prerelease-changeset
churn that renaming the UI library caused.

The alternative considered and rejected: fold the resolution into
`site-builder` and leave site-info a pure entity. That moves
site-info's own defaulting rules into another package and hands
`site-builder` identity access.

**Consequence for the roadmap.** "Migrate entity packages one at a time
onto the declarative entity surface" is the wrong frame. The declarative
_entity_ surface is close to complete for things that are actually
entities — prompt and style-guide exhausted that set. The remaining work
is not more entity capabilities; it is:

1. deciding which `entities/` packages are entities and which are
   compound service packages that should move to `plugins/`;
2. the three cross-cutting dependency decisions (`utils`, `contracts`,
   `ui-library`) that gate publishability for 18 of 19 packages
   regardless of authoring style;
3. only then, per-capability declarations for whatever remains.

Adding `DataSource` or template-registration capabilities now would
violate the subpath curation rule anyway: neither has a consumer that
could actually use it, since every candidate is blocked on (1) or (2).

Item (2) is now decided for the two biggest blockers — see "Decision:
promote `@brains/contracts` and curated `@brains/utils` slices" above,
which also fixes the order of work. What remains undecided under (2) is
the next tier: `content-formatters`,
`atproto-contracts`, and `media-page-composer`. Item (1), sorting
entity-shaped packages from service-shaped ones, is still open and
should be settled before any of those packages are migrated rather than
recategorised.

Unrelated observation: `packages/brain-cli/test/import-burst-feature-load.test.ts`
is flaky under full-suite parallel load — it asserts
`embeddingCalls <= IMPORT_COUNT + 8` and was observed at 21 vs 18 during
a forced run, while passing 3/3 in isolation and on a repeat full run.
Worth a look independently of this plan.

### BLOCKER (resolved 2026-08-14): the SDK package also composed the canonical brain

Converting `@brains/prompt` to import `@rizom/brain/entities` creates a
circular workspace dependency, confirmed empirically:

```
Circular package dependency detected: @brains/prompt, @rizom/brain
Cyclic dependency detected:
  @rizom/brain#build, @brains/prompt#build
```

The cause is that `packages/brain-cli` holds two incompatible roles. It
is the **published SDK** that authoring packages import, and it is also
the **composer of the canonical brain** —
`packages/brain-cli/src/model/canonical-brain.ts` imports 46 workspace
plugins, including `promptPlugin` from `@brains/prompt` at line 39, and
`packages/brain-cli/package.json` carries 63 `@brains/*`
devDependencies. An in-repo package therefore cannot depend on the SDK
without the SDK already depending on it.

This blocks every in-repo entity package the canonical brain bundles,
not just prompt, so it gates Milestone A entirely rather than being a
prompt-specific detail.

**Resolved** by "Decision: three layers, one direction" below, which was implemented on 2026-08-14. Original analysis follows.

**Recommended resolution: the composer must not be the SDK.** Extract
canonical-brain composition out of `packages/brain-cli` into its own
workspace package (or into `shell/app`), leaving `packages/brain-cli`
as an SDK-only surface. The dependency order then runs entity packages
→ SDK, and composer → entity packages + SDK, with no cycle. The
alternative — keeping in-repo packages on `@brains/plugins` and proving
the public-only shape solely through the packed fixtures under
`packages/brain-cli/test/fixtures/public-authoring/` — preserves the
status quo but means no official package is ever verified against the
real public surface in-repo, which is the point of Milestone A.

**Second finding: `@rizom/brain` edges are invisible to `arch:check`.**
The probe passed dependency-cruiser cleanly while being circular,
because `@rizom/brain/entities` resolves to
`packages/brain-cli/dist/entities.d.ts` and the cruise config excludes
`(^|/)dist/`. Only turbo's package graph caught the cycle. So once
packages do migrate, the boundary rules will not police the SDK edge
unless resolution is pointed at source or the `dist` exclusion is
narrowed. The layering below resolves this incidentally: in-repo
packages import a workspace package by source, so the edge becomes
visible again.

## Decision: three layers, one direction (decided 2026-08-14)

The authoring surface and the canonical brain have **opposite
dependency directions**. The surface must sit _below_ plugin packages,
because they import it. The composition sits _above_ them, because it
imports 46 of them. A single package cannot occupy both positions, and
that — not any individual import — is what produced the cycle.

The cut is clean because it follows a seam that already exists.
`packages/brain-cli/src/entries/` uses exactly five workspace
dependencies — `@brains/app`, `@brains/deploy-support`,
`@brains/entity-service`, `@brains/plugins`, `@brains/templates` — and
no plugin package, transitively or otherwise. All 46 plugin imports
live in `model/`. The SDK is already dependency-clean; it is merely
co-packaged with the composer.

### Layer 1 — authoring surface (`@brains/sdk`, `packages/brain-sdk`)

The six authoring entries (`index`, `plugins`, `entities`, `services`,
`interfaces`, `templates`), ~211 lines of re-export, plus the five
shell/shared dependencies they already use. Private workspace package.

### Layer 2 — plugin packages

`entities/*`, `plugins/*`, `interfaces/*` depend on layer 1. This is
what unblocks Milestone A.

### Layer 3 — the product (`@rizom/brain`, `packages/brain-cli`)

The CLI (`commands/`, `lib/`, bin), `model/canonical-brain.ts`, and the
`model` and `deploy` entries. Depends on layer 1 **and** the 46 plugin
packages, and re-exports layer 1's subpaths so every author-facing
specifier keeps resolving to the identical symbols.

### Naming and publication

`@rizom/brain` **stays layer 3**. It is what `npm install @rizom/brain`
must deliver — CLI, canonical brain, `./model`, `./deploy`, the bin.
Because layer 3 re-exports layer 1, `@rizom/brain/plugins` and its
siblings are unchanged for external authors. This matters now:
`public-authoring-api-0.2.md` is at the gate of freezing that surface
as stable, and renaming author-facing specifiers would invalidate the
evidence matrix already accumulated against it.

Layer 1 **does not publish**, initially. `@rizom/brain/*` stays the only
published authoring specifier; in-repo packages import the private
`@brains/sdk`. The export ledger already guarantees the two are the same
symbol set, and the packed fixtures already prove the external path end
to end. Publishing layer 1 later is purely additive; publishing it now
would freeze two author-facing specifiers for one contract and leave
"which do I import?" permanently open.

### The invariant

**Layer 1 must never depend on a plugin package.** The package split
alone only resets the clock — this rule is what stops the cycle
returning the next time someone reaches for a plugin from an entry
file. It is one dependency-cruiser rule and it lands with the split.

### Known cost

`entries/` stops being one coherent directory: six files move to layer
1 while `model` and `deploy` stay in layer 3. That is the correct seam,
but it should be named in the package layout rather than left implicit.

### Mechanism note

Declarations for a re-exported workspace package are inlined via
`declarationInlinePackages` in
`packages/brain-cli/scripts/bundle-declarations.mjs`; `@brains/sdk`
must be registered there or the build's `findInternalDeclarationImports`
guard will reject the leaked `@brains/*` import.

### Milestone B: UI/template publishing

Decided 2026-08-14 — see "Decision: publish the UI library as
`@rizom/ui`" above. The three candidate shapes were resolved by
measurement: 11 packages, ~20 concentrated components, ~6300 lines, so
a separate package on its own release lane wins over package-local
duplication or a renderer-contract wrapper.

Remaining work for this milestone: create `@rizom/ui` with a curated
export surface (ledger entry plus stable-API section, not a wholesale
re-export), settle the `preact` peer-dependency contract, resolve
overlap with `@brains/theme-*` and `@brains/rizom-ui`, then migrate the
first UI-heavy package as the proof before broad rollout.

## First release scope

No official plugin/entity packages are targets for the first public release. The first public release remains centered on `@rizom/brain` and its public authoring subpaths.

`@brains/prompt` is the first proof package for the later official-plugin publishing path, not a required first-release package.

The UI/template public-surface decision was made on 2026-08-14: publish as `@rizom/ui`. Implementing it is required before publishing TSX-heavy official packages.

## Success criteria

- The public authoring contract is `@rizom/brain/*`, not internal `@brains/*` packages.
- At least one official entity package builds and typechecks using only public authoring imports.
- Generated public declarations contain no `@brains/*` imports.
- Enforcement prevents regressions after the first package migration.
- Public docs explain what external and official plugin packages may depend on.

## Related finding: plugin and entity authoring boilerplate (audit 2026-06-10)

A shell-layer refactoring audit surfaced duplication this plan's public
authoring surface should absorb when the SDK shape is curated:

- Five plugins carry 240–794-line `plugin.ts` files repeating the same
  config-schema/refine/registration pattern (`plugins/cms` 794,
  `plugins/atproto` 599, `plugins/site-builder` 359, `plugins/dashboard`
  276, `plugins/directory-sync` 240).
- The `entities/` packages share the `EntityPlugin` base (18 of 22
  extend it, and it is already exported from `@rizom/brain/plugins`) —
  but each reimplements the layer above it: adapter wiring, handler
  composition, and schema introspection.

The remaining duplication wants helpers in that layer (adapter/handler
scaffolding), surfaced through `@rizom/brain/*`. Designing them as part
of the public contract (rather than retrofitting later) keeps official
packages on the public surface from day one.

## Related finding: internal facade bypass audit (2026-08-14)

Migration step 1 was run across all 19 `entities/` and 7 `interfaces/`
packages rather than only `@brains/note`. Nothing currently detects any
of it: `bun run arch:check` reports zero violations over 2935 modules,
and `bun run workspace:check` (manypkg) passes. The tier rules allow
any `shell/*` import and manypkg checks version consistency, not
whether a declared dependency is imported or an imported package is
declared.

Internally the intended funnel is `@brains/plugins`, which already
re-exports the shell services below. That funnel is a convention with
no rule behind it, which is why it leaks.

**A. Bypasses where `@brains/plugins` already re-exports the symbol.**
Mechanical import swaps, ~40 sites:

- `@brains/templates` — 28 imports across `entities/{doc, social-media, products, link, topics, portfolio, agent-discovery, conversation-memory, decks, series, blog}` and `interfaces/a2a`. Symbols used (`createTemplate`, `Template`, `matchSpaceSelector`, `PermissionService`, `UserPermissionLevel`) are all re-exported by `@brains/plugins`.
- `@brains/mcp-service` — `Tool`, `ToolResponse`, `IMCPTransport`, `ToolVisibility` in `entities/agent-discovery` and `interfaces/mcp`.
- `@brains/job-queue` — `JobProgressEvent`, `BatchJobStatus` in the three `interfaces/chat-repl` progress components.

**B. Genuine facade gaps.** `@brains/auth-service` is the only one, and
it is handled by the decision section above.

Two further `@brains/mcp-service` imports initially looked like facade
gaps and were not — widening the facade would have been the wrong fix
in both cases, so neither symbol was added to it:

- `ConfirmationArgsStore` in `entities/agent-discovery`'s `agent_connect`
  and `agent_set_trust_level` tools. The store is the private primitive
  behind `createConfirmationGate`, whose contract is that "every
  confirmable tool goes through this so a fabricated confirmation (or
  args edited after approval) is always rejected — no tool gets to opt
  out of replay/tamper protection." Both tools had hand-rolled the gate
  around the raw store, reproducing its error prose verbatim, and so
  had opted out of the shared protection. Fixed by exporting
  `createConfirmationGate`/`ConfirmationGate` — the plugin-facing API
  that `shell/core`'s entity create/update/delete/generate tools and
  `declarative-service-plugin` already use — and routing both tools
  through it. `ConfirmationArgsStore` stays shell-private.
- `IMCPService` in `interfaces/mcp` tests, used only to annotate a mock
  assembled by spreading `createMockMCPService()`. Fixed by giving that
  `@brains/test-utils` factory an `overrides: Partial<IMCPService>`
  parameter, which supplies the contextual typing the annotation was
  standing in for. Tests now name no shell type at all.

The general rule this produced: when a plugin reaches past the facade
for a shell internal, first ask whether the facade is missing a
capability or whether the plugin is reaching around one that already
exists. Both cases here were the latter.

**C. Phantom dependencies** — imported but never declared, resolving
only through workspace `node_modules` hoisting:

- `@brains/templates`: `entities/{blog, decks, link, products, social-media, topics}`, `interfaces/a2a`
- `@brains/mcp-service`: `entities/agent-discovery`
- `@brains/job-queue`: `interfaces/chat-repl`
- `@brains/ui-library`: `entities/{link, series}`
- `@brains/contracts`: `interfaces/chat`
- `@brains/utils`: `interfaces/webserver`
- `@brains/test-utils`: roughly 13 packages

**D. Stale declared dependencies** — declared, never imported. Each is
a standing licence to bypass, and one is already a tier violation that
only unused-ness keeps green:

- `@brains/dashboard` (a `plugins/` package) declared by `entities/{agent-discovery, assessment, conversation-memory}` — an entity depending on a service plugin, which the entity tier rule would reject the moment anything imported it
- `@brains/entity-service`: `entities/{image, series, site-info}`
- `@brains/job-queue`: `entities/series`
- `@brains/conversation-service`: `entities/conversation-memory`
- `@brains/app`: `entities/{blog, decks, link, note, portfolio, products}`
- `@brains/core`: `interfaces/chat`
- `@brains/messaging-service`: `interfaces/webserver`
- `@brains/contracts`: `entities/{assessment, products}`; `@brains/test-utils`: `entities/{doc, style-guide}`

Note for Milestone A: `@brains/note`'s stale `@brains/app` devDependency
is in this list, so its real inventory is the five production
workspaces plus one dead entry to drop.

**Also noted.** `interfaces/webserver` imports
`@brains/plugins/internal/http-routes` — an export path the facade
itself labels `internal`. Not a finding: `entities/decks` tests import
`@brains/style-guide`, which `no-entity-to-entity-imports` deliberately
exempts for test files.

Sequencing against this plan: categories A, C, and D are a mechanical
chore, not a milestone. They should land before Milestone A because
they shrink the per-package inventory that step 1 has to classify, and
because a package's declared dependency list is the input to the step-4
enforcement rule — that rule cannot be written against dependency lists
that are simultaneously over- and under-stated. Category B is absorbed
by the auth decision above and the public-surface expansion in step 2.

## Blocker audit: capability or misplacement? (2026-08-15)

Nine declarative capabilities landed and no package became publishable,
so the remaining blockers were audited one at a time against a single
question: **does this entity legitimately need this, or is it a sign the
code is in the wrong package?**

The question came from `@brains/note`. It needs the uploads namespace —
but only because its upload-import job lives there. That job reads bytes
from the web-chat upload store and extracts markdown; only its last step
is about notes, and `extractMarkdownFromUpload` is not note logic. A
narrow uploads reader would have made note publishable while preserving
a coupling that should not exist, and locked it in behind a public
contract where it is far harder to remove. The surface could not express
it because it should not.

### A. Not a capability — boilerplate that disappears

- **`SYSTEM_CHANNELS.pluginsRegistered` in `wishlist`,
  `conversation-memory`, `assessment`, `agent-discovery`.** All four
  subscribe to exactly one lifecycle event, and all four do exactly one
  thing in it: register a dashboard widget. This is not a messaging
  need; it is waiting for a hook to announce a static fact.
  `defineDashboardWidget` already exists and the runtime owns
  registration order, so these vanish when the widgets convert under the
  operator plan's Phase 4. **Four of the eight messaging blockers are
  not messaging blockers.**
- **`themeCSS` in `decks`.** A local `Pick<…, "entityService" |
"themeCSS" | "identity" | "domain">` — a second copy of the media
  attachment context, which is now a promoted structural contract. Use
  it rather than re-deriving it.

### B. Misplaced code — move it, do not expose it

- **`uploads` in `@brains/note`.** As above. The fix is for whatever
  owns the upload to extract the markdown and create a note from
  content.
- **`uploads` in `image` and `document`** are not yet judged. Holding
  bytes may genuinely be the point for those two; the same question has
  to be asked rather than assumed either way.

### C. Genuine capability, wrong expression

- **`PUBLISH_CHANNELS.{register,execute,reportSuccess,reportFailure}` in
  `blog`, `decks`, `portfolio`, `social-media`.** Real participation in
  a named pipeline: "I publish entity type X, here is how, here is how
  it went." Currently four channel constants plus a lifecycle
  subscription. Wants declarative publish participation, in the same
  spirit as create routing — the package declares that it publishes, the
  runtime owns the protocol.

### D. Genuine and narrow — mechanical, same treatment as before

`entityService.deleteEntity` / `upsertEntity` / `searchWithDistances` /
`getEntityTypeConfig`; `permissions.assertEntityActionAllowed`;
`identity.getProfile`; `conversations.getMessages` / `list`;
`runtimeState.scoped`. Each narrows an existing service to what is
actually used.

Package config is the one structural gap here: `defineEntityPackage`
hardcodes an empty config schema, and `@brains/link` reads
`jinaApiKey` inside a job handler. Config is package-scoped while
handlers are entity-scoped, so this needs a shape decision rather than
another narrowing.

### E. Cross-package reach — most suspect, audit before building

`social-media` sends on `GENERATE_CHANNELS` and `IMAGE_CHANNELS`;
`topics` listens on `SHELL_CHANNELS.embedding` and calls
`semantic.project` and `insights.register`; `agent-discovery` uses
`recurringChecks` and `semantic`. These are packages asking other
packages to do work. Each deserves the note question before any contract
is designed for it.

### What this changes

The remaining work is not "add the missing capabilities". It is, in
order: let the operator conversion delete category A, move category B,
design one declarative publish participation for category C, and only
then promote the narrow slices in category D against consumers that
survive the question.

## Design: declarative publish participation (2026-08-15)

Category C of the blocker audit. `blog`, `decks`, `portfolio` and
`social-media` each participate in the publish pipeline owned by
`plugins/content-pipeline`, and each hand-rolls the same protocol.

### What a package writes today

Two subscriptions and two sends, per package:

1. Subscribe `SYSTEM_CHANNELS.pluginsRegistered`, then send
   `publish:register` with `{ entityType, provider, config }`.
2. Subscribe `publish:execute` — a broadcast every publisher receives —
   filter on `entityType`, assert the publish permission, load the
   entity, do the work, then send `publish:report:success` or
   `publish:report:failure`.

Everything except "do the work" is protocol correctness, and each
package re-implements it. Three consequences, in increasing order of
seriousness:

- `config: { executionMode: "provider" }` appears in three of the four.
  `PublishExecutionMode` has exactly one value, so it is noise.
- Every publisher receives every other entity type's publish request and
  is trusted to ignore it. Correct today; one missing filter from being
  a cross-type write.
- **Each package asserts the publish permission itself, and picks its own
  fallback when the caller context is absent.** `blog` defaults to
  `admin`. That is a security-relevant default, made independently in
  four packages, none of which is the authority on it.

### Proposed declaration

```ts
publish: {
  resultIdField?: string,      // where the provider's id is stored
  timestampField?: string,     // where the publish time is stored
  publish(context: { entity, caller }): Promise<{ id: string }>,
}
```

The runtime owns registration timing, entity-type filtering, permission
assertion, entity loading, and success/failure reporting. It reports
failure when `publish` throws, so a package cannot forget to report. The
package supplies only the work.

The permission default stops being a package decision. That alone
justifies the change independently of publishing.

### Why this is safe to do incrementally

The declaration binds on the entity side and emits the same messages
`content-pipeline` already consumes. No change to the pipeline, no
protocol version, no coordinated migration — a package converts when it
converts, and unconverted packages keep working unchanged.

### Deliberately out of scope

`social-media` also sends on `GENERATE_CHANNELS` and `IMAGE_CHANNELS`,
asking other packages to do work for it. That is category E, and it gets
the note question before any contract is designed for it. Converting its
publish participation does not require resolving it.

### Return type: confirmed, and it was not `{ id }`

`PublishResult` is `{ id, url?, metadata? }`, and the LinkedIn client
populates `url` in two places. Freezing the declaration at `{ id }` would
have silently dropped a real field — exactly the narrowing that cannot be
undone.

Checking further found the pipeline read only `result.id`, so that URL
was computed and discarded. Judged a bug rather than minimalism, and
fixed: the URL format lives inside the provider, so `platformId` alone
does not let anything downstream reconstruct it. `markEntityPublished`
now stores it as `platformUrl` when present. (`enrichedSocialPostSchema`
has a `url`, but that is site-builder enrichment — the post's URL on our
own site — and was never a home for the platform URL.)

`result.metadata` remains unread by anything, and no provider populates
it either. Left in place as inert rather than lossy.

The provider input also does not match the first sketch. Providers take
`(content, metadata, imageData?, documentData?)` and may implement
`validateCredentials()`; `social-media` uses all of it. The pipeline
renders content and media before calling the provider, so a declaration
shaped `publish({ entity, caller })` would push that rendering into every
package. The declaration should take rendered content and media, and
return `PublishResult` unchanged.

## Audit: category E, cross-package reach (2026-08-19)

The audit the category E entry asked for. Six reaches were listed across
three packages; each got the note question — _does this package
legitimately need this, or is it a sign the code is in the wrong place?_
No two answered the same way, which is the point of asking one at a time.

### `social-media` — resolved, and neither reach needed a capability

`IMAGE_CHANNELS` had no caller at all. `system_generate` builds its job
data from an explicit allowlist (`entityId`, `prompt`, `title`,
`sourceEntity*`, `targetEntity*`) and `coverImage` was never in it; no
package enqueued a generation job carrying one either. Both the branch in
`BaseGenerationJobHandler` that read it and social-media's own
`generateImage` flag were unreachable. Deleted, and `IMAGE_CHANNELS` with
them — it existed so one package could enqueue work into the image
package, and nothing does that now. The live route for a cover image is a
separate `system_generate` against the image type with `targetEntityId`,
which is what the tool description already tells an agent to do.

`GENERATE_CHANNELS` was real: participation in the generation scheduler's
protocol. Now `scheduledGeneration` on the entity — where the material
comes from, and whether to write from one source at a time or all at
once — with the runtime performing the enqueue and sending both reports.
The completion report carries the entity id, which a declaration cannot
know: it hands back content and the runtime decides where it lands. So
the runtime closes the loop it opened.

Neither was a missing capability. One was dead, the other was a protocol
the runtime should have owned.

### `agent-discovery` → `semantic.project` — legitimate, category D

Scoped to its own entity type, with an origin and a distance bound:
`project({ types: [AGENT_ENTITY_TYPE], origin: BRAIN_CHARACTER_REFERENCE,
maxNeighborDistance })`. That is "where do the agents I own sit relative
to us", which is agent-discovery's whole subject. Narrow the namespace to
a reader with `project(request)` and it is category D, mechanical.

### `topics` → `semantic.project({})` — category B, misplaced

Unbounded: no `types`, so it spans every entity type in the brain, and
the code immediately iterates `projection.points.map(p => p.entityType)`
to fetch titles per type. The knowledge map is a map of the _whole
brain_, not of topics. It lives in `topics` because topics is the package
that feels like it is about the shape of the knowledge base, not because
a topic entity needs it.

Narrowing `semantic` here would make `topics` publishable while
preserving a coupling that should not exist — the exact failure the note
question exists to catch. The map should move to whatever owns
whole-brain visualization; `topics` keeps the topic list widget.

### Registering an insight and a recurring check — category A

Both are static declarations wearing a namespace call. An insight is an
id and a provider; a recurring check is an id, a cadence, whether it
raises alerts, and a function. Neither needs a live service — they are
announcing a fact at registration, exactly like `publish`, `feed`, and
`seed` before them.

Two consumers each, so both clear the bar: `insights` in `topics` and
`analytics`, `recurringChecks` in `agent-discovery` (twice) and
`unified-inbox`. One wrinkle: `analytics` and `unified-inbox` are service
plugins while `agent-discovery`'s are entity plugins, so each slot has to
land on both surfaces or on whichever its consumers actually use. That is
a shape decision, not a capability question.

### `topics` → `SHELL_CHANNELS.embedding` — eval scaffolding, not a need

`waitForEmbeddingsToDrain` polls `jobs.getActiveJobs([SHELL_CHANNELS
.embedding])` so a seeded topic is searchable before an eval runs. It
reaches for another package's job-type constant to answer a question that
is not about embeddings: _has the pending work settled?_ Either narrow
that question — a queue-quiet reader — or drop the wait and have the eval
seed through a path that is already searchable. It should not be the
reason `topics` names a channel belonging to the shell. (The loop is also
a `for (;;)` with a sleep, which the repo's own iteration preference
rules out.)

### What this changes

Category E is not one problem. Of six reaches: two are resolved and
needed no new surface, one is category D, one is category B, and two are
category A. The remaining category E _proper_ — a package legitimately
needing another package to do work for it — is **empty**.
