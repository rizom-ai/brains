# Durable Binary Asset Storage Plan

Last updated: 2026-08-05

## Status

Proposed

## Summary

Move durable image bytes out of the entity SQLite database into a content-addressed
asset store. Image entities retain identity, visibility, provenance, dimensions, and
other queryable metadata, but their `content` field becomes an opaque asset reference
instead of a base64 data URL.

Deliver images first and validate the migration on `yeehaa.io`, the only actively used
brain with a material image corpus. Migrate PDF document entities in a follow-up phase
only after the image path has soaked successfully.

## Current baseline

Image entities currently store their complete payload in `entities.content` as a data
URL:

```text
data:image/png;base64,...
```

The entity service also inserts that content into FTS5. Images are excluded from vector
embeddings, but not from full-text indexing. Data URLs therefore cause several forms of
avoidable amplification:

- base64 adds roughly 33% over the original bytes;
- SQLite stores the expanded value in the entity row;
- FTS stores/indexes the same non-textual content again;
- updates amplify WAL, backup, event, and API payloads;
- normal entity reads and lists can materialize complete image payloads;
- every consumer decodes the full string back into bytes.

Read-only inspection of the local `yeehaa.io` instance found:

- 160 files under `brain-data/image`;
- 320,551,933 bytes of image files, approximately 306 MiB;
- a `data/brain.db` file of approximately 1.4 GiB;
- existing directory-sync behavior that already represents image entities as ordinary
  binary files in `brain-data/image`.

The production database must be measured independently during migration preflight; the
local numbers are planning evidence, not a production assertion.

PDF document entities use the same broad pattern with
`data:application/pdf;base64,...`. They are deliberately deferred until the image
storage path has been proven.

## Goals

- Store each distinct binary payload once in a durable content-addressed asset store.
- Keep image and document entities as the durable identity and authorization boundary.
- Preserve `entity://image/{id}`, `coverImageId`, and `ogImageId` contracts.
- Preserve upload, generation, CMS, chat, site-build, directory-sync, and publishing UX.
- Stop indexing binary payloads in FTS.
- Make migration explicit, idempotent, resumable, verifiable, and reversible.
- Restore an instance from `brain-data` plus normal runtime initialization without
  requiring the old base64 database representation.
- Establish one generic asset service that the PDF phase can reuse without redesign.

## Non-goals

- Moving public site images to an external CDN.
- Introducing S3/R2 in the first implementation; the initial backend is the persisted
  local runtime filesystem.
- Migrating binary entities backed by a remote entity database or running the local asset
  backend across multiple application replicas. The first migration command supports a
  stopped, single-node process with a local `file:` SQLite database; remote/multi-node
  operation requires a shared object-store backend and distributed migration fence.
- Changing user-authored image references or cover/OG image IDs.
- Rewriting Git history to remove existing image or PDF objects.
- Migrating PDF entities in the image cutover.
- Deleting unreferenced assets automatically. Initial deletion safety favors harmless
  orphaned files over removing bytes shared by multiple entities.
- Changing inline data URLs used by application CSS, static SVG decoration, or AI
  provider request/response formats when those values are not durable entities.

## Settled decisions

### Asset identity and location

The canonical asset reference is:

```text
asset://sha256/<lowercase-hex-digest>
```

The filesystem backend stores immutable bytes under an explicit shell
`assetDirectory`. The app-layer default derives from the standard persisted runtime data
root:

```text
assetDirectory = <StandardPaths.dataDir>/assets
data/assets/sha256/<lowercase-hex-digest>
```

Add `assetDirectory` to `StandardConfig`, app configuration, and `ShellConfig`, then pass
it directly to the asset service during shell construction. Tests and advanced callers
may override it explicitly. Do not infer it from a database URL or reuse plugin
`context.dataDir`, which represents the Git-syncable `brain-data` content boundary.
Deployed instances using `XDG_DATA_HOME=/data` therefore store assets under
`/data/assets` on the persisted volume.

