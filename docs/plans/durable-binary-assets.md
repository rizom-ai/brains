# Durable Binary Asset Storage Plan

Last updated: 2026-08-27

## Status

Replanning.

PR #125 implemented a filesystem-backed content-addressed asset store under
`data/assets`. That backend is no longer the target architecture. Do not merge or deploy
that branch as-is.

The revised decision is to keep durable binary bytes in the same entity SQLite database
as their entity references, using a dedicated content-addressed BLOB table. This preserves
one transactional source of truth and one SQLite-safe backup/restore boundary while still
removing base64 payloads from entity rows, FTS, ordinary reads, events, and API lists.

No production instance has been migrated. The existing PR remains useful as implementation
research: its asset-reference contracts, image byte validation, reader/writer inventory,
FTS policy, compatibility bridge, migration checks, and UX acceptance coverage can be
reused after rebase. Its filesystem store, `assetDirectory` plumbing, filesystem-specific
migration/reconciliation behavior, and backup assumptions must be replaced.

## Decision

Completed image entities store an opaque content-addressed reference:

```text
asset://sha256/<lowercase-hex-digest>
```

The referenced bytes live once in a dedicated `assets` table inside the same `brain.db`
that contains the entity row:

```text
brain.db
├── entities
│   └── content = asset://sha256/<digest>
└── assets
    ├── digest = <digest>
    ├── bytes = <raw SQLite BLOB>
    └── size_bytes = <decoded byte count>
```

The initial backend is SQLite, not the runtime filesystem and not a separate asset
database. Asset insertion and the entity mutation that publishes its reference must share
the same database transaction. A committed entity must never reference an absent asset.

The asset contracts remain backend-neutral so a future object-store backend is possible,
but introducing one requires a separately approved durability, backup, transaction, and
multi-node design. Backend abstraction must not weaken the initial single-database
consistency guarantee.

## Why this design

The existing representation is inefficient because it treats binary bytes as searchable
text, not merely because SQLite stores them.

Current image entities place a complete data URL in `entities.content`:

```text
data:image/png;base64,...
```

That causes avoidable amplification:

- base64 adds roughly 33% over the original bytes;
- SQLite stores the expanded text in the entity row;
- FTS stores/indexes the same non-textual content again;
- updates amplify WAL, backup, event, and API payloads;
- ordinary entity reads and lists can materialize complete image payloads;
- consumers repeatedly decode the text back into bytes.

A raw BLOB table removes the base64 and FTS amplification without splitting durable state
between a database and a directory. Normal entity queries remain lightweight because
they select only the asset reference; the BLOB is loaded only through an explicit asset
read.

Read-only inspection of the local `yeehaa.io` instance found:

- 160 files under `brain-data/image`;
- 320,551,933 bytes of image files, approximately 306 MiB;
- a `data/brain.db` file of approximately 1.4 GiB;
- directory sync already representing image entities as ordinary binary files in
  `brain-data/image`.

A 306 MiB raw asset corpus is reasonable for local SQLite. The production database must
still be measured independently during migration preflight. The local numbers are
planning evidence, not a production assertion.

The design deliberately prioritizes consistency and recoverability over obtaining the
smallest possible database file. Benchmarks must verify that the revised database, WAL,
backup, and restore costs remain operationally acceptable, but performance alone is not a
reason to create a second source-of-truth boundary.

PDF document entities use the same broad data-URL pattern. They remain deferred until the
image path has soaked successfully.

## Goals

- Keep entity references and durable binary bytes in one SQLite source of truth.
- Commit an asset and the entity reference to it atomically.
- Store each distinct binary payload once by SHA-256 digest.
- Store raw bytes rather than base64 text.
- Keep image and document entities as the identity, visibility, and authorization
  boundary.
- Preserve `entity://image/{id}`, `coverImageId`, and `ogImageId` contracts.
- Preserve upload, generation, CMS, chat, site-build, directory-sync, and publishing UX.
- Stop indexing binary payloads in FTS.
- Keep BLOBs out of ordinary entity reads, lists, events, logs, and API responses.
- Make migration explicit, idempotent, resumable, verifiable, and reversible.
- Restore references and bytes together from one SQLite-safe `brain.db` snapshot.
- Rebuild the database from `brain-data` through explicit reconciliation when no database
  snapshot is available.
