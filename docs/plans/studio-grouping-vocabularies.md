# Plan: Studio Grouping Vocabularies

Last updated: 2026-09-21

## Status

**Implementation and local acceptance complete; not merged, released or deployed.** Supersedes the scope of PR #302 on `feat/studio-virtual-collections`, in the existing implementation worktree, as explicitly requested. Builds on [studio-virtual-collections.md](./studio-virtual-collections.md); that foundation no longer needs to land separately. The vocabulary singleton, bundle policy, ordinary and projection-write enforcement, cardinality, scoped descriptors, editor controls and stray markers are implemented locally. Regression coverage includes real Note/Post adapters, directory-sync refusal/retry, field-update refusal, mounted controls, and read-only administration. Automated validation, live UI acceptance and canonical queued-import refusal/retry pass. This is not production migration acceptance.

Implementation details found during the walking skeleton: persist validators previously replaced one another, so registrations now compose to retain owner constraints. Persist-policy errors carry a distinct validation phase so directory-sync reports a failed import without quarantining otherwise valid Markdown. The singleton has a fixed identity and defaults to shared visibility. Public vocabulary writes are refused; descriptors still respect narrower visibility.

The [design mockups](../studio-grouping-vocabularies-mockups.html) were reviewed before UI implementation: 16 captures across four states, desktop/phone and both climates, with no overflow or browser errors. Evidence: `/tmp/studio-vocab-mockups/`. Existing literal-input tests remain unchanged. Latest checkpoint: 103 typecheck, 95 lint and 101 test workspace tasks pass, including 699 Studio tests and 510 entity-service tests. Eight packed compatibility tests pass; the grouping canary now creates a vocabulary and proves a field-tool refusal and an allowed write. All 222 console visual/accessibility scenarios pass with unchanged image baselines and thresholds.

The isolated canonical publishing app was rebuilt through its running preview action. Live acceptance covers admin creation, trusted read-only access, single/multiple/open controls, unchanged existing strays, HTTP 400 field issues with retained drafts, and reopening without restart. All 24 desktop/phone × paper/instrument captures pass accessibility, overflow and browser-error checks. Evidence: `/tmp/studio-vocab-live-ByS8NG/evidence.json` and `captures/`. The fixture grants trusted users ordinary Note/Post editing explicitly; the vocabulary retains the canonical admin-only policy. These are fresh synthetic accounts/content with mocked AI, not production migration acceptance.

Live checks found and fixed three gaps: validation errors crossing separately bundled runtime/plugin class copies escaped as HTTP 500; primary-button hover lost text contrast; and the member-page stray warning was hidden as secondary metadata on phones. Regression tests cover these fixes. The Dashboard HTML snapshot changes only the two shared hover CSS rules; no image baselines were changed.

Final integration fixes and acceptance:

- Queued **Sync now** previously created unrelated nested batch IDs. Import/cleanup handlers and the active-service facade now forward the durable batch identity; the existing source/operation fence is unchanged. Real-service tests cover both children and terminal settlement. The canonical app now refuses an unlisted changed file without quarantine, retains its stored membership, and successfully imports the same file after reopening without restart. The fixture's original identity/path is retained and its membership restored. Evidence: `/tmp/studio-vocab-live-ByS8NG/import-evidence.json`. The original failure is retained at `/tmp/studio-vocab-import-batch-failure.log`.
- Projection upserts now reconstruct owner fields, project membership from the full source and run the composed persist validators inside the admitted rule transaction. Real Note/Post regressions prove source overrides supplied membership metadata, dynamic vocabulary/cardinality enforcement, complete rollback (including memo, ownership and export intents), unchanged prior rows after refusal, and idempotent completed reports. Invalid output is not exempted and batch fencing was not relaxed.

This plan deliberately reopens two of that plan's non-goals: collection lifecycle and ownership. It keeps every other one, including no per-value entity, no bulk rename and no membership inferred from anything but frontmatter.

## Goal

Let admins define the values a grouping may take, and whether an entity may carry one value or several, without a configuration change or a restart. Editors then choose from that list instead of typing, and every writer, not only Studio, is held to it.

Terminology follows the virtual collections plan. A **grouping** is a declared dimension such as Clients. A **vocabulary** is the admin-authored list of values one grouping may take. A grouping with a vocabulary is **closed**; one without is **open** and behaves exactly as it does today.

## Product scope

- Vocabularies are defined by admins, in Studio, as ordinary content. Trusted editors can read them and cannot change them.
- A grouping is closed by the existence of its vocabulary and reopened by the vocabulary's removal. There is no separate switch.
- Each vocabulary states whether an entity may carry one value or several. Cardinality is a per-grouping decision made in the same place as the values.
- A closed grouping is enforced on every persist, so the field-update tool, MCP writes and directory-sync imports meet the same rule as a Studio save.
- Content already carrying a value outside the vocabulary stays visible and searchable. It is marked, never removed or rewritten.
- The design is generic. Clients and Projects are the first vocabularies, not special cases.

## First-version experience