The asset key is content-addressed and has no user-controlled path component. MIME type,
filename, dimensions, and provenance belong to the entity, not the storage path.

### Entity representation

A completed image entity stores the asset reference in `content`. Its metadata retains
existing fields and adds the stable binary facts needed without loading the asset:

- `format`;
- `mediaType`;
- `sizeBytes`;
- `width`;
- `height`;
- existing title, alt text, status, provenance, attachment type, and deduplication data.

No relational entity-table migration is required because `content` remains text. The
image schema must require a valid asset reference for completed/draft images. Pending or
failed images may have empty content and incomplete binary metadata; browser-facing
attachment routes provide the existing pending presentation without storing a fake
base64 image in the entity row.

PDF documents adopt the same representation in the follow-up phase. PDF-specific
metadata such as filename, page count, and source provenance remains on the document
entity and in directory-sync sidecars where it exists today.

### Supported image media

The durable image contract supports the raster formats already exercised by upload,
generation, optimization, and publishing paths:

- PNG (`image/png`);
- JPEG (`image/jpeg`, with `jpg`/`jpeg` normalized consistently);
- GIF (`image/gif`);
- WebP (`image/webp`).

SVG is removed from the durable image schema and directory-sync image extension set in
the image cutover. Although nominally listed today, it has no ordinary binary signature,
current dimension detection does not support it, and serving arbitrary same-origin SVG
would introduce script/XSS risk. Phase 0 inventories legacy SVG rows and
`brain-data/image/*.svg`; any found asset must be explicitly sanitized and rasterized to
PNG/WebP before migration. Dry-run reports SVG as a blocking unsupported format and never
silently converts or serves it. Inline SVG/CSS decoration remains outside this plan.

### Public and browser references

`asset://` is an internal storage reference, not a browser URL and not an authorization
mechanism. Browsers and external integrations continue to receive an interface-owned,
same-origin attachment descriptor containing entity-ID-based `url`, `downloadUrl`,
`filename`, `mediaType`, and `sizeBytes` fields. Those routes resolve the entity, enforce
its visibility and permission boundary, then read the referenced asset; they never expose
the digest path as a public static URL.

Markdown retains `entity://image/{id}` until an explicit renderer resolves it. Database
storage and reads using explicit reference mode expose the asset reference; site builds
resolve bytes directly and continue emitting optimized public build artifacts.

Add a `binaryContent` mode to entity get/list request contracts. During the compatibility
release, omitted mode preserves existing behavior and is equivalent to
`"legacy-data-url"`; new internal consumers pass `"reference"`.

The method matrix is explicit:

| Method                    | Transitional default                                | `binaryContent: "reference"`                |
| ------------------------- | --------------------------------------------------- | ------------------------------------------- |
| `getEntityRaw(image)`     | data URL, matching today's direct image result      | stored asset reference                      |
| `getEntity(image)`        | data URL, matching today's direct image result      | stored asset reference                      |
| `getEntity(non-image)`    | current embedded `entity://image` expansion         | embedded entity references remain unchanged |
| `listEntities(image)`     | data URLs, matching today's stored results          | asset references without byte expansion     |
| `listEntities(non-image)` | unchanged; lists do not resolve embedded references | unchanged                                   |

The PDF transition applies the same matrix to `document`. New attachment/list surfaces
use references or authorized descriptors from their first release. Bridge telemetry
counts actual `legacy-data-url` materializations by method and interface surface, without
logging content. After caller inventory and soak reach zero, remove
`legacy-data-url`; omitted mode then means `reference` and the breaking default change is
published in release notes.

### Write ordering and deletion

Asset writes occur before entity writes:

1. validate the payload and determine its canonical media type;
2. hash the bytes;
3. write to a temporary file in the asset directory;
4. verify the temporary file;
5. atomically rename it to the digest path, or reuse an identical existing asset;
6. persist the entity reference.

A failed entity write can leave an orphaned asset, which is safe. Entity deletion does
not delete bytes during these phases. A later mark-and-sweep garbage collector may remove
unreferenced assets after a retention period, but it is not part of this plan.