- Keep generic asset contracts that the later PDF phase can reuse.

## Non-goals

- Optimizing for the smallest possible `brain.db` at the expense of consistency.
- Using `/data/assets`, plugin data directories, cache directories, or Git checkout paths
  as the authoritative runtime asset store.
- Introducing S3, R2, or another object store in the first implementation.
- Using a separate `assets.db`; that would recreate a cross-database backup and
  transaction boundary.
- Supporting remote libSQL/Turso or multi-node asset mutation before BLOB size,
  transaction, replication, and restore behavior is proven explicitly.
- Changing user-authored image references or cover/OG image IDs.
- Rewriting Git history to remove existing image or PDF objects.
- Migrating PDF entities during the image cutover.
- Automatically deleting unreferenced assets. Initial safety favors harmless orphaned
  rows over deleting bytes shared by multiple entities or retained rollback points.
- Storing MIME type, filename, dimensions, or authorization policy on the deduplicated
  byte row. Those facts belong to the referencing entity.
- Changing inline data URLs used by CSS, static decoration, or AI provider payloads when
  they are not durable entities.

## Settled decisions

### Asset identity

The canonical reference is:

```text
asset://sha256/<lowercase-hex-digest>
```

The digest is computed from the original decoded bytes. The key has no user-controlled
path component. The same bytes always produce the same reference, regardless of filename,
entity ID, or declared MIME type.

`asset://` is an internal storage reference. It is not a browser URL and not an
authorization mechanism.

### SQLite data model

Add a dedicated table to the entity database. Exact Drizzle naming may follow repository
conventions, but the durable contract is equivalent to:

```sql
CREATE TABLE assets (
  digest TEXT PRIMARY KEY NOT NULL,
  bytes BLOB NOT NULL,
  size_bytes INTEGER NOT NULL,
  created INTEGER NOT NULL,
  CHECK (length(digest) = 64),
  CHECK (digest NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof(bytes) = 'blob'),
  CHECK (size_bytes >= 0),
  CHECK (length(bytes) = size_bytes)
);
```

Rules:

- `digest` is the lowercase SHA-256 digest and the deduplication key.
- `bytes` contains the exact original binary bytes, never base64.
- `size_bytes` supports bounded reads and consistency checks without loading the BLOB.
- MIME type, image format, dimensions, filename, visibility, and provenance remain on
  the entity.
- Asset rows are immutable. Ordinary runtime code may insert or read, but not update
  bytes for an existing digest.
- No normal entity list/search query joins or selects `assets.bytes`.
- No FTS or embedding index contains `assets.bytes`.

A digest collision or an existing row whose byte count/hash does not match must fail
closed as corruption. Duplicate writes verify and reuse the existing row.

### Entity representation

A completed image entity stores the asset reference in `content`. Its metadata retains
existing fields and adds stable binary facts needed without loading the BLOB:

- `format`;
- `mediaType`;
- `sizeBytes`;
- `width`;
- `height`;
- existing title, alt text, status, provenance, attachment type, and deduplication data.

Pending or failed images may have empty content and incomplete binary metadata. Browser-
facing attachment routes preserve the existing pending presentation without storing a
fake image payload.

PDF documents adopt the same representation in the follow-up phase. PDF-specific
filename, page-count, and provenance fields remain on the document entity.

### Transaction boundary

The asset and entity reference are one logical mutation.

Writer flow:

1. validate the payload and determine its canonical media type;
2. hash the decoded bytes and derive metadata;
3. prepare a bounded asset write without changing durable state;
4. begin one entity-database transaction;
5. insert the immutable asset row, or verify/reuse an identical row;
6. persist the entity containing the matching asset reference;
7. update FTS/projection/export journals as part of the existing entity mutation;
8. commit once.

