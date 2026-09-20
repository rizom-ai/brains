# Plan: Studio Virtual Collections

Last updated: 2026-09-20

## Status

**Implementation and local acceptance complete; prepared for PR review. Not released or deployed.**

Implementation worktree: `studio-virtual-collections-implementation`, branch `feat/studio-virtual-collections`. The original planning worktree is unchanged.

Implemented so far:

- Source-authoritative extension projection, independent export preservation, and inactive-field preservation in entity-service. Real Note/Post tests exercise create/update, file export/reimport, and disabling/re-enabling registration.
- Grouping registry/preflight, collision checks, scoped SQLite catalog/member queries, and plugin-context forwarding.
- Keyset-paged, revision-conditional metadata-only startup reprojection; normal web/combined boot placement; process-local readiness. Source is revalidated on every serving start: unchanged declarations do not prove freshness after register-only writes with grouping disabled or after field validators change. The unreleased declaration-only cache and its migration were removed. Tests cover these restart cases, concurrent source edits, deletion, retry exhaustion, unchanged timestamps/events/export intents, and repeated passes.
- Studio declaration registration, scoped descriptors, and authenticated catalog/member endpoints with `503 groupings_initializing` and `Retry-After` admission.
- [Focused mockups](../studio-virtual-collections-mockups.html): seven states, desktop/phone, paper/instrument. Browser checks cover 28 static captures and the mock membership/save/return flow. **User approved the design.**
- React grouping routes, desktop/mobile navigation, catalog/member views, mixed-type badges, filters/pagination, initialization/error/empty states, and editor return context. Group queries have API-instance-isolated cache keys, save/delete invalidation, cancellation, and a finite **90-second** initialization retry budget; unrelated errors do not retry. A mounted-app test covers paused startup → automatic results → read-only opaque-ID member → the same filtered grouping URL. Mounted tests also cover writable saves, deletion, and replacing the API/session scope without retaining private rows or pending requests.

- Studio saves and type-scoped creation now use service deserialization. Ordinary form saves preserve existing unclaimed fields (including explicit null) without accepting new unclaimed request values. Real Note/Post tests with authenticated Studio routes cover two grouping fields, exact values, membership removal, creation, and disable/re-enable.
- Field-update tools patch registered extension/grouping fields into frontmatter, validate their persistence through owner validation and service serialization, and show JSON-formatted source values in confirmations. Tests cover removal, malformed prior values, invalid requests, full-source replacement, and edits between preview and approval.
- A real directory-sync FileOperations export/import test covers Note/Post memberships, unchanged identities/export paths, and hash-skipped unchanged imports. This uses the real file/import paths, not the background export dispatcher.
- A mounted editor save/return test verifies member refresh and catalog-cache invalidation. It exposed and fixed encoded-ID saves incorrectly creating another history entry and dropping the group return context; current-entity detection now compares route identity rather than encoded pathname spelling.
- Real authenticated routes alternate admin/trusted/public/no-session callers and verify scoped types, values, counts, hidden-value indistinguishability, and identity-specific deletion. This uncovered an internal deletion lookup restricted to public rows; it now loads the prior row at full scope, without changing caller authorization.
- `BasePlugin.shutdown()` is required, matching its implemented default no-op/overridden cleanup. Lifecycle tests cover awaiting cleanup and propagating failures. Concrete callers invoke it directly; independent `Plugin` implementations retain their optional hook.
- The exact packed consumer accepts two grouping declarations and verifies field-update confirmation, persistence, preservation, and removal. All **8 packed compatibility tests pass**. The broader canary uncovered Node-only shared chunks leaking into the public Chat export; Chat now builds separately for browsers, and frontmatter-only contract parsing no longer initializes the Markdown AST pipeline. Browser bundling and headless loading both pass.
- Isolated canonical `bun start:publishing` review: fresh auth/storage, external fetches blocked, mocked AI, and a preview rebuild requested through the running Studio workspace action. **16 production UI captures** cover catalog, members, empty, and editor on desktop/phone in paper/instrument; checked captures have no horizontal overflow or browser errors. Live actions cover type filtering, ordinary editor save/return/catalog refresh, preservation of whitespace/empty/comma-containing source values, first membership on an unassigned Note on phone, and phone deletion/return/count refresh. A missing member-page Back control was found and fixed with a regression test. Evidence: `/tmp/studio-vc-live-EmAxrc/{evidence,action-evidence}.json` and `screenshots/`. The temporary app config was restored and only this isolated runtime was stopped.
- Six changesets cover virtual collections, concrete plugin cleanup, visibility-aware deletion, browser-safe Chat packaging, the Studio Chat draft-key chunk, and bounded loop shapes. No release or deployment is part of this change.
- Review fixes applied on this branch: per-field projection validation; readable value labels with existing-value suggestions; group/entry vocabulary; catalog rows as links; case-insensitive catalog ordering; replace-on-self-correction URLs; an IME guard on ordinary tag inputs as well as literal ones; one shared Zod source for the grouping query; conservative structural comparison of reusable owner fields, requiring shared identity for runtime checks and unsupported wrappers rather than trusting lossy JSON Schema; a single frontmatter parse per row with gray-matter's cache bypassed in bulk passes; and `isGroupingContributor` in place of per-row declaration copies.
- The Chat API path had been pulled into Studio's entry bundle when the container took ownership of the chat draft store; the draft key now lives in its own chat-only module so the split-asset contract holds.
- Every `for (;;)` in the repository is gone: bounded work recurses one step at a time, and the two stream/checkpoint drains use a loop with a real condition in its head.
- The branch carries six separable concerns. Each has its own changeset, so splitting them into separate pull requests remains mechanical.