### Compatibility window

There is no permanent dual-format contract. One transitional release:

- accepts both legacy data URLs and asset references in the stored image schema;
- writes only asset references;
- preserves existing `getEntity`, `getEntityRaw`, and image `listEntities` results through
  the explicit `binaryContent: "legacy-data-url"` default;
- lets migrated internal callers opt into `binaryContent: "reference"` immediately;
- introduces the authorized attachment descriptor/download contract that replaces raw
  data URLs;
- records storage-format and legacy materialization usage by method/interface surface.

That release exists only to support client migration, dry-run, cutover, verification,
and rollback on `yeehaa.io`. Removal is an explicit pre-stable API change with release
notes and requires a completed caller inventory plus zero bridge usage during the agreed
soak. Repository fixtures cross over in the same window. The migration parser remains
operator-only after ordinary legacy reads are removed.

The PDF phase may use the same bounded transition for document data URLs.

## Target architecture

### Durable asset service

Add pure asset reference/store/resolver contracts in a lower-level shared
`@brains/assets` package. `@brains/entity-service` may depend on those contracts without
creating an `entity-service -> plugins` cycle. `@brains/plugins` re-exports the public
contracts and exposes the instantiated store as a bounded `assets` namespace.

A shell-owned `@brains/asset-service` package implements the filesystem backend. Core
constructs it before the entity service and injects a structural `BinaryContentResolver`
into entity reads for the compatibility modes; entity-service never imports
`@brains/plugins` or the filesystem implementation.

The minimum byte-oriented contract supports:

- `put(bytes)` returning the canonical reference, digest, and byte size for existing
  in-memory generation/upload paths;
- `putStream(chunks, expectedSize?)` hashing incrementally into a temporary file before
  atomic commit, for directory-sync and large binary restoration;
- `read(assetRef)` returning bytes;
- `stat(assetRef)` returning existence and size without reading the payload;
- `verify(assetRef)` recomputing and checking the digest.

The implementation must:

- use the explicitly configured `assetDirectory`, not cache, temporary storage, a
  database-derived path, or `brain-data`;
- reject malformed references and path traversal;
- verify byte count and digest integrity;
- bound streamed writes by the caller-provided import policy, remove interrupted temporary
  files, and never buffer the complete stream in memory;
- make concurrent writes of the same bytes safe and idempotent;
- avoid exposing the runtime asset directory as an unauthenticated static route;
- participate in shell construction and teardown without process-global state.

The generic store does not interpret MIME types or know supported image/document
formats. Image and document ingestion layers validate signatures, reconcile declared
MIME types, and derive format-specific metadata before calling `put`. This keeps media
policy in entity/shared media packages while the shell service remains reusable and
byte-addressed.

The contracts remain below the plugin boundary and are re-exported through it;
filesystem ownership and runtime path policy remain in the shell implementation. Shared
image/document adapters remain pure and perform no I/O.

### Full-text indexing policy

Add an explicit entity-type setting such as `fullTextSearchable: false`. Entity mutations
must delete any stale FTS row and skip insertion when the type is not full-text
searchable. Do not overload vector `embeddable` policy: binary entities are currently
non-embeddable, but vector and keyword indexing are separate contracts.

The image plugin sets this option in the first phase. The document plugin sets it when
PDF content migrates.

### Binary storage registration

Add an explicit entity-type setting such as `binaryStorage: "asset"`; absence means the
existing textual/inline storage path. Directory sync consults this registration rather
than hardcoding image/document phase state when selecting asset-first hashing,
rehydration, and size limits. The image plugin enables it in the image cutover. The
document plugin remains legacy inline/base64 until Phase 5, then enables it with the PDF
schema cutover.

### Directory-sync boundary

This work coordinates explicitly with
[`directory-sync-import-load.md`](./directory-sync-import-load.md): its Phase 1 watcher
suppression is independent, while its Phases 2–3 must land with or after the image cutover
for binary paths. Text and binary imports use different fast paths and size policies.