1. An admin opens **System → Structure → Groupings**, adds `Acme` and `Beta` under Clients, marks Clients single-valued, and saves. Clients is now closed.
2. A trusted editor opens a note. The Clients property is a dropdown of `Acme` and `Beta`. Projects, which has no vocabulary, is still the value input with suggestions.
3. The editor saves. A value outside the list, or a second value on a single-valued grouping, is refused with the reason shown on that field.
4. The same editor cannot change the Groupings document; it opens read-only.
5. An admin later removes `Beta`. Notes already carrying `Beta` keep it, the Clients catalog still lists `Beta` with a marker, and those notes cannot be re-saved until `Beta` is replaced.

## Architecture

### The vocabulary is a singleton system entity owned by Studio

Studio registers one entity type, `grouping-vocabulary`, with `isSingleton: true`, the way `plugins/site-content` registers its type through `context.entities.register`. Studio owns it because Studio owns the grouping declarations: when Studio is disabled there are no groupings, so there is nothing to constrain. Plugins register in every process, so the validator below runs in workers as well as the web process.

The document is Markdown in brain-data, so it syncs through directory-sync, is versioned in git, and exports with the rest of the brain. Its frontmatter nests every list under one key, so a grouping named `title` or `status` can never collide with the document's own fields:

```yaml
groupings:
  clients:
    multiple: false
    values: [Acme, Beta]
  projects:
    multiple: true
    values: [Launch, Rebrand]
```

The schema is `z.record(groupingKeySchema, z.object({ multiple: z.boolean(), values: z.array(z.string().min(1)).min(1) }))`, wrapped in an object under `groupings`. Keys that do not name a declared grouping are rejected at save, so a typo cannot silently create a list nothing reads. Values are exact strings, as membership is, and duplicates within a list are rejected. An empty list is not a way to say "open"; deleting the entry is.

### Admin-only writes come from the existing action policy, not new code

Per-type write access is already a permission policy: `permissions.entityActions[type]` sets the level each action requires, resolved by `PermissionService.getEntityActionRequiredLevel`, and both Studio's `getTypeCapabilities` and the system tools consult it through `assertEntityActionAllowed`. The web bundle ships, in its Studio permission entry, `grouping-vocabulary: { create: "admin", update: "admin", delete: "admin", publish: "never" }`, in the same form the team bundle ships its trusted-content rule. An operator can still override it per instance, as with any policy.

The document is created with visibility `shared`, so trusted editors can read it and the Studio editor can offer its values; `publish: "never"` keeps it off the public site. Studio's existing behaviour for a type the caller may read but not update, a read-only form, is what a trusted editor sees.

### The type schema stays open; the vocabulary is enforced by a persist validator

Registered schemas are fixed for the life of a process, which is why vocabularies cannot live in the type schema and still change without a restart. The grouping field stays `z.array(z.string()).optional()` at the type level. Studio's `onRegistrationComplete` registers a `PersistValidator` on every participating type. On each create and update it reads the vocabulary singleton at internal full scope, and for each closed grouping the entity participates in:

- every value must be in the list;
- if `multiple` is false, at most one value may be present.

The read is one primary-key lookup per write and is not cached; writes are rare against reads, and a cache would reintroduce the staleness the virtual collections plan removed. The validator throws an error carrying `issues: [{ path: [field], message }]`, which `hasValidationIssues` recognises and `toEntityValidationError` wraps, so the failure names the field rather than the document.

Studio's `handleUpdateEntity` and `handleCreateEntity` do not catch errors thrown by `entityService.updateEntity` today; a validator failure would surface as a bare 500. Both gain a catch for `isEntityValidationError` that returns `400 { error, issues }`, the shape the editor already renders as field issues. The field-update tool already reports errors from its persistence check as `{ success: false, error }` and gains the same for a rejected persist.

An open grouping has no validator effect. Removing a vocabulary reopens the grouping on the next write. Stored content is never touched by any of this; the validator runs on incoming writes only.

### Cardinality is a policy on one storage shape

A grouping field is always a list in frontmatter. A single-valued grouping stores `clients: [Acme]`. This keeps the catalog and member queries, the projection, the export preservation and the reprojection pass exactly as they are, since they only ever see lists. Switching a grouping between single and multiple is an admin edit with no migration: an entity carrying two values under a now-single grouping keeps both, appears under both in the catalog, and cannot be re-saved until one is removed.

### Studio renders the control from the vocabulary, not from the schema

`/studio/api/types` already returns grouping descriptors scoped to the caller's admitted types. Each descriptor gains `vocabulary?: { multiple: boolean; values: string[] }` when the grouping is closed, read from the singleton under the caller's scope. The editor pane already receives these descriptors and already knows which fields are grouping fields; it chooses the control by vocabulary:

- closed, single-valued: the existing `NativeSelect` with the list as options and a blank first option, exactly as enum fields render today;
- closed, multi-valued: a checkbox group, one box per value, which is the honest multi-select;
- open: the current value input with catalog suggestions, unchanged.

