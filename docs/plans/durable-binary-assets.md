# Durable Binary Asset Storage Plan

Last updated: 2026-09-30

## Status

The SQLite asset foundation is on `main` (`a7396a4a88`, released): `@brains/assets`
contracts, a single-BLOB `assets` table (migration 0010), `SqliteAssetRepository`, the
`fullTextSearchable` and `binaryStorage` entity-type settings, and atomic
asset/entity tests. No entity type uses `binaryStorage: "asset"`; images and documents
remain `data-url`. No instance has migrated.

Next is Phase 1: replace the single-BLOB storage with staged chunk storage. This plan is
the single source for asset storage and proceeds independently of
[turso-salvage.md](./turso-salvage.md).

## Decision

- Completed image entities store `asset://sha256/<lowercase-hex-digest>` in `content`.
  The bytes live in the same `brain.db` as the entity row, never in a filesystem store,
  a separate `assets.db`, or an object store.
- Bytes are **staged** as 1 MiB chunk rows under a random upload key, one commit per
  chunk. They are durable but unpublished: nothing references them.
- One small transaction **publishes** the asset header together with the entity reference
  and its FTS, projection and outbox writes.
- Invariant: a committed entity never references an asset that is not fully published.
- Everything runs on the application thread. There is no SQL worker, connection owner or
  off-thread persistence. `synchronous` (FULL) and `wal_autocheckpoint` (1000) keep their
  defaults.

## Why

Image entities currently store complete `data:image/...;base64,` URLs in
`entities.content`. That adds ~33% base64 overhead, indexes binary text in FTS, and
materializes every image in ordinary reads, lists, events and API payloads. On a copy of
the `yeehaa.io` database, BLOB assets compacted the database from 1.31 GiB to 323 MiB and
ordinary image-list content from 410 MiB to 12 KiB.

One database keeps one transaction and backup boundary. Git sync is optional, so
`brain.db` must be a complete, portable copy of an instance on its own.

Event-loop stalls come from two native calls whose cost grows with asset size: a
single-statement BLOB insert, and a COMMIT that fsyncs the WAL and then runs the automatic
checkpoint inline. Staging bounds both by chunk size.

### Measurements (2026-09-30)

Bun 1.4.0, `@libsql/client` 0.17.4, local ext4, two CPUs, warm cache, three runs each.
Synthetic tables without entity mutation, FTS, encryption or concurrent traffic.
Phase 2 performs acceptance on the running app.

| 100 MiB unless noted                                   | Max event-loop gap                  |
| ------------------------------------------------------ | ----------------------------------- |
| Single BLOB in one transaction (5 / 100 MiB)           | 72 / 644 ms                         |
| 1 MiB chunks in one transaction, yielding              | 367 ms; COMMIT alone 289–330 ms     |
| Same, automatic checkpoint off                         | 120–124 ms (WAL fsync)              |
| Single BLOB, `synchronous=NORMAL`, checkpoint off      | 139–182 ms                          |
| **Staged chunk commits, then a publish transaction**   | **12–19 ms; publish commit ≤ 2 ms** |
| Staged, checkpoints on a Worker connection, FULL       | up to 100 ms (fsync contention)     |
| Chunked read, yielding / single-BLOB read              | 10–11 ms / 162 ms                   |
| SHA-256: whole buffer / `crypto.subtle` / 1 MiB slices | 72 / 30 / 1.6 ms                    |

Staged writes kept the WAL at 4.1 MiB. The remaining 12–19 ms spikes are the automatic
checkpoints.

A worker that owns the entity connection was rejected:

- Drizzle's interactive transactions would become cross-thread round trips while the
  write lock is held.
- libSQL gives each transaction its own connection, so the worker would need transaction
  routing.
- A dying worker creates uncertain commits.
- Fsyncs still contend across threads.

## Data model

A new entity migration drops migration 0010's single-BLOB `assets` table, which is empty
on every instance because no registered type writes assets, and creates:

```sql
CREATE TABLE asset_uploads (
  upload_id TEXT PRIMARY KEY NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE asset_chunks (
  upload_id TEXT NOT NULL REFERENCES asset_uploads(upload_id),
  ordinal INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (upload_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (typeof(bytes) = 'blob'),
  CHECK (length(bytes) BETWEEN 1 AND 1048576)
);

CREATE TABLE assets (
  digest TEXT PRIMARY KEY NOT NULL,
  upload_id TEXT NOT NULL UNIQUE REFERENCES asset_uploads(upload_id),
  size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  created INTEGER NOT NULL,
  CHECK (length(digest) = 64),
  CHECK (digest NOT GLOB '*[^0-9a-f]*'),
  CHECK (size_bytes >= 0),
  CHECK (chunk_count = (size_bytes + 1048575) / 1048576)
);
```

Rules:

- Every chunk is exactly 1 MiB except the last.
- `upload_id` is random (`crypto.randomUUID()`), never derived from the digest, so
  concurrent identical uploads never collide.
- Published headers and their chunks are immutable.
- MIME type, format, dimensions, filename, visibility and provenance stay on the entity.
- No entity read, list, search, event or FTS/embedding path touches the asset tables.

## Write flow

**Stage**, outside any transaction, each step in its own commit:

1. Resolve the entity type's byte limit. If the source size is known and exceeds it,
   reject before reading.
2. Insert `asset_uploads(upload_id, now)`.
3. For each 1 MiB slice of the source:
   - update an incremental SHA-256;
   - validate the media signature on the first slice;
   - insert the chunk row;
   - yield to the event loop.

   The source can be a buffer, a file stream, or a base64 data URL. A data URL is decoded
   in slices whose length is a multiple of four characters, and the decoded bytes are
   re-chunked into exact 1 MiB rows.

4. Return a staged handle carrying `uploadId`, `digest`, `sizeBytes`, `chunkCount` and the
   media facts.

If an error or the byte limit stops staging, delete the upload's chunks and row in
bounded batches. The sweeper covers crashes.

**Publish**, inside the existing entity mutation transaction (`ProjectionTransactionRunner`):

1. Check that `count(*)` and `sum(length(bytes))` of the upload's chunks match the handle.
   A mismatch fails the mutation.
2. If `assets` already holds the digest, require an equal `size_bytes` (a mismatch fails
   closed as corruption) and bind to the existing row. Otherwise insert the header.
3. Persist the entity reference with its FTS, projection and outbox writes.
4. Commit once.

If the transaction rolls back, there is no header and no reference; the staged upload is
an orphan. After a commit that reused an existing digest, the duplicate upload is deleted
in bounded batches.

The digest is computed from exactly the slices inserted, so publish does not rehash.
Full rehashing belongs to `verify`, backup verification and migration verification, which
read chunks outside the write lock.

`@brains/assets` replaces `PreparedAsset` with the staged handle. Plugin code never sees
upload IDs or chunks, and only the entity mutation boundary publishes. No API commits an
asset independently of an entity.

## Read flow

- `openRead(ref)` returns the chunks as an async iterable, in ordinal order, yielding
  between chunks. Attachment and download routes stream it.
- `read(ref)` returns the whole asset for consumers that need a buffer (sharp, social
  uploads). It allocates `size_bytes` once and fills it chunk by chunk.
- `stat(ref)` reads only the header.
- `verify(ref)` rehashes the streamed chunks.
- Missing, short or extra chunks fail visibly, never as an empty image.

## Orphan sweeping

An upload is an orphan when no `assets` row references it. At startup, and before each
staging, delete orphans older than one hour: their chunks go in batches of eight per
transaction with a yield between, then the upload row. There are no timers or jobs.
Orphans are harmless until swept.

Published assets are never deleted in this plan. A future collector must account for
every entity reference, rollback retention, directory-sync recovery and backup retention.

## Limits

- `MAX_ASSET_BYTES` (100 MiB) remains the contract ceiling.
- New image writes and directory-sync image imports are capped at 25 MiB; the cap is the
  `maxAssetImportBytes` default. Staging makes stalls independent of size, so the cap
  only bounds whole-buffer consumers: provider data URLs, sharp, and social uploads. Once
  Phase 2's acceptance holds at the ceiling, raising the cap is a configuration change.
- `maxImportFileBytes` stays 5 MB for textual and legacy entities.
- Migration applies only the ceiling. Dry-run inventories existing images above the new
  write cap.

## Media and access

- Durable images are PNG, JPEG (with `jpg`/`jpeg` normalized), GIF or WebP. SVG is
  rejected, and migration is blocked until each SVG is rasterized.