`brain-data/image` remains the human-visible and Git-syncable representation. Asset-backed
binary import ordering is load-bearing:

1. derive entity type/ID and stat the source path;
2. fetch the existing entity before adapter deserialization;
3. if it contains an asset reference, call `assets.stat` before any unchanged-file skip;
4. hash the source file incrementally. When the referenced asset exists and the file hash
   equals the reference digest, skip parsing/persistence; when the asset is missing,
   restore it through `putStream` and require the returned reference to equal the entity
   reference before skipping;
5. for new or changed files, validate the format, stream through `putStream`, derive the
   canonical reference/metadata, then deserialize/persist the entity;
6. for asset-backed types with sidecars, compare sidecar metadata before the unchanged
   skip so a metadata-only edit still imports.

This ordering preserves these properties:

- import never base64-encodes asset-backed files;
- export resolves the asset reference and writes the original bytes;
- IDs, filenames, extensions, and timestamps remain stable where the underlying bytes
  are unchanged;
- migration causes one expected `contentHash` change because serialized content changes
  from a data URL to an asset reference; afterward, unchanged bytes produce the same
  reference and stable entity hash;
- a missing asset is repaired before the pre-parse hash shortcut can skip its entity;
- a clean runtime with an empty entity database streams all binary files into the asset
  store before persisting entities.

Directory sync keeps separate limits:

- `maxImportFileBytes` remains 5 MB for textual entities and legacy base64-backed binary
  types;
- `maxAssetImportBytes` defaults to 100 MB for registered asset-backed image/document
  types and is operator-configurable;
- asset-backed files are streamed and never rejected by the 5 MB text/base64 guard;
- files exceeding their applicable limit remain in place and produce an operator-visible
  import issue.

The PDF phase registers `document` as asset-backed and adopts the streamed limit. Until
then, PDF import remains under the legacy 5 MB guard.

Also provide an explicit full reconciliation command:

```text
brain assets reconcile --entity-type image --from brain-data --dry-run
brain assets reconcile --entity-type image --from brain-data
```

Reconciliation scans every binary independently of entity content hashes, restores
missing assets through `putStream`, verifies file bytes against existing references, and
reports mismatches without silently changing an entity reference. The PDF phase extends
the same command to `brain-data/document`.

The migration does not rewrite the content repository or Git history. The runtime asset
store and the synced content checkout intentionally contain separate copies because they
serve different durability and synchronization boundaries.

## Phase 0: contract and baseline

Before implementation:

1. Record the exact image writers and readers—including every caller of `getEntity`,
   `getEntityRaw`, and image `listEntities`—and assign each an explicit
   `binaryContent` mode, asset-service read, or authorized attachment boundary.
2. Add mixed-format fixtures covering one legacy data URL and one asset reference, plus
   method-matrix fixtures for get/raw/list behavior in both binary-content modes.
3. Capture `yeehaa.io` production preflight metrics:
   - image entity count and status distribution;
   - encoded content bytes and decoded bytes;
   - FTS image row count;
   - duplicate payload count;
   - malformed and unsupported image rows, including SVG entities/files;
   - references from posts, projects, series, social posts, and site metadata;
   - free disk space on the persisted volume.
4. Confirm that explicit `assetDirectory` plumbing resolves to the persisted
   `data/assets` path in local, deployed, test, and advanced-config runtimes, and include
   that path in operator backups.
5. Reconcile delivery order with `directory-sync-import-load.md`: Phase 1 may ship
   independently, but its binary pre-parse and size-guard behavior must use this plan's
   asset-first ordering and separate limits.
6. Capture a preview build and a representative set of image checksums for before/after
   comparison.

The preflight is read-only and produces no base64 content in logs or manifests.

## Phase 1: asset foundation

Implement and validate the generic asset service:

1. Add Zod-validated `AssetRef`, byte-record, asset-store, and binary-content resolver
   contracts in `@brains/assets`; re-export them through `@brains/plugins` without adding
   an entity-service dependency cycle.