If any step in the transaction fails, neither a new asset row nor its entity reference
becomes visible. Existing identical asset rows are safe to reuse.

The asset service must not expose a public sequence in which plugin code commits an asset
and later commits an entity independently. Use a transaction-aware prepared-asset/unit-of-
work contract owned by the entity mutation boundary.

### Prepared and streamed input

Hashing and media inspection happen before the database transaction so a slow input
stream does not hold a SQLite write lock.

In-memory generation/upload paths may prepare a bounded `Uint8Array`. Directory-sync and
other file inputs may hash into a private temporary spool file, but that file is transient
processing state, never authoritative durable storage. It must be removed after commit or
failure.

Before implementation, prove whether the selected SQLite/libSQL driver supports
incremental BLOB writes within the transaction. If it does not, the implementation must:

- load the prepared bytes only at the final bounded insert;
- enforce a limit supported by the measured runtime memory budget;
- avoid claiming that database insertion is fully streaming;
- lower the default asset limit if the 100 MB target cannot be inserted safely.

Correctness and bounded failure take priority over preserving the earlier filesystem
implementation's streaming assumptions.

### Deletion and garbage collection

Entity deletion does not delete the asset row in the initial phases. Content addressing
allows multiple entities and rollback points to share bytes, and retaining an
unreferenced row is harmless.

A future mark-and-sweep collector may delete unreferenced assets only after it accounts
for:

- every current entity reference;
- migration/rollback retention requirements;
- directory-sync recovery state;
- backup retention guarantees;
- an explicit age threshold.

Garbage collection is not part of the image cutover.

### Supported image media

The durable image contract supports the raster formats already exercised by upload,
generation, optimization, and publishing:

- PNG (`image/png`);
- JPEG (`image/jpeg`, with `jpg`/`jpeg` normalized consistently);
- GIF (`image/gif`);
- WebP (`image/webp`).

SVG is removed from the durable image schema and directory-sync image extension set.
Serving arbitrary same-origin SVG introduces script/XSS risk, and current dimension and
signature handling does not support it safely. Preflight inventories SVG rows/files and
blocks migration until each is explicitly sanitized and rasterized.

### Public and browser references

Browsers and external integrations receive an interface-owned, same-origin attachment
descriptor containing entity-ID-based `url`, `downloadUrl`, `filename`, `mediaType`, and
`sizeBytes`. Those routes resolve the entity, enforce visibility/permission, then read the
BLOB. They never expose direct digest access as an unauthenticated route.

Markdown retains `entity://image/{id}` until an explicit renderer resolves it. Site builds
read bytes explicitly and continue emitting optimized public build artifacts.

Add a `binaryContent` mode to entity get/list contracts. During one compatibility release,
omitted mode preserves existing behavior and is equivalent to `"legacy-data-url"`; new
internal consumers pass `"reference"`.

| Method                    | Transitional default                           | `binaryContent: "reference"`                |
| ------------------------- | ---------------------------------------------- | ------------------------------------------- |
| `getEntityRaw(image)`     | data URL matching today's direct image result  | stored asset reference                      |
| `getEntity(image)`        | data URL matching today's direct image result  | stored asset reference                      |
| `getEntity(non-image)`    | current embedded `entity://image` expansion    | embedded entity references remain unchanged |
| `listEntities(image)`     | data URLs matching today's stored results      | asset references without byte expansion     |
| `listEntities(non-image)` | unchanged; lists do not resolve embedded bytes | unchanged                                   |

Compatibility materialization reads the BLOB explicitly and encodes only for an
inventoried legacy caller. Telemetry counts materializations by method/interface surface
without logging content. After zero-use soak, remove legacy mode; omitted mode then means
`reference`.

## Target architecture

### Asset contracts

Keep pure asset reference/store/resolver contracts in a lower-level shared
`@brains/assets` package. The minimum contract supports:

- validating and constructing asset references;
- preparing bounded bytes/streams and returning digest/size facts;
- transaction-bound insertion with an entity mutation;
- `read(ref)` returning bytes;
- `stat(ref)` returning existence and size without reading bytes;
- `verify(ref)` recomputing the digest;
- explicit compatibility materialization.

