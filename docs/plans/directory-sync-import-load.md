# Plan: Directory Sync Import Load Follow-ups

## Status

Implementation and release are complete through Phase 5; manual smoke load
acceptance remains pending.

- Phase 1: released in `@rizom/brain@0.2.0-alpha.268`.
- Phase 2: released in `@rizom/brain@0.2.0-alpha.269` for text and current
  inline-backed binary entities.
- Phase 3: released in `@rizom/brain@0.2.0-alpha.270` for text and current
  inline-backed binary entities.
- Phase 4: released in `@rizom/brain@0.2.0-alpha.271`.
- Phase 5: the nightly hermetic and weekly smoke regression gates merged in PR
  #94. The first dispatched run exposed a piped-exit propagation bug, external
  AI work in the fixture, and excessive targeted-delete job fan-out; PR #99
  fixed all three. Run `31323158459` then proved failure propagation and
  notification delivery while catching an unmanaged Git automatic-maintenance
  descendant. PR #101 disabled automatic maintenance only in owned network Git
  subprocesses and released `@rizom/brain@0.2.0-alpha.275`.
- Post-release run `31325069219` timed out once waiting for its final cleanup
  pull, then its unchanged rerun passed the complete 350-file packaged soak in
  195.99 seconds: 2 tests passed, health and zombie checks passed, and the
  uploaded artifact contained the real Bun result with no external AI call.
  The next independent scheduled run, `31356873624`, passed on its first attempt
  in 196.21 seconds with the same assertions, so issue #102 was closed as a
  non-recurring runner stall.
- Smoke was rolled to `@rizom/brain@0.2.0-alpha.275` with the migrated
  `@rizom/site-smoke-canary@0.2.0-alpha.235`; deploy run `31364403378` passed.
- The approved manual load run `20260810072537` passed `add50`, `add150`, and
  `add350`, then failed `update350a` when both cores remained near 200% and
  health became unavailable. The server watchdog manually restarted the
  container at `2026-08-10T07:34:11Z`; Docker still reported `RestartCount: 0`,
  exposing a blind spot in the stress gate. Runtime logs also recorded 366
  external AI embedding calls because the deployed smoke config did not use the
  hermetic posture already used by the packaged soak.
- Workload cleanup and the independent cleanup both passed: the original Git
  tree, 7-note baseline, zero probes, drained queue, one active worker, and zero
  zombies were restored. Smoke remains operational on alpha.275; further remote
  load is paused while the gate gains hermetic-posture, external-AI, and
  watchdog-restart assertions. PR #105 added those assertions and released
  `@rizom/ops@0.2.0-alpha.276`; the pilot desired state now declares embeddings
  and automatic topic extraction disabled, but it has not been reconciled or
  deployed.
- Before another workload is approved, the stress workflow's `verify_only` mode
  must prove the exact Bitwarden/Varlock content credential path through clone
  and `git push --dry-run`. That mode creates no ref, content commit, probe, or
  cleanup job. The existing fine-grained PAT was repaired in place by granting
  `Contents: Read and write` for `rover-smoke-content`; no selector change or token
  rotation was needed. A local `ls-remote` then listed four refs, and write-free
  workflow run `31413167727` passed while the workload and cleanup jobs remained
  skipped.

Asset-backed Phase 2–3 behavior remains coordinated with
[`durable-binary-assets.md`](./durable-binary-assets.md) and lands with that storage
path; it is not a permanent inline compatibility commitment.

## Historical handoff (2026-08-08)