2. Add `assetDirectory` to standard, app, and shell configuration; verify XDG, local,
   test, and explicit-override resolution without deriving paths from database URLs.
3. Add the `@brains/asset-service` filesystem backend with atomic buffered/streamed
   writes, deduplication, stat, read, and verify.
4. Construct the asset service before entity-service, inject the structural compatibility
   resolver, expose the store through shell/plugin contexts, and test lifecycle ownership.
5. Add the explicit FTS eligibility setting and `binaryStorage: "asset"` entity-type
   declaration consumed by directory sync.
6. Add asset-service unit tests for malformed refs, buffered and streamed duplicate
   concurrent writes, exact/oversized stream bounds, truncated files, hash mismatch,
   interrupted stream cleanup, and temporary-write recovery. Test MIME spoofing and
   binary signature validation in the image/document ingestion packages instead.
7. Add backup/restore documentation for the configured `assetDirectory`.

No durable entity changes occur in this phase.

## Phase 2: image write and read cutover

### Writers

Change all durable image creation paths to decode provider/input data once, validate the
bytes, write the asset, and persist the reference:

- AI image generation;
- uploaded-image promotion;
- source attachment rendering and OG image generation;
- stock-photo selection/import;
- directory-sync binary imports through bounded streaming and remote-image imports;
- pending-image completion and failure handling.

The AI provider may continue returning a data URL internally during this phase; the image
handler consumes it at the provider boundary and never persists it.

### Readers

Change image consumers to resolve assets explicitly:

- image attachment/download providers used by chat, web chat, and CMS;
- site image preparation and optimization;
- media page composition and OG rendering;
- social publishing;
- directory-sync export;
- any entity-reference resolver that currently expands `entity://image` into a data URL.

Callers that need bytes receive bytes. Browser callers receive attachment URLs.
Reference-mode reads and all post-bridge list/read responses must not include an encoded
image payload; only the explicitly bounded compatibility mode may materialize one.

### Image schema and adapter

Update the shared image schema, adapter, and utilities:

- parse and validate asset references;
- support only PNG, JPEG, GIF, and WebP durable entities;
- remove SVG from the image schema and directory-sync extension set;
- detect format and dimensions from `Buffer`/`Uint8Array` rather than base64 strings;
- require completed image metadata;
- model pending and failed states without a stored fake image;
- preserve pure serialization and directory-sync round trips.

### Transitional read and API bridge

Keep two narrowly isolated compatibility paths:

1. the transitional image schema accepts existing stored data URLs while new writes
   produce only asset references;
2. the injected binary-content resolver implements the method matrix above when callers
   omit `binaryContent` or explicitly request `"legacy-data-url"`.

Every internal caller receives an explicit mode during Phase 0; migrated image readers
use `"reference"` and the asset service. Instrument storage-format reads and actual legacy
materializations by method/interface surface and count only so production verification
can prove both reach zero without logging content. Removing legacy mode is an explicit
API cutover, not an incidental consequence of changing the stored representation.

## Phase 3: image migration tooling

Add an explicit offline operator command; do not hide this work in ordinary startup. The
first implementation accepts only a local `file:` SQLite database and refuses remote
URLs. `--dry-run` and `--verify` are read-only; the mutating command requires the brain
application and workers to be fully stopped. The proposed surface is:

```text
brain migrate binary-assets --entity-type image --dry-run
brain migrate binary-assets --entity-type image
brain migrate binary-assets --entity-type image --verify
```

The command must:

1. Refuse non-`file:` database URLs, probe that an exclusive SQLite write lock can be
   acquired and release it before asset prewrite, and print the explicit requirement that
   the application remain stopped for the complete mutating run. Re-acquire and hold the
   lock for the database transaction in step 8.
2. Parse and validate each legacy image data URL, rejecting SVG and every unsupported
   format before any entity row changes.