- Signature, format and dimensions come from the bytes. Completed images require
  `format`, `mediaType`, `sizeBytes`, `width` and `height`.
- Pending and failed images keep their existing UX without a fake payload.
- Browsers receive an interface-owned attachment descriptor containing an entity-ID
  `url`, `downloadUrl`, `filename`, `mediaType` and `sizeBytes`.
  - Routes resolve the entity, enforce visibility, then stream the bytes.
  - There is no route by digest.
  - `asset://` is never a browser URL.
- Markdown keeps `entity://image/{id}`. `entity://image/{id}`, `coverImageId` and
  `ogImageId` contracts are unchanged.

### Compatibility window

Entity get/list gain a `binaryContent` mode. For one release, an omitted mode means
`"legacy-data-url"`, which materializes today's data URLs for legacy callers. New
internal callers pass `"reference"`, which returns the stored reference and never loads
bytes. Telemetry counts legacy materializations per caller surface without logging
content. After a zero-use soak, legacy mode is removed and an omitted mode means
`"reference"`.

## Directory sync

`brain-data/image` stays the human-visible, Git-syncable mirror and reconstruction
source; it is not needed to restore a database snapshot.

Import:

1. Hash the file incrementally and validate its signature.
2. Compare the digest with the entity reference and `stat`. If both are unchanged, skip.
3. Otherwise stage from a file stream and publish with the entity.
4. Report oversized, malformed or inconsistent files visibly, leaving the source file in
   place.

Staging replaces the temporary spool file.

Export streams the chunks to the file and keeps IDs, filenames, extensions and timestamps
stable when the bytes are unchanged.

`brain assets reconcile --entity-type image --from brain-data [--dry-run]` restores
absent assets and matching entities transactionally. It reports mismatches and never
silently changes an established reference.

## Backup and restore

A SQLite-safe `brain.db` snapshot holds references and bytes together. Backup
verification:

1. Reopen the snapshot read-only and run `PRAGMA quick_check`.
2. Check that every entity reference resolves to a header whose chunks match
   `chunk_count` and `size_bytes`.
3. Recompute every published digest by streaming.
4. Record asset count, total bytes and a digest inventory in the manifest.
5. Report orphan uploads without failing the backup.

Any failure in steps 1–3 blocks deployment. Restore replaces `brain.db` with the matching
release; no reconciliation step is needed.

## Phases

Each phase is one PR, tests first.

1. **Staged storage.**
   - Scope: the replacement migration, stage/publish/read/stat/verify, and the sweeper, in
     `SqliteAssetRepository` and `@brains/assets`.
   - Tests: rewrite the existing seven asset tests for the staged schema, then add:
     - a kill between chunks, and a kill after staging but before publish (subprocess),
       each leaving no reference and a sweepable orphan;
     - a publish rollback leaving no header;
     - concurrent identical uploads producing one header, with both entities resolving;
     - a size mismatch failing closed;
     - a missing chunk failing the read;
     - the sweeper's age threshold and batching;
     - sliced base64 decoding matching a whole-buffer decode.
   - This removes the whole-asset reread and rehash under the write lock, and the double
     copy in `read()`.
   - No entity type is switched.
2. **Image upload walking skeleton.**
   - Images switch to `binaryStorage: "asset"`.
   - Uploaded-image promotion stages and publishes.
   - `binaryContent` legacy materialization keeps every other reader working.
   - The chat and Studio attachment routes stream bytes.
   - Stall acceptance on the running canonical personal app, with FTS, outbox and
     encryption on: a 1/5/25/100 MiB upload and download keeps the max event-loop gap
     ≤ 25 ms, measured as external `/health` latency.
   - WAL stays bounded while the search connection holds a read snapshot.
   - The provider base64 path is measured.
3. **Remaining writers:**
   - AI generation;
   - source attachment and OG rendering;
   - stock-photo import;
   - directory-sync import;
   - pending-image completion and failure.

   Provider data URLs never persist. Rebuild from `9824c6c406` on the frozen Turso
   branch, not cherry-picked.

4. **Readers to reference mode:**
   - site image preparation;
   - media page and OG composition;
   - social publishing;
   - directory-sync export;
   - entity-reference expansion.

   Add legacy-materialization telemetry. The site-builder fix `926533fda4` lands here.