The field descriptor stays `list` of `string`, so the schema-to-widget mapping in `plugins/studio/src/config.ts` is untouched, and the read-only fallthrough for structured lists is never reached. The catalog-suggestions hook keeps serving open groupings only.

The System area lists types by name in `SYSTEM_TYPE_GROUPS`; `grouping-vocabulary` is added under a new **Structure** group with the `form` presentation, and `systemEditorCopy` gains its intro and titles. The Groupings document is edited through the ordinary system form, so the admin experience is the same as editing Character or Style Guide.

### Values outside the vocabulary stay visible and are marked

Frontmatter remains the source of membership, so the catalog keeps showing every value readable content carries, including ones no vocabulary contains. Catalog rows and the member page head for such a value carry a **not in list** marker, and the group's Properties chip for that value is marked the same way. Nothing is deleted, coerced or renamed. The admin resolves it by adding the value to the list or by editing the entities, and the marker disappears when either happens.

Renaming a value in a vocabulary does not propagate. The old value stays on its entities and in the catalog, marked, until those entities are edited. Bulk rename remains a non-goal, as in the virtual collections plan.

## Non-goals

- A per-value entity, description, owner or lifecycle beyond presence in the list.
- Bulk rename or bulk reassignment of memberships.
- Hierarchical or nested vocabularies.
- Per-grouping access grants, or vocabularies readable by fewer than all trusted users.
- Changing registered schemas at runtime, or a vocabulary in `brain.yaml`.
- Inferring a vocabulary from existing content. The catalog informs the admin; it does not write the list.

## Delivery slices

Each slice is end to end and writes its tests before its implementation.

### 1. Walking skeleton: one closed, multi-valued grouping, enforced everywhere

Tests:

- Registration: Studio registers `grouping-vocabulary` as a singleton; a vocabulary key naming an undeclared grouping, a duplicate value, an empty value and an empty list are all rejected at save.
- Policy: with the web bundle's default policy, an admin can create and update the document, a trusted caller receives the read-only capability set and a denied update, and a public caller sees nothing. `publish` is never allowed.
- Validator, real `NoteAdapter` and `BlogPostAdapter`: with Clients closed to `[Acme, Beta]`, saving `clients: [Acme]` succeeds; `clients: [Gamma]` is rejected with an issue whose path is `["clients"]`; the same rejection reaches the Studio route as `400 { issues }`, the field-update tool as `{ success: false }`, and a directory-sync import as a failed import. With no vocabulary, `[Gamma]` saves. Removing the vocabulary makes `[Gamma]` save again.
- Stored content carrying `Gamma` before the vocabulary existed is unchanged after the vocabulary is saved, still projects, and still appears in the catalog.

Implementation: the entity type, adapter and schema; the bundle policy entry; the persist validator; the `isEntityValidationError` catch in Studio's create and update handlers.

Acceptance: an admin closes Clients in the running app; a trusted editor's save with an unlisted value is refused and names the field; the same write through the field-update tool is refused with the same reason.

### 2. Cardinality and the descriptor

Tests:

- `multiple: false` rejects two values with an issue on the field and accepts one; `multiple: true` accepts several. Flipping the flag changes only what saves, never what is stored.
- `/studio/api/types` carries `vocabulary` on closed groupings and omits it on open ones; a caller who cannot read the singleton receives descriptors without it and is treated as open in the editor, while the validator still enforces the list on their writes.

Implementation: cardinality enforcement in the validator; the descriptor extension in `studioGroupDescriptors`.

### 3. Editor controls

Create mockups at `docs/studio-grouping-vocabularies-mockups.html` and review them before UI work: the Groupings form for an admin and read-only for a trusted editor; a note with one closed single-valued grouping, one closed multi-valued grouping and one open grouping side by side; the refused-save state; desktop and phone; both climates.

Tests:

- Mounted editor: a closed single-valued grouping renders a select whose options are the list and whose blank option clears the field; a closed multi-valued grouping renders a checkbox group; an open grouping renders the value input with suggestions. Saving from each control produces the expected list in frontmatter.
- A refused save shows the issue on the grouping field and leaves the draft intact.
- Existing literal-input tests for open groupings are unchanged.
- Visual captures at desktop and phone in both climates against the reviewed mockups.

Implementation: control selection by vocabulary in the editor pane; the checkbox group; the System area group and copy.

### 4. Stray values and documentation

Tests:

- Catalog rows, the member page head and Properties chips carry the marker for a value outside the vocabulary, and lose it when the value is added to the list or removed from every entity. Values in the list carry no marker.
- No membership, count or content changes as a result of marking.

Implementation: the marker in the catalog, member and Properties presentation; README sections for Studio and entity-service; the changeset, which states that closed groupings are enforced on every writer, including imports.

## Acceptance and closure

The feature is complete when an admin can define a grouping's values and cardinality in Studio without a restart, a trusted editor chooses from that list and cannot change it, every writer is refused the same way for a value outside it, and content that predates the list stays visible and marked rather than altered. Once shipped, capture the contract in the Studio and entity-service READMEs and the release notes, remove this plan from the roadmap, and retire it according to the [planning cleanup policy](./README.md).