- Worktree `~/Documents/brains-worktrees/directory-sync-import-load` (branch
  `work/directory-sync-import-load`, based on main at alpha.266's release commit)
  contains Phase 1's failing tests: the `Export echo suppression` describe block in
  `plugins/directory-sync/test/auto-sync.test.ts` — five red tests, deliberately
  unimplemented. Start by making them green per Phase 1: add
  `getEntityWritePaths(entity)` to `FileOperations` (entity file path, plus the
  `.meta.json` sidecar for documents) and call `suppressWatchPaths` in the three
  auto-sync handlers before the write/unlink.
- Evidence from both smoke load runs, the wedged alpha.261 container log, and the
  resurrection git bundle live in `~/Documents/directory-sync-stress-evidence/`.
- `~/Documents/directory-sync-stress-evidence/tools/` holds the working operational
  scripts: `smoke-ssh.sh` (read-only smoke server access via the Bitwarden/varlock
  bootstrap), `run-regression.sh` (local benchmark driver; set `STRESS_PROFILE=load`
  for the load profile; its former personal `GH_TOKEN` override was removed after the
  fleet PAT permission repair), `run-cleanup.sh`, and `monitor-smoke.sh`. They read
  credentials at runtime from `~/Documents/yeehaa-io/.env` and contain no secrets.
- Deployed smoke: `@rizom/brain@0.2.0-alpha.265` (git-runner fix verified in
  production), clean 7-note baseline, healthcheck + watchdog active.

## Production evidence (2026-08-08 smoke load run, alpha.265)

The load profile against the deployed runtime pins these phases to measured failures
(evidence: `/tmp/directory-sync-stress-alpha261/`):

- `rename100` (100 delete+add pairs): both cores pinned ~200% for minutes,
  `/health/ready` exceeded 20s timeouts (17/329 samples failed), recovery automatic
  once the burst drained. Imports themselves completed correctly (persistence 211s).
- **Deleted-content resurrection**: while the remote cleanup commit was deleting probe
  files, auto-export wrote 100 still-in-DB renamed entities back to disk; the pre-pull
  commit preserved them; the merge kept them (delete/modify is not a content conflict,
  so `-Xtheirs` does not resolve it remote-wins). The checkout ended 2 local commits
  ahead of the remote with deleted content revived, and did not self-heal (evidence
  bundle: `resurrection-evidence/`).

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

## Phase 4 — Resurrection defense (remote deletions must win)

Phase 1 stops the echo _re-import_; this phase stops the echo _write_ from overriding a
remote deletion. Two defenses, both required:

- **Export suppression for pull-deleted paths.** When a pull reports deleted paths, the
  sync records them in a pending-delete set (path + entity id) until the corresponding
  `directory-delete` job completes. Auto-export handlers consult the set and skip
  writes for those entities — an `entity:updated` fired by a late embedding or
  projection job must not rematerialize a file the remote just deleted.
- **Post-merge reconciliation assertion.** After each pull merge settles, the sync
  compares the checkout tree against the remote ref for the pulled paths. A file that
  the remote deleted but that still exists locally (delete/modify divergence) is
  deleted and its entity queued for `directory-delete` — remote-wins, matching the
  plugin's existing conflict bias. The divergence is logged as a warning: reaching this
  branch means suppression failed.

Tests first: extend the import-burst soak (`packages/brain-cli/test/import-burst-stability.test.ts`)
with a concurrent-cleanup scenario — push a rename burst, then push a commit deleting
all probes while entity churn (embedding updates) is still in flight; after settle,
assert the checkout equals the remote tree, zero probe files on disk, and the note
count returns to baseline. Unit tests cover the pending-delete set lifecycle and the
reconciliation branch in isolation.

## Phase 5 — Permanent performance gates

The verification that caught these defects becomes standing infrastructure instead of a
one-off:

- **Nightly hermetic soak** (brains CI): a scheduled workflow runs the import-burst soak
  (`RUN_IMPORT_BURST_SOAK=1`, 350 files) on a Linux runner against the packaged
  runtime. It gates nothing on PRs (too slow) but pages the operator on failure. The
  soak is load-sensitive, so the job runs alone on its runner.
- **Weekly smoke regression profile** (rover-pilot): the Directory Sync Stress workflow
  on a cron, `profile: regression`. `GitCheckout` routes
  `CONTENT_REPO_ADMIN_TOKEN` through the credential-helper `GH_TOKEN`/`GITHUB_TOKEN`
  environment used by all stress Git operations, without placing the token in command
  arguments. The existing fine-grained PAT must select `rover-smoke-content` and grant
  repository permission `Contents: Read and write`; metadata authorization alone is
  insufficient. Repair this permission in place rather than changing selectors or
  rotating the token. Write-free workflow run `31413167727` proves the repaired
  Bitwarden/Varlock path.
- **Load profile as the acceptance gate**: rerun manually after Phases 1–4 land; the
  plan is complete when `load` passes end-to-end on smoke (all seven phases, zero
  health failures). Only then consider promoting `load` to a scheduled cadence and
  opening the 700-probe `stress` profile.