3. Decode the bytes without logging them.
4. Write/reuse and verify the content-addressed asset.
5. Update only the image content, binary metadata, and `contentHash` computed from the
   canonical serialized asset reference while preserving entity ID, visibility,
   provenance, and original timestamps. Record this as the expected one-time hash change;
   subsequent directory-sync imports of unchanged bytes must compute the same reference
   and skip the entity update.
6. Delete the image's FTS row.
7. Skip and verify already-migrated rows so reruns are safe.
8. Complete a resumable asset-prewrite phase before database mutation. An incremental
   prewrite journal may record only asset digest/verification progress. After every
   candidate asset is present and verified, acquire the exclusive SQLite lock and use a
   dedicated migration repository—not the normal entity mutation API—to update all
   entity rows and delete their FTS rows in one database transaction. Preserve timestamps
   and emit no entity events, jobs, or automatic site builds.
9. Commit the final database checkpoint and migration manifest only after the transaction
   succeeds. The manifest contains entity ID, old content hash, asset digest, media type,
   byte size, status, and outcome—never the data URL. A failed prewrite resumes by
   verifying journaled/content-addressed files; it has no partial entity migration.
10. Fail closed on corrupt or unsupported rows before the database transaction and leave
    all entity rows unchanged; prewritten unreferenced assets are harmless and resumable.

Dry-run reports counts, errors, unsupported/SVG blockers, duplicate savings, estimated
asset bytes, expected one-time content-hash changes, and required free space. Verify
proves every migrated reference exists, matches its digest and entity metadata, has no
image FTS row, and
round-trips through directory sync without a second entity hash change. The independent
`brain assets reconcile` command proves missing runtime assets can be restored from
`brain-data` even when entity rows and file timestamps are otherwise unchanged.

## Phase 4: `yeehaa.io` cutover and soak

### Staging rehearsal

1. Copy the production database and relevant runtime configuration to an isolated
   environment.
2. Run dry-run and resolve every malformed or missing row.
3. Run the migration and verification.
4. Start the transitional release.
5. Trigger a preview rebuild on the running app through its command surface.
6. Compare representative source and output checksums and exercise the UX acceptance
   suite below.
7. Measure database size before and after an offline SQLite compaction.

### Production cutover

1. Confirm sufficient temporary disk for a database backup, approximately one additional
   asset corpus, and SQLite compaction. Use the dry-run estimate; for the current local
   corpus, reserve at least 4 GiB before beginning.
2. Deploy the transitional release without running the migration automatically.
3. Enter a bounded maintenance window and stop the entire brain application, including
   background workers and content writes; confirm the process remains stopped until the
   mutating command releases its exclusive SQLite lock.
4. Back up `brain.db` plus WAL/SHM state using a SQLite-safe method, and snapshot
   `data/assets` if it already exists.
5. Run dry-run, migration, and verify.
6. Start the application and confirm readiness.
7. Trigger and inspect a preview rebuild on the running app before any production rebuild.
8. Exercise CMS, chat attachment, and controlled publishing checks.
9. Trigger the production site rebuild only after preview acceptance.
10. Keep the pre-migration database snapshot for the rollback window.
11. Compact SQLite only after functional verification, using an offline safe procedure.

### Rollback

If verification or UX acceptance fails:

1. stop the application;
2. restore the pre-migration database snapshot and matching release;
3. restart and verify the prior site and attachment paths;
4. leave newly written content-addressed files in place as harmless orphans;
5. do not attempt an in-place reverse conversion during the incident window.

### Soak and bridge removal

Soak `yeehaa.io` through normal uploads, generated covers, site builds, CMS use, chat
downloads, directory sync, and at least one controlled publishing flow. Legacy image-read
telemetry must remain zero. After the agreed soak:

- remove the storage data-URL reader and resolved-content API bridge only after both
  telemetry counters remain zero and every inventoried caller uses the replacement
  contract;
- migrate remaining repository image fixtures to asset-backed harness fixtures;
- retain only the explicit migration parser in operator tooling for backup recovery;
- update architecture and entity reference documentation;
- remove this completed image phase from the active plan once its outcome is documented.