5. **Migration tooling:** `brain migrate binary-assets` (dry-run, migrate, verify) and
   `brain assets reconcile`.
6. **Rehearsal and production cutover.**
7. **Soak and bridge removal.**
8. **PDF follow-up**, after images soak without open defects.

### Migration (Phase 5)

This is an offline command against a stopped application with a local `file:` database.
It refuses remote URLs and live writers.

- **Dry-run:**
  - parse and decode every legacy row without writing or logging content;
  - block SVG, malformed and unsupported rows;
  - report unique and duplicate bytes, rows above the write cap, expected growth, FTS
    rows, content-hash changes and the peak disk needed for backup, migration and vacuum.
- **Before production:** reconcile the known `yeehaa.io` divergence of four
  database-only and eight sync-only payloads.
- **Per entity:**
  - stage from the decoded data URL;
  - publish together with the entity update to the reference, binary metadata and new
    content hash;
  - delete the image's FTS row;
  - preserve ID, visibility, provenance and timestamps.

  Per-chunk commits keep the WAL bounded. A crash leaves a mixed legacy/reference
  database, which the transitional release supports. Reruns skip completed rows.

- **Afterwards:** run FTS5 `optimize`, then offline `VACUUM` once acceptance passes.
- **Verify:**
  - every completed image has a valid reference resolving to one header with matching
    chunks, size and digest;
  - no image FTS rows remain;
  - directory-sync export is byte-identical;
  - reimporting unchanged files changes no hash.

  The manifest records IDs, old and new content hashes, digest, media type, size and
  outcome, never bytes.

### Cutover and rollback (Phase 6)

**Rehearsal**, on an isolated copy of production:

1. Run dry-run and resolve every blocker.
2. Take and verify a snapshot.
3. Migrate and verify.
4. Start the transitional release and trigger a preview rebuild on the running app.
5. Compare image checksums.
6. Run UX acceptance.
7. Rehearse restoring the snapshot.

**Production:**

1. Deploy the transitional release without automatic migration.
2. Stop the application.
3. Take and verify a snapshot.
4. Run dry-run, migration and verify.
5. Start the application.
6. Inspect the preview before the production rebuild.
7. Exercise Studio, chat, upload and generation, directory sync and controlled publishing.
8. Compact only after acceptance.

**Rollback:** stop the application, restore the pre-migration snapshot with its matching
release, restart and verify. Never attempt in-place reverse conversion.

## UX acceptance

1. Upload and generation keep their confirmation, pending, completion, failure, preview
   and download behavior.
2. Studio renders thumbnails without exposing `asset://` references or bytes.
3. Chat and web chat display and download images with correct filenames and MIME types.
4. Public, shared and restricted authorization stays entity-based.
5. Preview and production sites emit equivalent images and optimized variants. Covers, OG
   images, inline references and alt text stay intact.
6. Social publishing receives byte-identical media.
7. Directory sync round-trips byte-identical files without loops or timestamp churn.
8. A snapshot restores references and bytes together, and a clean database rebuilds from
   `brain-data` through reconciliation.
9. Missing or corrupt assets fail visibly.
10. Normal reads, lists and events never include bytes.
11. The max event-loop gap stays ≤ 25 ms during asset writes and reads up to the
    contract ceiling.

## Validation

- Run targeted `entity-service` and `@brains/assets` tests first.
- Because the change crosses shared, shell, entity, plugin, interface and CLI boundaries,
  then run the full repository typecheck, tests, lint, build, architecture, changeset,
  formatting and docs checks.
- Runtime checks use the canonical personal app: trigger a preview rebuild on the running
  app over MCP HTTP, then inspect `dist/site-preview`.
- Cover fresh, mixed legacy/reference, fully migrated, restored-snapshot and `brain-data`
  reconstruction states.

## Completion

- **Images are complete when:**
  - every completed image references a fully published, verified asset in `brain.db`;
  - no new write stores a data URL;
  - no image bytes appear in FTS, embeddings, lists or events;
  - UX acceptance passes on the personal app and `yeehaa.io`;
  - legacy materialization records zero use before the bridge is removed.
- **PDFs** repeat the same criteria independently. Extracted PDF text, if searchable, is
  a separate textual projection.

Delete this plan when the PDF phase lands.
