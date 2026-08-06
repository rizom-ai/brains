# Plan: Directory Sync Import Load Follow-ups

## Status

Not started. Depends on `fix/directory-sync-git-performance` landing on `main` — Phase 1
reuses the `suppressWatchPaths` mechanism that branch introduces. Three sequential
phases, one worktree; each phase ships independently.

## Context

The git fan-out fix scoped periodic-pull imports to pulled paths, batched watcher
bursts, suppressed pull echoes, and skipped no-op commit/push cycles. Three residual
load sources remain in the import path. All run in the main process (that is by design —
git and embedding work are already async subprocesses/network calls; the cost here is
per-file CPU churn between awaits):

1. **Startup**: initial sync imports the full vault — every file is read, frontmatter-
   parsed, and zod-validated even when nothing changed, because the content-hash
   short-circuit (`shouldUpdateEntity` in `file-operations.ts`) runs only _after_
   `deserializeImportEntity`. The other startup suspect was checked and needs no work:
   `backfillMissingEmbeddings` is one candidates query when the index is clean and
   queues jobs only for genuinely missing/stale embeddings.
2. **Export echoes**: auto-export (`auto-sync.ts`) writes entity files on
   `entity:created/updated/deleted`, the watcher sees those writes, and each queues a
   re-import that no-ops on hash match but still pays read + parse.
3. **Pathological single files**: one very large markdown file is a single synchronous
   parse; legacy binaries are additionally base64-encoded whole in `readEntity`.

## Coordination with durable binary assets

This plan coordinates with
[`durable-binary-assets.md`](./durable-binary-assets.md). Phase 1 is independent and may
land first. Phases 2–3 must preserve two distinct import paths once durable assets land:

- text and legacy base64-backed binary entities use the ordinary content-hash path and
  5 MB `maxImportFileBytes` guard;
- entity types registered with asset-backed binary storage verify/restore the referenced
  asset before an unchanged skip, stream bytes without base64 expansion, and use a
  separate configurable `maxAssetImportBytes` limit (default 100 MB).

The image cutover introduces the asset-backed path. Documents remain legacy binary until
the PDF follow-up registers them as asset-backed. If this plan lands first, the durable
asset PR must update the binary branch and the regression tests in the same change; the
text optimization remains unchanged.

## Phase 1 — Suppress export echoes

The same echo class the pull fix closed, on the export side.

- `fileOps.writeEntity` returns the path(s) it writes (entity file, plus sidecar for
  documents). The auto-sync create/update handlers call
  `directorySync.suppressWatchPaths(paths)` immediately **before** the write, so the
  suppression window is open before chokidar can observe the write. The delete handler
  suppresses the target path before unlinking, so the `delete` echo skips the redundant
  `deleteEntity` roundtrip.
- Semantics are unchanged from the pull fix: one-shot per path, 10s expiry, purge of
  pending changes. The accepted race is the same one already accepted for pulls: a user
  editing the same file inside chokidar's ~2s coalescing window loses to the state that
  triggered the export. That matches the plugin's existing conflict bias (git conflicts
  auto-resolve remote-wins), and the one-shot design keeps the failure direction
  "duplicate import" rather than "missed import" everywhere else.

Tests first: auto-sync handler tests assert `suppressWatchPaths` is called with exactly
the written paths before the fs operation; file-watcher tests already characterize
one-shot suppression and stay green; an end-to-end event test proves an export write
produces no import job while an unrelated concurrent local edit still does.

## Phase 2 — Pre-parse import short-circuit

Makes the unchanged-file case cheap everywhere without skipping asset recovery.

### Text and legacy binary path

- In `processEntityImport`, fetch the existing entity and compare
  `computeContentHash(rawEntity.content)` against `existing.contentHash` **before**
  `deserializeImportEntity`. On match, count the file as skipped and stop — no
  frontmatter parse, no zod validation. Pass the prefetched entity into
  `persistImportEntity` so the entity is fetched once per file, not twice.
- Compare sidecar metadata before skipping a legacy document so a metadata-only sidecar
  edit still imports; sidecar data is separate from `rawEntity.content` today.
- This remains the same content comparison `shouldUpdateEntity` performs today, only
  hoisted above parsing. `rawEntity.id`/`entityType` come from
  `parseEntityFromPath`, which runs before deserialization.

### Asset-backed binary path

For an entity type registered as asset-backed, do not base64-encode the file and do not
apply the text shortcut before asset verification:

1. fetch the existing entity and parse its asset reference;
2. call `assets.stat` before any unchanged skip;
3. hash the source file incrementally;
4. if the asset exists and its reference matches the file digest, skip
   deserialization/persistence after checking sidecar metadata;
5. if the asset is missing, restore it with `putStream`, require the returned reference
   to match the existing entity, then skip persistence;
6. if the file is new or changed, validate and stream it to the asset store before
   deserializing/persisting the canonical reference and metadata.

Initial sync deliberately stays a full-vault scan: with `ignoreInitial: true` on the
watcher, the startup scan is the correctness backstop for files edited while the brain
was offline and for missing runtime assets. No git-baseline optimization may bypass the
asset-presence check.

Tests first: unchanged text skips deserialization; changed/new text still imports;
metadata-only document sidecar edits import; unchanged asset-backed files skip only after
`assets.stat`; missing assets rehydrate before skip; changed/new assets persist their new
reference; no asset-backed path constructs a base64 string.

## Phase 3 — Size guards by storage path

Route the stat result through the registered entity storage policy before reading:

- Text entities and legacy base64-backed binary types use `maxImportFileBytes`, default
  5 MB. This bounds synchronous markdown parsing and prevents additional base64 entity
  bloat before a type migrates.
- Asset-backed binary types use `maxAssetImportBytes`, default 100 MB and independently
  operator-configurable. They stream through `putStream`; the import path never buffers
  or base64-encodes the complete file.
- A typed `OversizedFileError` records the applicable limit, path, and size.
  `importFile` counts the file as skipped and records an operation-status issue
  (`kind: "import"`) instead of relying on logs.
- Oversized files remain in place and are not quarantine-renamed. Export remains
  unaffected.

Tests first: oversized/exact-limit text and legacy binary fixtures exercise the 5 MB
policy; oversized/exact-limit asset fixtures exercise the configurable 100 MB policy;
stream interruption removes temporary files; a large asset below its limit restores from
`brain-data`; configuration overrides remain independent.