## Phase 5: PDF document follow-up

Begin only after the image cutover has soaked successfully and the asset service has no
open correctness or restore defects.

### PDF scope

Migrate durable PDF document content from:

```text
data:application/pdf;base64,...
```

to the same `asset://sha256/<digest>` representation. Reuse the asset service, migration
command, manifest, verification, backup, and rollback machinery.

### PDF-specific work

1. Update document schema and adapter contracts for an asset reference plus:
   - `mediaType: application/pdf`;
   - `sizeBytes`;
   - filename;
   - page count and existing provenance/deduplication metadata.
2. Change PDF writers:
   - uploaded PDF preservation;
   - generated printable documents;
   - generated social/carousel documents;
   - attachment-provider output promoted into document entities.
3. Change PDF readers:
   - chat/CMS attachment and download routes;
   - social document publishing;
   - content-pipeline publication;
   - directory-sync import/export and document sidecars;
   - any preview or media renderer that currently decodes document content.
4. Set document entities to `fullTextSearchable: false` and remove existing PDF payloads
   from FTS. Searchable extracted text, if desired later, must be a separate textual
   projection rather than the encoded PDF bytes.
5. Extend `brain migrate binary-assets` with `--entity-type document` and mixed
   image/document verification.
6. Rehearse and cut over active PDF corpora independently; do not combine the first PDF
   migration with the image production window.

### PDF acceptance

- Uploaded and generated PDFs download byte-for-byte correctly.
- Browser filenames and `Content-Type`/`Content-Disposition` remain correct.
- Printable and carousel generation still produces immediately accessible artifacts.
- LinkedIn or other document publishing receives the original bytes and filename.
- Directory sync preserves PDF bytes and sidecar metadata in both directions.
- Asset-backed PDFs use bounded streaming and the configurable asset limit rather than
  the 5 MB text/legacy-base64 guard.
- A clean runtime restores document assets from `brain-data/document`.
- No document entity payload is stored in FTS or expanded into ordinary API lists.

## UX acceptance criteria

The storage change is complete only when users observe no regression in normal image
workflows:

1. Uploading an image returns the same immediate confirmation and usable attachment.
2. Generated images retain pending progress, completion, failure, inline preview, and
   download behavior.
3. CMS lists and editors render thumbnails without exposing `asset://` to the browser.
4. Chat and web-chat display and download images with correct filenames and MIME types.
5. Public, shared, and restricted images preserve their current access boundaries.
6. Preview and production sites emit the same logical images and optimized variants.
7. Cover images, OG images, inline `entity://image` references, and alt text remain intact.
8. Social publishing receives byte-identical source media.
9. Directory sync imports and exports byte-identical image files without loops or
   timestamp churn.
10. A clean restore from synced `brain-data` rebuilds the asset store and produces a
    working site.
11. Missing or corrupt assets produce bounded errors and visible failed state rather than
    process crashes or silent empty images. `read` is deliberately not digest-verified —
    hashing every read would be prohibitive on site builds — so it catches truncation
    through a size check only. Image and document readers call `verify` on the failure
    path before surfacing an error, so corruption fails loudly instead of rendering as
    wrong or empty bytes.

The stored/raw entity contract intentionally changes: completed `image.content` and later
`document.content` contain an internal asset reference. The transitional resolved-read
adapter preserves the prior data-URL representation for inventoried callers during the
compatibility release. Before that adapter is removed, supported clients must migrate to
the authorized attachment descriptor/download surface, and the breaking API change must
be called out in release notes.

## Validation

### Targeted automated checks

- asset-service unit, explicit-path configuration, and lifecycle tests;
- image schema, adapter, PNG/JPEG/GIF/WebP MIME/signature, byte-format, and dimension
  tests, plus SVG rejection and migration-blocker tests;
- image generation/upload/source-render handler tests;
- attachment authorization and MIME tests;
- directory-sync binary round-trip tests covering asset-first pre-parse ordering,
  missing-asset repair before skip, metadata-only sidecar changes, 5 MB text/legacy
  limits, and configurable 100 MB streamed-asset limits;