Backend-neutral public contracts must not imply that `put()` independently commits before
an entity mutation. Separate preparation from durable commit in naming and types.

### SQLite asset repository

Implement the initial repository against the same `EntityDB` connection and transaction
type used by entity mutations. Ownership may live in `@brains/entity-service` or a lower-
level shell package only if dependency direction remains clean and the entity transaction
is still shared structurally.

The implementation must:

- never create or depend on `assetDirectory`;
- use parameterized BLOB operations;
- enforce byte count and digest integrity;
- reject malformed references;
- make concurrent insertion of identical bytes idempotent;
- fail closed when an existing digest row is inconsistent;
- keep BLOB selection out of normal entity reads;
- expose no process-global state;
- preserve existing entity mutation admission, outbox, projection, and lifecycle
  semantics.

### Full-text indexing policy

Add an explicit entity-type setting such as `fullTextSearchable: false`. Entity mutations
must delete stale FTS rows and skip insertion for non-searchable types. Do not overload
vector `embeddable` policy: vector and keyword indexing are separate contracts.

The image plugin enables this in the first cutover. The document plugin enables it during
the PDF follow-up.

### Binary storage registration

Add an explicit entity-type setting such as `binaryStorage: "asset"`. Directory sync and
entity reads consult this registration rather than hardcoding image/document behavior.
The image plugin enables it first; documents remain legacy until their separate phase.

## Directory-sync boundary

`brain-data/image` remains the human-visible and Git-syncable representation, but it is a
mirror/recovery source rather than a second component required by an ordinary database
restore.

Asset-backed import ordering:

1. derive entity type/ID and stat the source file;
2. hash the file incrementally and validate its signature/format;
3. derive the asset reference and metadata;
4. fetch the existing entity and call `assets.stat` without loading the BLOB;
5. if entity reference, asset row, file digest, and sidecar metadata are unchanged, skip;
6. otherwise prepare the bytes and atomically insert/reuse the asset plus persist the
   entity in one database transaction;
7. report oversized, malformed, unsupported, or inconsistent files visibly.

Export resolves the entity reference, reads the BLOB, validates size/signature, and writes
the original bytes. IDs, filenames, extensions, and timestamps remain stable when bytes
are unchanged.

A clean database rebuild streams/hashes every binary file and creates its asset row and
entity atomically. Database snapshot restoration does not require this reconstruction;
it is a secondary recovery path.

Keep separate limits:

- `maxImportFileBytes` remains 5 MB for textual and legacy base64-backed entities;
- `maxAssetImportBytes` is separately configurable for registered asset-backed types;
- its default is accepted only after SQLite insertion memory/WAL benchmarks;
- exceeding the applicable limit leaves the source file in place and records an
  operator-visible import issue.

Provide explicit reconciliation:

```text
brain assets reconcile --entity-type image --from brain-data --dry-run
brain assets reconcile --entity-type image --from brain-data
```

Reconciliation scans independently of content hashes, verifies file bytes against entity
references, restores absent asset rows and matching entities transactionally, and reports
mismatches without silently changing an established entity reference.

This work still coordinates with the completed directory-sync import/load safeguards.
Their watcher/load behavior is independent; binary imports must use the SQLite asset
transaction and measured byte limits described here.

## Backup, restore, and source of truth

A SQLite-safe snapshot of `brain.db` contains both entity references and asset bytes. No
matching `/data/assets` directory exists and no second asset snapshot is required.

Backup tooling must:

1. capture `brain.db` through a supported SQLite online snapshot mechanism;
2. reopen the snapshot read-only and run `PRAGMA quick_check`;
3. validate asset table schema/count/total bytes;
4. verify every `entities.content` asset reference resolves to an asset row;
5. recompute asset digests for a full verified rollback snapshot, or use an explicitly
   documented verified-inventory mechanism that cannot bless unchecked bytes;
6. record asset count, total bytes, and a deterministic digest inventory in the backup
   manifest;