Pre-merge validation: full repository typecheck **103/103** and lint **95/95** pass. Full affected suites: entity-service **476**, plugins **621**, core **471**, Studio **580**, content-pipeline **221**, directory-sync **773**, ATProto **109**, agent-discovery **177**; shared utils **258** and contracts **48** also pass. Packed compatibility: **8/8**; real authenticated adapter/directory-sync integration: **7/7**. Docs links (1,038 files), manifest/roadmap, four changesets, and diff whitespace checks pass. Architecture has no errors and the same two documentation-script orphan warnings. These counts replace the earlier 2,162-test checkpoint.

**PR integration checkpoint:** [PR #302](https://github.com/rizom-ai/brains/pull/302) integrates main through `2b174f1e1c`, preserving the new Studio hooks/panes, Account/Chat composition, browser fetch seam, and server-only Ask Markdown parser. Grouping resolution, opaque-ID opening, editor save/delete invalidation, and exact return paths now live at the corresponding extracted boundaries. New grouping DOM tests use the shared global-restoration helper and drain their windows before restoring globals. Validation passes: **103 typecheck targets**, **95 lint targets**, **101 test targets**, **675 Studio tests**, and **8 packed compatibility tests**. All **184 Studio visual/accessibility scenarios** pass against the reviewed main baselines without feature-specific baseline or threshold changes. Docs/roadmap, architecture (the same two warnings), and four changesets pass. Logs: `/tmp/studio-vc-merge-{types,lint,tests,studio-tests,packed,visual,docs,architecture,changesets}.log`.

**Post-review validation:** repository tests **101/101 targets**, typecheck **103/103**, lint **95/95**, both format lanes, docs links (1,042 files), docs manifest (22 docs), roadmap sync, and **six changesets** pass. Affected suites: entity-service **485**, Studio **678**, plugins **621**, core **479**, directory-sync **773**, job-queue **211**, ATProto **109**, topics **146**, ai-evaluation **183**, shared utils **258**, contracts **49**, build-tools **48**. All **184 Studio visual/accessibility scenarios** pass after the review fixes, with CI-pinned Chrome 142 and the reviewed RGB rendering, against unchanged baselines and thresholds. The run recorded nothing: no baseline file was rewritten. Ordinary list fields are unaffected because the value list renders only where a grouping supplies one.

**Four follow-up regressions fixed with red-to-green tests:** owner-field comparison no longer drops runtime refinements/transforms; serving startup revalidates after disabled/register-only writes and changed field constraints; failed suggestion refetches hide cached values (including 401/403) and recover from fresh scoped data; and literal `(empty)` has a distinct label from the empty value. Check-free list contracts may be declared independently; checked contracts can share their field/schema objects. The unused, unreleased grouping-state migration is not included. Follow-up validation: **103 typecheck targets**, **95 lint targets**, **101 test targets**, **491 entity-service tests**, **681 Studio tests**, **261 shared-utils tests**, **8 packed compatibility tests**, and **184 Studio visual/accessibility scenarios** pass. Docs/roadmap, architecture (the same two warnings), six changesets, and whitespace checks pass. No baseline or threshold changed. Evidence: `/tmp/studio-vc-four-{types,lint,tests,packed,visual,docs,architecture,changesets}.log`.

**Latest main integration:** main through `65eb518e12` is integrated, retaining its lazy-workspace recovery and extracted navigation/projection coordinators. Grouping navigation now lives in `studio-type-navigation.tsx`; literal field controls remain in `entity-fields.tsx`. The reviewed SQLite retry helper follows main's transaction-runner extraction. Validation passes: **103 typecheck targets**, **95 lint targets**, **101 test targets**, **508 entity-service tests**, **688 Studio tests**, **8 packed compatibility tests**, and all **184 Studio visual/accessibility scenarios**. Docs/roadmap, six changesets, and architecture (the same two warnings) pass. Baselines and thresholds remain unchanged. Evidence: `/tmp/studio-vc-final-main-{types,lint,tests,packed,visual,docs,architecture,changesets}.log`.

**Visual baseline gate resolved and passing.** The earlier 1–4% differences reproduced with unchanged HEAD were caused by local Fontconfig rasterization settings, not application layout. With CI-pinned Chrome **142.0.7444.59** and the reviewed RGB subpixel rendering, all **184 Studio scenarios** pass baseline and accessibility/keyboard checks across desktop/tablet/phone and both climates. Baselines and thresholds are unchanged. The test-only Fontconfig setting is documented in the [visual test instructions](../../test/visual/console/README.md). Log: `/tmp/studio-vc-studio-visual-a11y.log`.

Final checks also exposed omitted test/build-script files in four existing TypeScript projects. The app-controls and base-theme tests and the two theme build scripts are now included in their projects, rather than suppressing lint; their **18 focused tests** pass. Repository typecheck and all 95 lint targets pass with these corrections.

**Literal input decision confirmed and implemented:** grouping fields preserve typed commas and spaces, with Enter/Add submission and an explicit surrounding-whitespace warning. Ordinary tags keep their existing comma/trim behavior. Grouping catalog/member/return labels and Properties distinguish empty, whitespace-sensitive, and invisible values without changing memberships or URLs: ordinary names, punctuation and single interior spaces read as themselves, while edge and repeated spaces are marked with a middle dot and control, format and exotic whitespace characters become escapes. Because matching is exact, the value input also offers the values a grouping already holds, so one group does not fragment across spellings; typing a new value stays possible. Both ordinary and System editors use this behavior only for declared grouping fields on participating types. Focused tests cover literal input, IME composition, exact deduplication/removal, blank-input no-op, read-only display, URL/label separation, and unchanged ordinary tags. A real pointer-click check exposed the Add control shifting as the input lost focus; grouping inputs now keep a stable width, with a compiled-CSS regression test. The isolated canonical app was rebuilt and reviewed again with CI-pinned Chrome: comma keystrokes, explicit Add, exact persistence, catalog → member → editor → empty-member return, and exact removal pass. Eight additional desktop/phone paper/instrument captures have no horizontal overflow or browser errors. Evidence: `/tmp/studio-vc-live-EmAxrc/literal-evidence.json` and `literal-screenshots/`. Temporary config was restored and this runtime stopped again.

Final grouping browser checks pass in desktop/phone and both climates: keyboard member → editor → return, automatic initialization recovery without stealing focus, terminal errors without implicit retry, keyboard Retry, the finite 90-second timeout (browser clock advanced), and cancellation after leaving through the real router. All **13 grouping state captures** have no horizontal overflow, browser errors, or automated WCAG violations. Failure responses are browser-local injection against the production UI; real startup/reprojection races are covered separately by service tests. Evidence: `/tmp/studio-vc-live-EmAxrc/final-ui-evidence.json` and `final-ui-captures/`.

Real-auth tests now verify that role changes, suspension, and grant revocation deny grouping reads and mutations using the same previously valid cookie. Mounted tests verify that an observed 401/403 hides cached rows and counts on the same API instance and Retry uses fresh scoped results, alongside session-instance replacement/cancellation. This does not introduce continuous permission polling or promise immediate erasure before a revoked session makes its next request.

Remaining before rollout: PR review/merge and the planned production `clients` value/permission review. The live review used synthetic additions and mocked AI; canonical seed data also produced existing invalid-status/missing-image/template warnings. This is not production migration acceptance. No visual baseline threshold was relaxed.

**The live demo is separate from the committed application fixture.** Its authenticated browser uses native responsive sizing, not a fixed test viewport. Demo scripts and isolated storage remain under `/tmp/studio-vc-live-EmAxrc`. Startup temporarily configures `packages/brain-cli/test-apps/publishing/brain.yaml`; that override must not be committed. Its original is preserved as `original-brain.yaml` in the demo directory. Do not reset demo authentication or stop a running demo without coordinating with the user.

**Editor decision confirmed:** every Note uses the normal effective frontmatter/Properties editor while `note` participates in at least one registered grouping, whether or not that Note already has membership. Multiple grouping fields appear together. With no participating grouping, Notes retain whole-document editing, including any saved frontmatter. This is the agreed exception to unchanged raw editing; other nonparticipating types are unaffected.

Scale evidence (local synthetic fixture, not production acceptance): 10,000 entities / 5,000 distinct values; cold reprojection **12.1 s**, catalog **26 ms**, members **12 ms**. Exact executed SQL plans use the existing primary-key index scan for the catalog and table scans for members; there is no existing selective type/visibility index. Both reads pass the initial 1 s fixture gate, so no membership table has been introduced. Cold reprojection passes a 30 s fixture gate; the UI uses a tested finite 90 s startup wait budget. The bounded scan runs on every serving start. A future cache must account for every writer and schema change before it can safely skip validation.

Follow-up to hierarchical navigation, shipped in [PR #267](https://github.com/rizom-ai/brains/pull/267) and released in Brain `0.2.0-alpha.388`. That work browses structured IDs within one entity type; this plan groups related entities across types by a declared frontmatter field without changing their identities or file placement. Shipped hierarchy behaviour is documented in the [Studio README](../../plugins/studio/README.md) and [entity-service README](../../shell/entity-service/README.md); file placement in the [directory-sync path conventions](../../plugins/directory-sync/README.md#path-conventions).

## Goal

Browse related content across entity types through virtual collections derived from one explicit, schema-backed frontmatter field per grouping. The capability is generic; **Clients** is the first grouping.

Terminology:

- **Grouping:** a declared dimension such as Clients, Projects, or Topics. Each grouping gets one navigation entry.
- **Virtual collection:** one value within a grouping, such as Clients → Acme.
- **Member:** an existing entity whose declared field contains that value. Its identity remains `(entityType, id)`.

A participating entity carries the grouping field in its frontmatter:

```yaml
clients:
  - Acme
  - Beta
```

That entity appears in both Clients → Acme and Clients → Beta. A note and a post appear together under Acme without being copied, renamed, or moved.

**Frontmatter is the authored source of membership.** Database metadata is a queryable projection of that field, not an independently editable membership source. An ordinary field-update tool may provide convenient authoring, but it must write the corresponding frontmatter and keep the projection consistent.

## Product scope

- Generic, cross-type grouping; Clients first, with `note` and `post` as the first participating types.
- Membership comes from explicit frontmatter values, not paths or AI inference.
- No client entity and no durable collection entity.
- One entity may belong to multiple values within a grouping.
- **Entity owners do not declare participation.** A grouping is declared once, in the brain's Studio configuration, and applied to its listed types through the existing frontmatter-extension mechanism. Configuration never overrides an entity owner's field contracts; an incompatible field fails registration.
- Navigation has one entry per declared grouping, with its values listed inside.
- Membership changes use ordinary frontmatter editing and the existing save flow. There is no membership editor, membership mutation API, or membership store.
- Removing a grouping, removing a participating type, or disabling Studio removes a view, not authored frontmatter. Ordinary saves and exports must preserve that data; re-enabling the grouping derives membership from it again.
- Creation inside virtual collections is deferred. Users create through existing entity-type collections and edit the grouping field there.

## First-version experience

1. Open **Clients** to see the values present in content the caller may read, with visible-member counts.
2. Open **Acme** to browse a flat, paged list of matching entities across participating types.
3. Rows show their entity type and existing display title.
4. Open a member in its existing editor. Existing edit/read-only permissions apply.
5. Edit its `clients` field through the normal Properties list control and save.
6. Return to the same virtual-collection URL with filters and pagination preserved. Counts and membership refresh; removing the selected value removes the entity from this collection, not from storage.

Group views have no **New**, delete-collection, or rename-collection action. Ordinary entity deletion stays in the editor and affects that entity everywhere.

Empty grouping views explain that membership is authored on participating entities. No empty client records are created to populate the catalog.

## Architecture

### Grouping declaration: one place, Studio config

Studio plugin config (`plugins/studio/src/config.ts`) gains a Zod-validated `groupings` list; types derive from the schema:

```ts
groupings: [
  {
    key: "clients",
    label: "Clients",
    field: "clients",
    types: ["note", "post"],
  },
];
```

- `key` and `field` are slugs; `key` is the navigation and route identity, `field` the frontmatter key. Keys are unique per brain.
- `types` is an explicit, non-empty list. No wildcard: a listed type without a frontmatter schema (binary types) fails at registration, which `extendFrontmatterSchema` already enforces.

On `onRegistrationComplete`, Studio first validates the complete declaration set, before applying any extensions:

1. Resolve each type and inspect its existing frontmatter, metadata, and extension field contracts. Reject reserved policy fields such as `visibility` and any incompatible collision, including `field: "title"` on notes. An existing field may be reused only when it already supports string-list membership; retain its requiredness, element restrictions, limits, and refinements. Do not replace it with a more permissive optional array.
2. Only for a genuinely new, non-conflicting field, register an optional string-list extension through `context.entities.extendFrontmatterSchema`. The existing method checks type/schema presence but does **not** protect existing field contracts; collision checks are new required work. Where compatibility cannot be established, reject the declaration instead of guessing or overwriting.
3. Register `context.entities.registerGrouping({ key, label, field, types })` — a new entity-service registry entry beside frontmatter extensions. Duplicate keys, conflicting declarations, and unregistered types fail registration. Conflicts with other registered extensions must be diagnosed rather than decided by registration order.

The grouping registry lives in entity-service because the queries resolve only registered declarations; callers never supply field names, selectors, or extra types. Other consumers (tools, site-builder) can register groupings later through the same call.

### Frontmatter extensions must round-trip through the full persistence path

Studio derives Properties descriptors from `getEffectiveFrontmatterSchema`, so `z.array(z.string()).optional()` renders as the existing string-list control. Participating Notes now use this form rather than the otherwise raw Note editor, as confirmed above. Before this implementation, the adapter round-trip stripped extension fields even when authored in source:

1. Studio writes `clients` into the frontmatter and calls `adapter.fromMarkdown(content)` → `NoteAdapter.fromMarkdown` builds `metadata` from `title`/`status`/`error` only (`entities/note/src/adapters/note-adapter.ts:59-67`) → `clients` absent from metadata.
2. `updateEntity` → `prepareEntityForStorage` → `NoteAdapter.toMarkdown` re-parses the frontmatter with its static `noteFrontmatterSchema` and rebuilds it (`note-adapter.ts:33-47`) → `clients` dropped from the stored file. `BlogPostAdapter.toMarkdown` behaves the same (`entities/blog/src/adapters/blog-post-adapter.ts:35-55`).
3. Result: the editor shows the value, storage holds neither the file key nor the metadata key.

Fixing `deserializeEntity` and `prepareEntityForStorage` alone is insufficient. Both mutations call `EntityRegistry.validateEntity` **before** storage preparation, and its owner-schema parse strips undeclared metadata keys. Separately, directory-sync exports through `serializeEntity`, which calls the adapter directly rather than storage preparation. `reconstructEntity` also strips these keys from `metadata` on ordinary reads; that is left as is, because the projection is derived from content, the grouping queries read the database column directly, and Studio reads Properties values from the content frontmatter.

Keep this responsibility in the existing entity-service registry, validation, and serializer paths, not in individual adapters or a second membership store:

- **Registry:** expose registered extension schemas for validation and projection. Preserve their validators/refinements and the owner contracts checked at registration; merging shapes alone must not weaken validation.
- **Write authority:** the submitted content frontmatter determines membership. Existing metadata is a projection, so stale metadata must not override a frontmatter edit or resurrect a removed key. A metadata-only assignment is not an implicit command to change membership.
- **Field-update tool** (`shell/core/src/system/entity-update-tool.ts`): translate explicitly requested registered extension fields into frontmatter edits before entity validation. Setting `clients` writes the validated list into content; setting it to `null` removes the key. Recompute the projection from that content. Make the tool's persistence checks use the extension-aware path rather than assuming raw adapter output describes the final write. For these fields, `currentFieldValue`/`buildUpdateDiff` must also read the previous value from frontmatter, not stripped metadata. Confirmation must show Acme → Beta, or Acme → removal, rather than `(empty)` as the previous value. Render lists unambiguously and distinguish absent fields from malformed existing values. Keep existing confirmation tokens, change detection, and authorization; the preview and execution use the same frontmatter interpretation.
- **Entity validation:** validate the owner entity and the registered extension fields, then retain the validated extension projection after any stripping owner-schema parse. Cover both create and update. Do not retain arbitrary unregistered metadata or bypass owner validation/persist validators. A requested Acme → Beta field update must still contain Beta in its frontmatter and projection when storage preparation starts.
- **`deserializeEntity`:** parse registered extension values from the input frontmatter and project them alongside adapter metadata. Studio's `handleUpdateEntity` and `prepareStudioCreation` use this service path instead of the raw adapter. Markdown import and `createEntityFromMarkdown` use the same extension-aware conversion.
- **`prepareEntityForStorage`:** preserve source frontmatter when overlaying the Markdown produced by `adapter.toMarkdown`, following the ownership rules below; derive registered fields' metadata projection from the resulting frontmatter. An absent key removes its projected value. Do not prefer an old metadata value over submitted content. Persist the Markdown, projection, content hash, and export intent through the existing mutation transaction.
- **`serializeEntity`:** apply the same frontmatter-preservation rule on this independent export path. It must work with no grouping registered and with Studio disabled, not only while an extension is active.

Preservation cannot depend solely on the active grouping registry: after removing a declaration, its former field is indistinguishable from other unclaimed frontmatter. `BaseEntityAdapter.toMarkdown` already preserves existing frontmatter and overlays the adapter's schema keys onto it (`shell/entity-service/src/adapters/base-entity-adapter.ts:120-128`); only adapters that override `toMarkdown`, such as note and blog-post, rebuild from their static schema and drop the rest. The serializer generalizes the base behaviour: after `adapter.toMarkdown`, it re-adds source frontmatter keys that are neither adapter-owned nor policy keys. Raw/body-only and binary formats keep their existing handling. Adapter-owned fields stay under their existing validation and serialization rules and policy fields under existing policy handling. Unknown values are preserved as content only; they never infer groupings, project arbitrary metadata, or grant write permissions. No durable list of retired groupings is needed. Unknown frontmatter keys surviving saves on every frontmatter type is a behaviour change to state in the release notes.

Studio must not lose these existing keys before the serializer sees them: its normal Properties/body save rebuilds content from `schema.safeParse(...).data` (`plugins/studio/src/editor-entities.ts:383-392`), which strips an inactive field. The editor path merges unclaimed, non-policy keys from `splitEntityContent(existing.content).frontmatter` into the validated form data before `generateMarkdownWithFrontmatter`; the request schema is not relaxed, so arbitrary new request keys remain unauthorable. Explicit full-source replacement and directory-sync import remain authoritative: if the submitted source omits a key, it is not resurrected from prior database content.

Malformed persisted extension fields must not be silently deleted or coerced during reads or export; preserve their source frontmatter and omit invalid fields from the projection. New writes validate against the applicable schemas. No existing malformed value is silently repaired by a read/export operation.

Validation is per registered field, against that field's own schema entry, never against the whole effective frontmatter document. A sibling the entity owner rejects belongs to owner validation and must not decide whether an entity is a member: canonical content carries invalid-status rows, and those rows are still members. One grouping's invalid value likewise leaves another grouping's membership intact. The two paths differ only in what an invalid value of the registered field itself means: a write rejects it, while the bootstrap pass omits it and leaves the source untouched.

Resulting flows:

- Studio save or full Markdown replacement → submitted frontmatter wins → consistent stored content and projection.
- Directory-sync import and `createEntityFromMarkdown` → extension-aware validation and projection.
- Directory-sync export → `serializeEntity` preserves source frontmatter → reimport preserves membership.
- Update tool `fields: { clients: ["Beta"] }` → patch frontmatter before validation → Beta persists, rather than falling back to the old Acme value.
- Typed consumer reads with a stripping schema and writes unchanged content back → frontmatter preserves membership.
- Update tool `fields: { clients: null }`, or removal in submitted frontmatter → key and projected membership both disappear.

Owner metadata schemas and adapters do not declare extension fields individually. The extension contract is Zod-validated across mutations and serialization; these are not unchecked metadata keys. The profile plugin is the existing extension user (`anchor-profile`, whose adapter parses frontmatter as a passthrough record) and must keep its behaviour.

### Initialize projections when grouping configuration changes

Registration alone does not populate query metadata. Existing content may already carry valid `clients` frontmatter while its database projection lacks the field. Directory-sync reimport skips files whose content hash matches (`plugins/directory-sync/src/lib/file-operations.ts:410-413`), and an ordinary save through the new pipeline would repair the projection but also bumps `updated` and emits mutation events (`shell/entity-service/src/entity-mutations.ts:387`). Neither is the initialization path.

`onRegistrationComplete` is not the slot either: `finalizePluginRegistrations` runs at `shell/core/src/initialization/shellBootloader.ts:126`, before the `register-only` return (line 229) and the worker return (line 234), so a pass there would run inside `brain operate` tool invocations, startup checks, and every worker boot. Studio's hook only validates and registers declarations.

The pass uses the bootloader's existing web-only startup branch (`shellBootloader.ts:242-256`), which already starts the webserver, runs initial sync through `pluginsRegistered`, and awaits `entityService.backfillMissingEmbeddings()` for the web or combined role while skipping `register-only`, `startup-check`, and worker boots. Entity-service exposes `reprojectRegisteredGroupings()`, and the bootloader awaits it immediately after the embedding backfill. Running after initial sync means imported entities are already projected through `deserializeEntity`; the pass touches only stale rows. Worker mutations maintain projections through the ordinary write path, and a worker restart never triggers the pass. Configuration changes take effect on restart; runtime reconfiguration is out of scope.

The mutation recomputes only the active grouping-field projections from stored content, in keyset pages over `(entityType, id)`, and writes only the affected metadata. It leaves `updated`, source Markdown, identities, unrelated metadata, and file paths unchanged and emits neither entity events nor file rewrites. Stale projected values are replaced, a field is cleared when its source is absent or invalid, and unchanged projections are no-ops.

Writers exist during the pass: the webserver is started before initial sync (`shellBootloader.ts:243`) and `/health/ready` reports ready on database and queue checks rather than boot completion (`shell/core/src/runtime-health.ts:498-550`), so Studio saves can arrive mid-pass. The worker is not one of them: the supervisor spawns it only after the web child reports runtime-ready (`packages/brain-cli/src/lib/process-supervisor.ts:760-765`), and a web exit stops every child (lines 672-678). Each row is read with its revision and updated conditionally on that revision in the transaction; on conflict, re-read and recompute against current state with bounded retries, and never recreate a deleted row. Retry exhaustion or another persistence failure fails boot, as an embedding-backfill failure would; the next start repeats the pass.

Gate both Studio grouping read endpoints on process-local initialization readiness. The state starts as not ready before the early webserver starts and becomes ready only after the complete reprojection pass succeeds. While not ready, authorized requests receive `503` with a stable `groupings_initializing` code and `Retry-After`, not a successful empty or partial catalog/member page. Apply the normal authentication and grouping/type access checks before returning this response. A failed pass never marks ready. This flag controls read admission only; revision checks still protect against concurrent writers, and the global health contract is unchanged.

Studio shows an initializing state for that specific response and explicitly retries those grouping queries with a capped delay within a finite startup wait window. This is a narrow exception to the existing query client's `retry: false`, not global collection polling or a new event stream. Stop retries on success, a different error, cancellation, route/session change, or timeout; terminal failures/timeouts show an error with Retry rather than an empty collection. Do not cache the initializing response as successful collection data. Once initialization completes within the wait window, the already-open view fetches and displays the complete catalog or member page without user navigation or reload. Define and test the wait budget alongside the startup timing check.

Removing a grouping or contributor stops its use in queries and never deletes source frontmatter; re-enabling rebuilds from that source. Reusing a grouping key with a different field reads only the new field. This works in a database-backed app with directory-sync absent, and existing entity mutations maintain the projection after startup; no per-request Markdown scan is introduced.

If the derived table below is introduced, its first deployment populates existing rows in the same startup pass before reads switch to it, discards obsolete bindings without touching source content, and synchronizes updates and deletes transactionally.

### Entity-service owns collection queries

Two bounded reads in `entity-queries.ts`, beside `queryEntityHierarchy`, both resolving the grouping by registered key:

- `queryGroupingCatalog({ grouping, entityTypes, visibilityScope, offset, limit, signal })` → `{ values: [{ value, count }], total }`
- `queryGroupingMembers({ grouping, value, entityTypes, q, sort, visibilityScope, offset, limit, signal })` → `{ entities, total }`

`entityTypes` is the caller's admitted set (Studio computes it from `getTypeCapabilities`); entity-service intersects it again with the declaration's `types`, so neither side can widen the other. `listEntities` is per-type and its metadata filter is scalar `json_extract` equality (`entity-queries.ts:433`), so both reads are new SQL over the existing `metadata` JSON column:

- Resolve a parameterized JSON path from the registered field, never a caller-supplied selector. For each row use the safe array expression `CASE WHEN json_type(metadata, ?) = 'array' THEN json_extract(metadata, ?) ELSE '[]' END`, binding that same path twice. Pass this expression to `json_each`. Do not use `json_type(json_extract(...))`: an extracted scalar string such as `Acme` is not a JSON document and would throw `malformed JSON`.
- Membership predicate: `EXISTS (SELECT 1 FROM json_each(<safe array expression>) AS j WHERE j.type = 'text' AND j.value = ?)`. Guard the table-valued function's input itself; do not rely on a separate `WHERE` conjunct being evaluated first.
- Catalog: expand that same safe array for admitted, visible rows; select distinct `(entityType, id, j.value)` where `j.type = 'text'`; then group by value and count. Order values case-insensitively so related spellings read together, with the stored bytes breaking ties, and page with `total` counting grouped rows. Ordering is presentation only; membership still matches exactly. Use JSON's `j.type`, not `typeof(j.value)`: SQLite represents nested JSON objects and arrays as text too.
- Members: apply visibility, admitted types, and the membership predicate, plus optional `contentContains`; order by the requested `created`/`updated` sort with an `entityType, id` tie-breaker. Compute the total with the same predicate.
- Visibility uses `getVisibleContentVisibilities(scope)`; cancellation uses the existing `signal` contract; `q` reuses `contentContains`. Preserve full opaque IDs in result decoding, including NUL and BOM cases already covered by hierarchy/detail reads.
- Values match exactly as stored: no slugging, case folding, or Unicode normalization. Non-string elements in existing metadata are ignored by both queries. Missing, empty, or non-array fields mean no membership, not a query error; nothing is coerced or migrated. Newly projected fields remain subject to whole-field schema validation.
- Start without a new membership index, using existing indexes to constrain candidate entity types and visibility. Gate the queries with `EXPLAIN QUERY PLAN` and timing on a ~10k-entity fixture. A generated-column B-tree index cannot index array-element membership; if the gate fails, the fallback is a derived table `entity_grouping_values(entityType, id, grouping, value)` maintained inside the existing mutation transaction, the way full-text rows are maintained today. It is a projection of the frontmatter, not an authored membership store, and must satisfy the initialization/rebuild rules above before becoming the read source.

Only entities readable under the existing visibility and admitted-type rules contribute. A restricted member must not reveal a value, count, type, or existence through catalog results, search, errors, or caches. A collection grants no additional access to its members.

### Studio owns presentation

- Routes: `/studio/groups/<key>` for the catalog and `/studio/groups/<key>?value=<value>` for members, with `type`, `q`, `sort`, `offset`, and nondefault `limit` as query parameters. The `groups` segment keeps grouping keys from colliding with entity-type routes. The query schema mirrors `studioCollectionQuerySchema`; cache keys include the normalized query and the caller's scope.
- Navigation: one entry per registered grouping in the existing rail. Studio receives descriptors from the registry and results from entity-service; it does not inspect frontmatter, decode IDs, or merge per-type pages.
- Rows reuse the existing list row with an entity-type badge and the existing display-title rules. A catalog row is a link, so a group opens in a new tab like any other destination. Studio calls these groups and entries; "collection" stays with entity types, which already own a Collections rail group.
- A correction Studio makes for itself, such as clamping an out-of-range page or a debounced search, replaces the current URL. Only a reader's own move adds a Back step.
- Editor return: extend the existing collection return context with a groups target so Back from the editor lands on the same grouping URL; type and hierarchy return navigation stays unchanged.
- Catalog counts and member results refresh after an ordinary save or delete through the existing invalidation path. Opening either view during startup uses the initializing-response retry above; reprojection completion does not rely on mutation events, window-focus refetch, or a manual reload.
- Create mockups at `docs/studio-virtual-collections-mockups.html` and review them before UI work: catalog, mixed-type members, empty state, read-only member, editor return; desktop and phone; both climates. The rest of Studio navigation is not redesigned.

### Directory-sync remains unchanged

Membership is unrelated to ID hierarchy and file placement. Adding or removing a value never renames an entity, moves a file, creates a directory, or changes export admission. An entity in two virtual collections has one stored identity and one export destination.

## Non-goals

- A client, project, or collection entity created solely to support grouping.
- Membership inferred from IDs, folders, file paths, or AI.
- A general query builder, relationship engine, or CRM integration.
- Collection descriptions, ordering, lifecycle, ownership, or separate access grants.
- Bulk membership edits, collection-wide renames or deletes, collection-level workflows.
- Creation from virtual collections, type pickers for that purpose, or membership prefilling.
- Intersections of groupings, saved Boolean queries, nested collections, or aggregation dashboards.
- A wildcard `types: "*"` declaration.
- Changing directory-sync placement or duplicating content for multiple memberships.

## Delivery slices

Each slice is end to end and writes its tests before its implementation.

### 1. Walking skeleton: Clients → Acme across `note` and `post`

Tests:

- Serializer and **full entity-service mutation paths** with the real `NoteAdapter` and `BlogPostAdapter`: frontmatter reaches the projection after owner-schema validation; create and update retain it; a content edit overrides stale metadata; a typed read/write without the extension metadata key preserves unchanged frontmatter; unrelated frontmatter and opaque IDs survive. Include the profile plugin's `anchor-profile` extensions to detect cross-cutting regressions.
- Field-update tool: Acme → Beta persists through validation and storage, not merely in a pre-validation object; `null` removal clears content and projection. With ordinary reads stripping extension metadata, confirmation still shows the actual prior frontmatter list for replacement/removal. Cover multiple values, punctuation, absence, malformed old values, and changes between preview and confirmation. Full content replacement/removal must not resurrect stale metadata. Invalid new values are rejected through the applicable schema without weakening owner validators.
- Real directory-sync `FileOperations` export through `serializeEntity`, followed by reimport: memberships and unrelated frontmatter survive. Export of malformed stored fields preserves their source without projecting or coercing them.
- Studio config/registration: valid declarations succeed; duplicates, conflicts, unknown types, and absent frontmatter schemas fail. Reject `field: "title"` on notes and policy fields such as `visibility`; compatible existing list fields keep their requiredness, limits, element validation, and refinements. Reordering declarations cannot change which contract wins.
- Studio routes: Properties for `note` and `post` include the list field; ordinary update and type-scoped creation persist it through the complete service path, with no new virtual-collection creation action.
- `entity-queries` on real SQLite: two types, equal IDs in different types, opaque IDs, multiple values, duplicates, and stable tie-breaking. Test scalar strings, JSON null, numbers, booleans, objects, and nested array elements: no malformed-JSON exception and no object/array collection names; catalog/member predicates agree.
- Apply and test visibility/admitted-type restrictions before exposing the new query routes. Hidden-only values and inaccessible type descriptors do not leak.

Implementation: extension-aware registry validation; registry-based round-trip through the serializer including `serializeEntity`; field-tool patches and accurate confirmation diffs; grouping registration; the two queries; Studio configuration and routes with minimal catalog/member views and one navigation entry.

Acceptance: open Clients → Acme, see a note and a post, open the note, edit `clients`, return, and see counts and membership updated with no identity or file-placement change.

### 2. Configuration lifecycle

Tests:

- Configuration lifecycle: save with Clients enabled, then remove its declaration or one contributor; restart, edit an unrelated property/body through Studio, export/reimport, and re-enable. `clients` stays in source and membership reappears. Also exercise an entity-service save/export with Studio disabled. Explicit full-source removal still removes the field; preservation does not admit arbitrary new editor request keys or override owner/policy validation.
- Unclaimed-key preservation on every frontmatter type: an unknown key survives a Studio save and a `serializeEntity` export on note and post; raw/body-only and binary types are unchanged.
- Startup reprojection without directory-sync: seed stored frontmatter with no grouping metadata, enable Clients, and find existing members without saving them. Cover a newly added contributor, a changed field under the same grouping key, stale/invalid projected values, and repeat startup. Verify source content, unrelated metadata, identity, and `updated` are unchanged and that no entity events or file rewrites occur. Repeated startup converges on current source values.
- Boot branch: web and combined boots run the pass after the embedding backfill; `register-only`, `startup-check`, and worker boots perform no grouping reprojection writes. Restarting a worker alongside a live web process does not invoke the pass, while worker mutations keep projections current through the ordinary write path.
- Shared-database races: interleave an edit or delete from a second connection between the pass's read and write. Verify revision-conflict retry uses fresh content, unrelated metadata is not overwritten, deleted entities are not recreated, and keyset paging does not skip rows after deletion. Retry exhaustion fails boot; the next start completes the pass.
- Read admission: pause reprojection after one page and request both grouping endpoints. Authorized callers receive the initializing response, never partial values/counts or an empty-success response; existing access denials remain unchanged. Completion makes both endpoints ready; failure leaves them unavailable.

Implementation: source-frontmatter preservation at the serializer and editor boundaries; the revision-checked reprojection mutation and its call from the bootloader's web-only startup branch. Registration itself performs no rebuild.

Acceptance: remove and re-enable the Clients declaration across a restart; existing `clients` frontmatter is untouched and its members reappear without a manual save.

### 3. Access transitions and scale

Tests:

- Visibility scopes on catalog and members; hidden-only values absent from the catalog; admitted-type intersection; no descriptor for a caller with no admitted contributing type; a stale deep link shows the same non-disclosing empty state as an unknown value.
- Save/delete and auth-session changes invalidate the appropriate catalog/member caches without reusing another caller's results; counts and empty views remain scoped to current access.
- Cancellation through `signal`.
- `EXPLAIN QUERY PLAN` and timing on a ~10k-entity, ~5k-value fixture beyond the first page, including the startup reprojection pass.
- If the derived table is introduced: bootstrap pre-existing members, repeat restart, change/remove/re-enable bindings, and verify transactional update/delete behavior and visibility parity with the metadata queries before switching reads, in the same startup slot and with the same revision handling.

Implementation: access-transition and invalidation handling plus any measured query improvements; the derived membership table only if the scale gate fails, including its initial population and rebuild lifecycle.

### 4. Browsing and editor return

Tests:

- Deep links, Back/Forward, and refresh reproduce the same view; type filter, search, sort, and pagination; empty states; read-only member; editor return to the grouping URL.
- Open Clients and a direct member-page link while reprojection is paused. Show initializing, then the complete result automatically after completion within the wait window, without navigation, focus changes, save events, or reload. Verify no partial/empty-success data enters the cache. Cover timeout/error Retry, cancellation, and route/session changes; non-initialization errors retain the existing no-implicit-retry behavior.
- Group views expose no creation action; typed and hierarchical creation are unchanged.
- Visual captures at desktop and phone widths in both climates against the reviewed mockups.

Implementation: filters, search, sort, empty states, return context, and the reviewed presentation.

## Acceptance and closure

The feature is complete when an admitted user can browse Clients → Acme across `note` and `post`, open and edit a member through the normal editor, and see membership and counts update without identity or file-placement changes; the same entity appears in multiple collections without duplication; and a less-privileged user sees only permitted descriptors, values, members, and counts. Existing frontmatter becomes discoverable on activation without manual saves or directory-sync, removing configuration never erases that frontmatter, and field-update confirmations accurately show the change being authorized.

Validate with an isolated canonical app, including save, export, reimport, and existing navigation regressions. Run affected tests, targeted types and lint, docs and public-contract checks, and visual checks per slice. Before rollout, review existing `clients` values and permission boundaries on the production `note` and `post` types; deployment is a separate authorized action.

Once shipped, capture the contract in the Studio, entity-service, and directory-sync READMEs and the release notes, remove this plan from the roadmap, and retire it according to the [planning cleanup policy](./README.md).