- site image preparation and optimization tests;
- social publishing media tests;
- entity-service FTS exclusion and binary-storage registration tests;
- migration dry-run, one-time content-hash transition, idempotency, resume, corruption,
  deduplication, and rollback tests;
- `getEntity`, `getEntityRaw`, and image `listEntities` compatibility-matrix tests in
  legacy/reference modes plus method/surface telemetry tests;
- missing-asset startup restoration and explicit `brain assets reconcile` tests that do
  not depend on entity/file content drift;
- equivalent document/PDF tests in Phase 5.

Run targeted workspace typecheck, tests, and lint first. Run full repository checks because
the final contract crosses shell, shared packages, entities, service plugins, interfaces,
and the published CLI.

### Runtime checks

Use the canonical personal test app posture. Start the app using its canonical posture
script, trigger the site rebuild on the running app through MCP HTTP, and inspect
`dist/site-preview` before production output. Validate both a fresh runtime and a runtime
containing mixed legacy/new image rows during the transition.

## Delivery sequence

### PR 1: asset service and FTS policy

- Lower-level `@brains/assets` contracts and `@brains/asset-service` filesystem
  implementation without dependency cycles.
- Explicit `assetDirectory` plumbing through standard, app, and shell configuration.
- Shell/plugin-context integration and entity-service resolver injection.
- Explicit full-text eligibility policy.
- Lifecycle, path-resolution, security, and atomic-write tests.

### PR 2: image cutover

- Image schema/adapter and pending-state changes.
- All image writers and readers moved to the asset service.
- Entity-ID-based attachment descriptor plus explicit get/raw/list binary-content modes
  and compatibility bridges.
- PNG/JPEG/GIF/WebP policy with blocking SVG preflight/removal.
- Directory-sync no-drift, asset-first short-circuit, separate text/asset limits, and
  missing-asset startup restoration coverage coordinated with
  `directory-sync-import-load.md`.
- UX regression coverage.

### PR 3: migration and reconciliation tooling

- Explicit CLI dry-run/migrate/verify command.
- Explicit `brain assets reconcile` command for full `brain-data` rehydration.
- Local-SQLite-only fencing, resumable asset prewrite, exclusive transactional entity/FTS
  mutation, and no-event migration repository.
- Checkpoint, manifest, one-time hash transition, corruption, idempotency,
  reconciliation, and backup/rollback tests.
- `yeehaa.io` staging rehearsal instructions.

### Operational window: `yeehaa.io`

- Staging rehearsal.
- Production backup, migration, preview verification, production rebuild, and soak.
- Database compaction after acceptance.

### PR 4: image bridge removal

- Remove the storage reader and resolved-read compatibility adapter after caller-specific
  telemetry reaches zero.
- Publish the raw entity API change and attachment replacement in release notes.
- Finalize docs and fixtures.

### PR 5+: PDF follow-up

- PDF writer/reader and schema cutover.
- Document migration tooling and tests.
- Independent PDF rehearsal, cutover, soak, and bridge removal.

## Completion criteria

### Image phase

- Every completed image entity contains a valid asset reference.
- Every referenced image asset exists and passes digest verification.
- No new durable image write stores a data URL.
- No durable image entity or synced image file uses SVG; preflight has no unsupported
  media blockers.
- No image row remains in FTS.
- All UX acceptance criteria pass on the canonical personal app and `yeehaa.io`.
- Preview and production builds complete from the running migrated app.
- Backup restoration and clean `brain-data` rehydration are proven.
- The transitional storage reader and resolved-content API bridge both record zero use
  by every inventoried caller during the agreed soak.

### PDF follow-up

- Every completed PDF document entity contains a valid asset reference.
- No new durable PDF write stores a data URL.
- No document PDF payload remains in FTS.
- PDF acceptance, restore, migration, rollback, and soak criteria pass independently.
