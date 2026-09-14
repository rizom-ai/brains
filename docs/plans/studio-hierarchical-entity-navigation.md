# Plan: Studio Hierarchical Entity Navigation

Last updated: 2026-09-12

## Status

**In progress: Slice 1 (directory-sync codec adoption).**

Implementation follow-up to
[generic-multi-section-content-generation.md](./generic-multi-section-content-generation.md),
merged in PR #252 and included in Brain `0.2.0-alpha.379`. Generation uses the entity-service
path codec. Directory-sync still splits and joins stored IDs independently; its adoption of
the codec was not delivered by generation. Studio still presents each entity type as one
flat, updated-time-paginated collection.

Phase 0 below owns that missing bridge. It preserves existing filesystem placement and
stored IDs before adding hierarchy queries or UI. Deliver the work sequentially in three
thin slices: directory-sync adoption, entity-service hierarchy query, then Studio. Each
slice is tests-first, committed and green before starting the next.

Interface design for Phase 2 and Phase 3 is reviewed and approved. The mockup is
[studio-hierarchical-navigation-mockups.html](../studio-hierarchical-navigation-mockups.html):
collection root, a nested folder, folder-scoped search, a filtered empty result, creation
into the selected folder, and a type with no nested paths, at desktop and phone width in
both climates, deep-linkable as `#state/viewport/climate`. Its decisions are recorded
under [Settled interface](#settled-interface) and carried into the phases below.

## Goal

Present structured entity ID paths as virtual folders in Studio while keeping Studio,
directory-sync, direct entity links, and external entity authoring aligned on one hierarchy
contract.

For example:

```text
API path:    ["book-1", "part-1", "chapter-2"]
stored ID:   book-1:part-1:chapter-2
file:        book-section/book-1/part-1/chapter-2.md
Studio:      Book 1 / Part 1 / Chapter 2
```

The array is the hierarchy model. The colon-separated ID is only its serialized entity-ID
representation.

Success means:

- Studio consumes structured path segments rather than parsing delimiters locally;
- directory-sync and Studio interpret the same path as the same hierarchy;
- Studio can browse folders at arbitrary supported depth without loading an entire
  collection;
- direct entity URLs remain valid and encode the stored entity ID as one value;
- creating an entity inside a folder submits structured path segments and syncs to the
  expected file;
- folders remain a projection of entity identity rather than a second durable model.

## Non-goals

- Durable folder entities.
- Storing a duplicate folder path in entity metadata.
- Inferring composition, reading order, reuse, clients, projects, or topics from folders.
- Cross-type metadata grouping; that needs its own schema-backed design.
- Dynamic recursive content generation.
- Treating filesystem directories as independent records.
- Folder move/rename in the first slice.
- Changing directory-sync's top-level `<entity-type>/` layout or root-note conventions.
- Normalizing legacy IDs or introducing a shared physical tree.
- Replacing Studio's existing entity editor or direct entity doors.
- Asking Studio or public authors to join or split colon-separated IDs.

## Prerequisite baseline

PR #252 delivered:

- a schema-backed, non-empty `EntityIdPath` segment array;
- one entity-contract codec between structured paths and stored string IDs;
- book-shaped path/ID/file round-trip tests; and
- regression coverage preserving existing directory-sync placement.

The stored ID remains the only identity. Exactly one codec, owned by entity-service,
interprets its separator. Directory-sync owns filesystem placement on top of decoded
segments: export roots, extensions, root-note conventions and existing placement rules.
Phase 0 pins those rules before adopting the codec. It must not rewrite IDs, move files,
introduce database migrations, or give Studio a separate delimiter parser.

## Current Studio state

- Studio lists one page of entities ordered by update time from
  `plugins/studio/src/editor-entities.ts`.
- Studio collection routes identify an entity type; entity routes encode the complete
  stored ID as one URL value.
- A browser cannot construct a complete folder tree from one paginated entity page.
- Existing list responses expose stored IDs but no structured path projection.

## Settled architecture

### Structured paths are the API model

Studio server and browser contracts carry `EntityIdPath` arrays for folder prefixes and
breadcrumbs. The server may return the stored string ID for existing direct entity links,
but browser code does not split or join it.

The entity type remains the collection root and part of storage identity. Metadata may
contain independent domain facts such as `clientId`, `bookId`, `order`, or section kind,
but does not duplicate hierarchy solely for Studio. Folder paths describe storage
containment, not composition membership, reading order, or cross-type relationships. No
folder exists without at least one visible entity below it.

### Folder browsing is server-derived

Studio's server returns immediate child folders and the requested page of direct child
entities for a selected structured prefix. The browser does not infer the complete
hierarchy from currently loaded entities.

Visibility filtering happens before folder counts and children are derived. Folder
selection is addressable URL state. Existing entity doors remain unchanged so direct links
retain their current stored-ID contract.

### Settled interface

Reviewed against the mockup at desktop and phone width in both climates.

Folders and direct entries share the library's `36px / 1fr / auto` row grid, so a
collection still reads as one column. A folder is marked `/` in the ordinal slot, set in
the interface face rather than the display face, and carries its descendant count and a
chevron where an entry carries its date. Folders sort above entries under a
`complete · not paged` label; entries keep the existing pager. That split is stated in the
interface because the server derives the whole folder list per prefix while direct
children stay a page.

The page title remains the entity type, so wayfinding does not move on descent. The trail
sits directly below the page-head rule in the mono face, its leading segments are links
and the current folder is plain text. At the collection root the trail is absent: one
unclickable crumb would only repeat the title. Segment names are a presentation of the
path — `book-1` reads as `Book 1` — and no folder record exists to hold a title.

With a prefix selected, the search control gains one explicit scope choice, **This
folder** or **Whole collection**; a query that silently changed scope on descent would be
unreadable. Filter and sort stay in their existing disclosure. An empty result
distinguishes an empty folder from a filtered one and offers the escape that fits:
clear the query, or search the whole collection.

Creation opens with the trail fixed by where **New** was pressed and a single **Segment**
field for the leaf. A destination block renders the structured path, the stored ID and the
exported file together, each emphasising the new segment. A separator typed into the field
is rejected against the segment, never against the ID, so the operator never joins or
splits one.

At phone width the trail becomes a scrollable chip row and rows keep the compact grammar.
Choosing a folder replaces the list rather than indenting it, so depth costs no horizontal
space. The fixed action bar names the folder it will create into; on the creation document
it steps out, because that document keeps its own **Save changes** in the head at every
width. The leaf rail continues to list entity types and never folders, so the shell stays
put while the trail moves.

### First slice is navigation, not bulk identity mutation

The first delivery supports browsing, opening, searching within the selected folder, and
creating with a folder prefix. Moving or renaming a folder changes multiple entity IDs and
must wait for an explicit bulk-mutation design with conflict and directory-sync semantics.

## Proposed Studio contract

The shared `EntityIdPath` type comes from the entity contract layer:

```ts
type EntityIdPath = readonly [string, ...string[]];

interface StudioEntityFolderPage {
  readonly prefix: EntityIdPath | null;
  readonly folders: readonly {
    path: EntityIdPath;
    name: string;
    descendantCount: number;
  }[];
  readonly entities: readonly StudioEntitySummary[];
  readonly offset: number;
  readonly totalEntities: number;
}
```

The transport schema validates every segment. Exact endpoint and browser-query shapes
remain package-local and are not public authoring APIs.

## Implementation phases

### Phase 0 / Slice 1: Directory-sync adopts the shared codec

1. Rebase the implementation branch onto current main.
2. Before changing runtime code, add a golden test under `plugins/directory-sync/test`
   recording the exact current relative export paths for representative IDs. Include empty
   segments, root-note IDs, embedded separators, repeated type prefixes and unsafe path-like
   values. Run it against the unchanged implementation and confirm it passes.
3. Replace ID splitting in `plugins/directory-sync/src/lib/entity-paths.ts` with
   `decodeEntityIdPath`, imported through `@brains/entity-service`. Route ID reconstruction
   through `encodeEntityIdPath` from the same package.
4. Keep identity interpretation in the codec and filesystem placement rules in
   directory-sync. Add codec tests before changing its behavior. Keep the golden placement
   expectations unchanged; authoring validation must remain strict without rejecting stored
   IDs that the current filesystem adapter handles.
5. Remove other entity-ID separator splits and joins from directory-sync and Studio. Check
   all remaining separator operations and distinguish unrelated header/frontmatter parsing
   from entity-ID interpretation.
6. Run the golden tests, codec tests, directory-sync tests, affected typechecks and lint.
   Commit the green slice and report the changes, proof and remaining Slice 2 requirements.

### Phase 1 / Slice 2: Server-side hierarchy projection

1. Write tests against real SQLite first, using the entity-service test database helpers.
   Add an entity hierarchy query accepting an entity type, optional structured folder
   prefix and caller visibility scope. Match the prefix against stored IDs.
2. Return immediate child folders plus paginated direct children.
3. Include structured paths in summaries; perform stored-ID decoding only behind the
   shared codec.
4. Ensure folder summaries are complete independently of the current entity page.
5. Apply the caller's visibility scope before folder counts and child results are derived.
6. Define deterministic sort behavior for folders and direct children.
7. Keep limits bounded and avoid loading every entity into the browser.
8. Expose the query on the existing entity-service client surface used by Studio.
9. Run affected tests, typechecks and lint; commit and report the green slice before UI work.

Prefer an entity-service query primitive if Studio would otherwise scan the full
collection. Do not add a Studio-only unbounded list operation.

### Phase 2 / Slice 3: Studio folder navigation

Write editor-entities layer tests first, then UI tests. This slice includes Phase 3's
folder-aware creation and follows the approved mockup. Commit and report it only after
its tests, typechecks and lint pass.

1. Render virtual folders in entity collections when nested paths exist, in the shared row
   grid, above direct entries and labelled complete rather than paged.
2. Add the trail below the page-head rule and drill-down navigation at desktop and phone
   widths, with no trail at the collection root.
3. Store the selected structured prefix in canonical URL state without exposing delimiter
   operations to UI code.
4. Preserve Back, Forward, refresh, and direct-entry behavior.
5. Keep entity links on the existing encoded full-ID route.
6. Give search an explicit folder/collection scope, and distinguish an empty folder from a
   filtered one with an escape from each.
7. Integrate folder state with loading and pagination, paging direct children only.
8. Follow Studio's existing page-head, navigation, compact-row, and fixed-action grammar,
   keeping the leaf rail on entity types.

### Phase 3: Folder-aware creation

1. Let **New** inherit the currently selected `EntityIdPath` prefix and fix the trail.
2. Validate the new leaf as one path segment, reporting failures against that field.
3. Show the complete path, the resulting stored ID and the exported file before creation,
   each emphasising the new segment.
4. Encode the stored ID only at the server/entity boundary through the shared codec.
5. Preserve normal entity schema, permission, visibility, and conflict handling.
6. Keep the document's own **Save changes** as the only action at phone width.
7. Verify directory-sync exports the entity to the matching nested path.

### Phase 4: Public authoring and documentation

1. Ensure the public generation destination accepts structured `idPath` without requiring
   an encoder import.
2. Export only the path schema/type or construction helper genuinely needed by other
   public entity-authoring operations; do not expose the serialization separator as API.
3. Update Studio and content-management documentation.
4. Update the public API ledger and packed fixtures for any additive public export.
5. Add changesets for affected published surfaces.
6. Treat bulk move/rename as a separate plan unless a concrete use case justifies its
   transactional and conflict semantics.
7. Remove this plan after shipped behavior is captured in implementation docs and
   changelogs.

## Test plan

### Studio server

- root and nested queries accept structured prefixes;
- returned folder and entity paths use validated segment arrays;
- root and nested queries return only immediate children;
- folder counts respect visibility scope;
- pagination does not omit folders or mix descendants into direct children;
- malformed segments fail validation;
- direct entity reads remain unchanged;
- no Studio code implements colon splitting or joining.

### Studio UI

- folders, the trail, direct entities, and empty states render correctly;
- the root renders no trail, and a type without nested paths renders no folder section;
- navigation survives refresh and browser history;
- phone and desktop layouts follow the existing Studio grammar;
- search reports which scope it searched, and a filtered folder reads differently from an
  empty one;
- creation inherits the selected structured prefix, rejects a separator against the
  segment field, and previews path, stored ID and file before saving;
- direct entity links remain stable;
- UI code treats stored IDs as opaque values.

### Cross-package parity

- `["book-1", "part-1", "chapter-2"]` identifies the same entity in generation,
  Studio, entity storage, and directory-sync;
- the stored ID and filesystem path are encoded only by their boundary adapters;
- no metadata-only hierarchy is required for grouping.

## Validation

Run targeted tests, typechecks, and lint for the entity contract package,
`plugins/directory-sync`, and `plugins/studio`. Then run root typecheck,
`bun run arch:check`, Studio browser tests, public-surface checks, and applicable packed
compatibility checks.

## Acceptance criteria

- Hierarchy-aware Studio APIs use structured non-empty segment arrays.
- Studio consumes the shared codec only at its server boundary and contains no delimiter
  parser.
- Studio folder browsing is correct across pagination and visibility scopes.
- Existing direct entity doors remain valid.
- Folder-aware creation syncs to the expected nested file path.
- Public generation authors never concatenate a hierarchy separator.
- No folder entity or duplicate metadata hierarchy is introduced.
- The shipped interface matches the reviewed mockup: one row grid, complete folders above a
  paged entry list, no trail at the root, explicit search scope, and a creation destination
  shown before saving.
- Move/rename is absent until its bulk-mutation semantics are explicitly designed.