7. fail closed before deployment when any reference, size, or digest check fails.

Restore replaces `brain.db` through the normal stopped-process procedure and restores the
matching runtime release. References and bytes return to the same point in time by
construction.

`brain-data` is still valuable as an off-host content mirror and reconstruction source,
but it is not a substitute for a SQLite-safe runtime backup. Off-host encrypted database
backup and restore drills remain operator requirements.

## Compatibility window

There is no permanent dual-format contract. One transitional release:

- accepts legacy data URLs and asset references in stored image entities;
- writes new images only as asset references plus BLOB rows;
- preserves existing get/raw/list behavior through explicit legacy materialization;
- moves internal callers to reference mode and authorized attachment URLs;
- records legacy storage reads and materializations by caller surface;
- supports dry-run, mixed-state migration, verification, and rollback.

Removal requires a completed caller inventory and zero bridge use during the agreed soak.
The migration parser remains operator-only afterward. The PDF phase may use the same
bounded transition.

## Phase 0: revalidation and backend decision evidence

Before reworking implementation:

1. Keep PR #125 draft and mark the filesystem backend superseded.
2. Rebase the useful branch work onto current `main` only after this revised plan is
   approved; do not preserve filesystem compatibility shims by default.
3. Benchmark the real local image corpus in four forms:
   - current base64 plus FTS;
   - base64 without FTS;
   - raw BLOB assets with reference-only entity rows;
   - filesystem CAS as historical comparison only.
4. Measure:
   - database and WAL size;
   - migration peak disk;
   - SQLite-safe backup duration/size;
   - verified restore duration;
   - duplicate savings;
   - normal entity list/get behavior;
   - explicit asset read and site-build behavior;
   - peak memory for the largest accepted asset;
   - concurrent writer behavior.
5. Confirm the SQLite driver can bind the chosen maximum BLOB safely. Either prove an
   incremental BLOB path or set a lower bounded limit.
6. Inventory every image writer/reader and every caller of get/raw/list compatibility
   modes.
7. Capture production preflight metrics independently, including SVG/unsupported rows,
   FTS image rows, duplicate payloads, references, and free disk.
8. Add mixed legacy/reference fixtures and backup/restore fixtures.
9. Confirm no ordinary query, event, log, or API list selects BLOB bytes.

If measured SQLite behavior is unacceptable, stop and write a new decision record rather
than silently falling back to the filesystem design. Any fallback must explain how it
preserves equivalent source-of-truth and backup guarantees.

## Phase 1: SQLite asset foundation

1. Retain/revise `@brains/assets` reference and validation contracts.
2. Add the `assets` table migration to the entity database.
3. Implement transaction-aware asset preparation, insertion, stat, read, and verify.
4. Extend the entity mutation unit of work so a prepared asset and entity reference commit
   together.
5. Add explicit FTS eligibility and binary-storage registration.
6. Add tests for malformed refs, duplicate/concurrent insertion, transaction rollback,
   digest conflict, size mismatch, bounded input, temporary spool cleanup, missing rows,
   and BLOB-free normal reads.
7. Add SQLite snapshot tests proving references and bytes restore together.

No existing entity is migrated in this phase.

## Phase 2: image write and read cutover

### Writers

Change every durable image creation path to validate/decode once, prepare bytes, and call
the atomic asset-plus-entity mutation:

- AI image generation;
- uploaded-image promotion;
- source attachment and OG rendering;
- stock-photo import;
- directory-sync image import;
- pending-image completion/failure.

Provider data URLs may exist transiently at the provider boundary but are never persisted
by new writes.

### Readers

Change image consumers to resolve bytes explicitly:

- attachment/download providers for chat, web chat, and CMS;
- site image preparation/optimization;
- media page composition and OG rendering;
- social publishing;
- directory-sync export;
- entity-reference expansion.

Browser callers receive authorized URLs. Internal byte consumers use the asset service.
Reference-mode reads never select or encode BLOBs unless the caller explicitly requests
bytes.

### Schema and media policy

- accept asset refs for completed images;
- support PNG/JPEG/GIF/WebP;
- reject durable SVG;
- detect signature, format, and dimensions from bytes;
- require completed binary metadata;
- preserve pending/failed UX without fake payloads;
- test pure adapter/directory-sync round trips.

## Phase 3: image migration tooling

Use an explicit offline command:

```text
brain migrate binary-assets --entity-type image --dry-run
brain migrate binary-assets --entity-type image
brain migrate binary-assets --entity-type image --verify
```

The first implementation supports a stopped application with a local `file:` SQLite
database. It refuses remote URLs and live writers.

### Dry-run

- parse every legacy row without writing;
- decode and validate supported bytes without logging content;
- block SVG, malformed, or unsupported rows;
- report unique/duplicate bytes, expected BLOB growth, WAL/backup/vacuum peak disk, FTS
  rows, and one-time content-hash changes;
- prove enough free disk for backup, migration, and compaction.

### Mutation

After a complete blocker-free preflight, migrate one entity at a time in an atomic,
resumable transaction:

1. decode/validate/hash the legacy data URL;
2. insert or verify the asset BLOB;
3. replace entity content with the canonical reference;
4. add canonical binary metadata;
5. compute the new content hash;
6. delete the image FTS row;
7. preserve ID, visibility, provenance, and original timestamps;
8. commit the asset row and entity update together.

A crash may leave a mixed legacy/reference database, which the transitional release must
support. It may not leave a committed reference without bytes. Reruns verify and skip
completed rows. The final verify command must pass before restart.

### Verification

- every completed image contains a valid reference;
- every reference resolves to exactly one BLOB row;
- every size and digest matches;
- no image FTS row remains;
- directory-sync export is byte-identical;
- reimporting unchanged bytes causes no second entity hash change;
- ordinary image lists in reference mode do not select BLOBs.

The final manifest records IDs, old/new content hashes, digest, media type, byte size, and
outcome—never image bytes or data URLs.

## Phase 4: rehearsal, production cutover, and rollback

### Isolated rehearsal

1. Copy production database/configuration to isolation.
2. Run dry-run and resolve every blocker.
3. Take and verify a SQLite-safe pre-migration snapshot.
4. Run migration and verification.
5. Start the transitional release.
6. Trigger a preview rebuild on the running app.
7. Compare representative image checksums and exercise UX acceptance.
8. Measure database/WAL/backup behavior and compact SQLite offline only after acceptance.
9. Rehearse restoring the single pre-migration database snapshot and matching release.

### Production cutover

1. Confirm required disk from dry-run estimates.
2. Deploy the transitional release without automatic migration.
3. Stop the complete application and all workers.
4. Take and verify a SQLite-safe `brain.db` snapshot.
5. Run dry-run, migration, and verify.
6. Start the application and confirm readiness.
7. Trigger and inspect preview output before production rebuild.
8. Exercise CMS, chat attachment, upload/generation, directory-sync, and controlled
   publishing checks.
9. Keep the pre-migration database snapshot and release for the rollback window.
10. Compact only after functional acceptance.

### Rollback

1. stop the application;
2. restore the pre-migration `brain.db` snapshot;
3. deploy the matching pre-cutover release;
4. restart and verify prior site/attachment behavior;
5. do not attempt in-place reverse conversion during the incident window.

No separate asset-directory restore is required.

### Soak and bridge removal

Soak normal uploads, generated covers, site builds, CMS use, chat downloads, directory
sync, and controlled publishing. Remove legacy storage and resolved-read bridges only
after caller-specific telemetry remains zero. Publish the raw entity API change in release
notes.

## Phase 5: PDF follow-up

Begin only after image storage, backup, restore, and migration have soaked without open
correctness defects.

Migrate durable PDF content to the same reference plus BLOB representation. Reuse the
same transaction, migration, verification, backup, and rollback machinery.

PDF-specific work includes:

- `application/pdf`, size, filename, page count, and provenance metadata;
- upload/generation/preservation writers;
- chat/CMS download and publishing readers;
- directory-sync binary/sidecar round trips;
- FTS exclusion for encoded PDF bytes;
- independent migration rehearsal and production window.

Searchable extracted PDF text, if desired, must be a separate textual projection rather
than the encoded PDF bytes.

## UX acceptance criteria

1. Uploading an image returns the same immediate confirmation and usable attachment.
2. Generated images retain pending, completion, failure, preview, and download behavior.
3. CMS renders thumbnails without exposing `asset://` or BLOB bytes to the browser.
4. Chat/web-chat display and download correct filenames and MIME types.
5. Public/shared/restricted authorization remains entity-based and unchanged.
6. Preview/production sites emit equivalent logical images and optimized variants.
7. Covers, OG images, inline entity references, and alt text remain intact.
8. Social publishing receives byte-identical source media.
9. Directory sync imports/exports byte-identical files without loops or timestamp churn.
10. A SQLite snapshot restores references and bytes together with no reconciliation step.
11. A clean database can still reconstruct images from `brain-data` through explicit
    reconciliation.
12. Missing/corrupt rows fail visibly rather than producing silent empty images.
13. Normal entity reads/lists/events never include BLOB bytes.

## Validation

### Targeted automated checks

- asset reference and SQLite repository tests;
- transaction rollback and concurrent deduplication tests;
- BLOB-free normal query/event/list tests;
- image signature/schema/dimension/SVG rejection tests;
- upload/generation/source-render tests;
- attachment authorization/MIME tests;
- directory-sync import/export/reconcile tests;
- FTS exclusion tests;
- migration dry-run, mixed-state resume, digest, idempotency, and rollback tests;
- compatibility method-matrix and telemetry tests;
- SQLite-safe backup, full asset verification, and restore tests;
- equivalent PDF tests in the later phase.

Run targeted workspace checks first, then full repository typecheck, tests, lint, build,
architecture, changeset, formatting, environment-schema, and docs checks because the
contract crosses shared, shell, entity, plugin, interface, and CLI boundaries.

### Runtime checks

Use the canonical personal test app posture. Start the app with its canonical script,
trigger preview rebuilding on the running app through MCP HTTP, and inspect
`dist/site-preview` before production output. Test fresh, mixed legacy/reference, fully
migrated, restored-snapshot, and `brain-data` reconstruction states.

## Delivery sequence

Do not revive the old combined 179-file PR unchanged. Re-cut the work after rebase:

1. **Foundation PR:** contracts, SQLite table/repository, transaction boundary, FTS/binary
   registration, backup/restore tests; no entity migration.
2. **Image cutover PR:** schema, writers/readers, authorization surfaces, compatibility
   bridge, directory-sync support, UX coverage.
3. **Migration PR:** offline dry-run/migrate/verify, reconciliation, runbook, isolated
   rehearsal evidence.
4. **Operational window:** approved production backup, migration, preview, rebuild,
   verification, rollback readiness, and soak.
5. **Bridge-removal PR:** remove legacy reads after zero-use telemetry.
6. **PDF follow-up:** independently reviewed implementation and migration.

If atomic writer/reader compatibility requires two implementation slices to deploy
together, keep the commits/PRs reviewable and gate activation behind configuration rather
than recreating one unreviewable branch.

## Completion criteria

### Image phase

- Every completed image entity contains a valid asset reference.
- Every reference resolves to verified bytes in the same `brain.db`.
- Asset/entity publication is atomic.
- No new durable image write stores a data URL.
- No image bytes appear in FTS, embeddings, normal lists, or events.
- No durable image uses unsupported SVG.
- SQLite snapshot/restore proves references and bytes return together.
- Directory-sync reconstruction remains independently proven.
- All UX acceptance criteria pass on the canonical personal app and `yeehaa.io`.
- Preview and production builds complete from the running migrated app.
- Legacy bridges record zero use before removal.

### PDF follow-up

- Every completed PDF contains a valid reference to a verified same-database BLOB.
- No new durable PDF stores a data URL.
- No encoded PDF payload remains in FTS.
- PDF acceptance, backup/restore, migration, rollback, and soak pass independently.
