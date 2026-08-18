# Plan: Directory Sync Import Load Follow-ups

## Status

Implementation and release are complete through Phase 5, and the local
feature-enabled performance comparison is complete. Git runtime resilience is a
separate track in
[`directory-sync-git-execution-broker.md`](./directory-sync-git-execution-broker.md);
manual smoke load acceptance remains pending and approval-gated.

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
  in 196.21 seconds with the same assertions, so issue #102 was closed based on
  the evidence available at that time.
- Later current-main local runs reproduced the stall repeatedly on Bun 1.3.11.
  Git had completed and created the merge commit, but the owning Bun subprocess
  completion remained unresolved, so update/delete jobs were never queued.
  Retained wrapper experiments additionally proved `status=0` and fully written
  output while the parent operation stayed pending. Replacing `Bun.spawn` with
  Node `child_process`, isolating it in a Worker, polling a mode-0600 completion
  sentinel, and using synchronous or persistent-interval polling did not make
  the full soak reliable. Those speculative workarounds must not ship.
- This behavior matches Bun issue `oven-sh/bun#26580` and the event-loop failure
  described by `oven-sh/bun#33261` / PR `oven-sh/bun#32233`. Upstream reproduced
  the defect on Bun 1.3.14 and verified it fixed on current main. With the
  original Git runner restored, isolated Bun `1.4.0-canary.1+da3851e57` passed
  three consecutive persistence-gated 350-file soaks in 193.63, 193.69, and
  193.95 seconds with no soak-owned process left behind. The repository and
  deployed runtime remain on Bun 1.3.11; no canary was committed or deployed.
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

## Phase 6 — Related Git resilience and cross-track acceptance

Performance and Git resilience are separate engineering tracks. The Git-specific history
below is retained because it defines reconciliation and health invariants, but active Git
execution work is handed off to
[`directory-sync-git-execution-broker.md`](./directory-sync-git-execution-broker.md).
Do not reopen performance conclusions merely because the runtime workaround is pending.

### 6.1 Remove the affected async Git-completion path

- Bun 1.3.14 remains affected. Instead of waiting indefinitely for a fixed stable release,
  move checkout ownership and Git execution outside the web/worker Bun event loops using
  the broker plan.
- The broker workaround must pass on Bun 1.3.11 and 1.3.14. A future immutable stable Bun
  containing the upstream fix remains defense in depth and should run the same matrix,
  but is no longer the sole delivery path.
- The packaged soak already has persistence assertions and deterministic worker/handler
  deletion barriers. Preserve them unchanged while changing Git execution.
- Require three unchanged local 350-file passes, normal CI, and one independent scheduled
  soak with Bun version, broker state, and process-cleanup evidence.

### 6.2 Make merge-to-queue handoff durable

A fixed runtime reduces the probability of a hang; it does not make a merged-but-not-
queued window acceptable.

- Persist a schema-validated reconciliation checkpoint containing a credential-free
  remote fingerprint, branch, and `lastReconciledGitHead`. Read and advance it under the
  same Git serialization boundary as the corresponding HEAD transition.
- Establish the checkpoint only after initial sync has durably queued its work. For each
  pull, retain the prior checkpoint, merge/fetch, derive changed and deleted paths from
  `lastReconciledGitHead..HEAD`, and enqueue one durable batch before advancing it. A
  no-change pull may advance only after validating repository identity and HEAD.
- A successful DB→Git local commit may advance the reconciliation checkpoint because the
  DB mutation is already applied; push/ahead state remains Git's separate responsibility.
  If checkpoint persistence fails, startup replay is intentionally idempotent. Never
  advance after a failed path derivation, partial enqueue, or unconfirmed commit.
- On startup, require the checkpoint's credential-free remote fingerprint and branch to
  match the configured checkout, require its commit object to exist, and require it to be
  an ancestor of HEAD. Replay a valid mismatch through the same changed-path,
  pending-delete, and batch-enqueue path. A missing checkpoint, identity mismatch,
  missing commit, reclone, branch switch, or non-ancestor/force-pushed history uses the
  existing full-scan correctness fallback; reset the checkpoint only after that work is
  durably queued.
- Advancing after successful enqueue is sufficient because queued jobs are durable and
  restart-recoverable. Test crash points after merge, path derivation, enqueue, local
  commit, and checkpoint persistence. Prove duplicate replay is harmless, deletions stay
  authoritative, local export commits are not misclassified as remote deletes, and a
  checkpoint can never cross repository or branch identity.

### 6.3 Surface stale pulls to an external watchdog

The existing operation status records `state: pulling` and `startedAt`, but a pulling run
without a job or batch is currently cleared during restart initialization and is not an
operational-health failure. Change that behavior deliberately:

- Add schema-validated `lastProgressAt` to the active run. Update it at phase boundaries,
  successful subprocess boundaries, and observed Git output, with bounded/throttled
  persistence. The existing Git timeout is an inactivity timeout, not a total-runtime
  deadline.
- On each `/health/operate` request, classify the pull as stale when
  `now - lastProgressAt` exceeds the configured inactivity timeout plus a bounded grace
  period. This evaluation must be read-only and request-driven, not dependent on an
  in-process recovery timer. Return sanitized stale-Git details in operational health;
  do not make `/health/live` or routing readiness depend on repository reachability.
- During startup, classify and preserve an unlinked `pulling` run before the current
  initialization path can clear it. Run checkpoint replay, persist the sanitized issue
  and recovery outcome, then clear/finish the stale run. Dashboard history must describe the
  interrupted Git handoff instead of reporting an unrelated missing batch.
- Keep recovery outside the affected process. Under an explicitly approved policy, the
  host/container watchdog may restart only after sustained `/health/operate` failure.
  Detect restart with container `StartedAt` as well as `RestartCount`, apply a cooldown
  and restart budget, and alert instead of looping indefinitely. A case-specific
  production restart still requires fresh evidence and explicit approval.
- Test two distinct failures. A true stalled child that is killed and reaped may reject
  its operation and release the queue. A child whose completion never settles must keep
  later Git operations serialized, degrade operational health, and become externally
  restart-eligible; after supervised termination, startup replay must restore DB/Git
  convergence with zero orphaned process groups.

### 6.4 Validate feature-enabled performance independently

Keep feature-enabled performance acceptance independent of the Git execution broker. The
first hermetic 350-note comparison exposed a conservative throughput bound: embeddings and
topic extraction completed safely in 83.1 seconds, but the shared job worker serialized all
AI calls at concurrency one.

The bounded-parallel follow-up now covers distinct 350-note add and update phases with
embeddings and topic extraction enabled and 100 ms asynchronous latency per mocked call.
The add phase completed in 33.1 seconds and the update phase in 34.0 seconds. Each phase
completed 350 probe embeddings and exactly 88 topic batches; shared AI concurrency and
update-embedding concurrency reached four, while projection work remained limited to one
outstanding job. Pending work peaked at 11 jobs for add and 78 for update, processing
peaked at four, and both phases drained to zero after a 250 ms quiet window. All 1,031
readiness samples stayed routing-ready and operational with no degraded sample. The fixture
cannot contact an external AI provider.

The shell job-worker concurrency is schema-validated, defaults to four, and remains
configurable. `sourceChangeBatchDelayMs` absorbs ordinary short ingress gaps, but it cannot
identify a logical import when the producer is externally descheduled beyond that window.
Directory Sync therefore declares an explicit durable bulk-mutation boundary; projection
ingress stays durable while one settled successor wave observes the complete batch. This
replaces accidental global serialization without adding an unbounded AI fan-out or a
health-priority scheduler.

A new remote `load` run remains blocked on completion of the separate Git execution broker
acceptance plan, still requires explicit approval, and must complete all seven phases with
zero external AI calls, health failures, restarts, OOMs, or zombies, followed by cleanup to
the seven-note baseline, zero probes, and Git parity.

### 6.5 Gate resource saturation and runtime lockups

Throughput and queue drain do not by themselves prove acceptable performance. The nightly
packaged soak now constrains the supervised runtime to two CPUs and records a standing
resource/lockup report across `/health/live`, `/health/ready`, and `/health/operate`. It
fails on any health error, child-role restart, persistent zombie, endpoint latency at or
above 500 ms, five seconds of continuous CPU use at or above 90% of available capacity,
aggregate process-tree RSS at or above 1,280 MiB, or RSS growth at or above 320 MiB. The
report is emitted even when a correctness barrier fails, so lockups retain their resource
evidence rather than timing out silently.

The first affected-runtime diagnostics on Bun 1.3.11 failed without retrying. In one run,
Git merged the delayed 350-file update and advanced `origin/main`, but the seven expected
import jobs were never queued. In a second run, Git merged the ordinary update while the
database remained at the eight jobs from startup and add; health requests reached their
one-second timeout and one persistent zombie was observed. This is the known
merged-but-not-queued lost-completion class, not a throughput result, and keeps stable-Bun
acceptance blocked on the separate broker track.

The same two-CPU 350-file add/update/delayed-update/delete gate then passed unchanged on
the previously isolated fixed build, Bun `1.4.0-canary.1+da3851e57`. Across 904 monitor
samples, peak CPU was 0.854 cores (42.7% of the two-core capacity), continuous saturation
was zero, peak aggregate RSS was 945,934,336 bytes with 188,751,872 bytes of growth, and
final RSS growth was 161,787,904 bytes. Maximum live/ready/operate latencies were
18.9/43.1/44.7 ms; no health failure, child restart, or persistent zombie occurred. This
is diagnostic evidence only: the mutable canary remains unpinned, and remote smoke remains
approval-gated.

The nightly job now runs a second, feature-enabled resource gate before the Git soak so a
stable-runtime Git lockup cannot hide AI-path CPU evidence. It constrains the current
process to two CPUs, executes 350 add plus 350 update operations with embeddings and topic
extraction enabled against 100 ms local mocks, and samples process CPU, RSS, and event-loop
delay every 100 ms. The fixture suppresses per-embedding info logs so the test runner does
not retain 700 diagnostic objects as an artificial memory load. Before final RSS sampling,
the monitor stops its recurring sampler and leaves the process idle for five seconds; it
does not force garbage collection. The gate fails on five seconds of 90% CPU saturation,
a single 1,000 ms event-loop delay, five seconds of accumulated delay across consecutive
samples delayed by at least 500 ms, 1,216 MiB RSS, or 768 MiB RSS growth. The same RSS limits apply to both the
observed peak and the final post-idle sample; both values remain separately reported.

The initial tighter RSS limits exposed Bun test-runner garbage-collection variance rather
than a different workload: one diagnostic execution retained 6.58 million JSC objects in
a 399 MB heap and ended at 1,113,501,696 bytes RSS after the idle window, while an identical
execution retained 2.14 million objects in a 151 MB heap and ended at 636,235,776 bytes.
Both completed the same 704 embeddings and 176 object calls with drained queues. The
permanent limits therefore cover the observed deferred-collection envelope without an
acceptance-only forced GC; structured reports preserve both the phase peaks and settled
RSS for regression analysis.

The two-CPU feature gate passed in 65.8 seconds: peak CPU was 1.573 cores (78.7% of
capacity), continuous saturation was zero, and maximum event-loop delay was 287.6 ms. Peak
RSS was 732,246,016 bytes with 285,839,360 bytes of growth; after five idle seconds final
RSS was 654,307,328 bytes with 207,900,672 bytes of retained growth. All 1,608 add/update
readiness samples remained operational and ready, both phases drained to zero, and no
external AI provider was reachable.

A post-merge local run overlapping unrelated repository suites exposed two max-only gate
problems without changing workload correctness: one event-loop turn was delayed 673.3 ms,
and deferred collection left final RSS at 1,219,039,232 bytes. The report was retained and
the run was not retried unchanged. The tracker now distinguishes a bounded delayed turn
from consecutive event-loop starvation, while preserving a hard one-second ceiling, and
the final RSS envelope matches the already accepted peak envelope rather than depending
on nondeterministic idle collection. Deterministic tracker tests cover transient and
consecutive delays. With those semantics, the unchanged 350 add plus 350 update workload
passed after rebasing onto current main in 67.2 seconds: peak CPU was 1.271 cores with zero
sustained saturation, maximum loop delay was 284.6 ms with zero sustained stall, peak RSS
was 1,093,332,992 bytes, and final RSS was 1,087,045,632 bytes. All 1,593 readiness samples
remained operational and ready and both phases drained.

This is the closest hermetic comparison to the prior smoke peak of 199.72% CPU, but it
remains local rather than smoke evidence.

An explicitly approved, narrower smoke comparison then ran only the add ramp and one
350-file update on Brain alpha.295; it did not run rename or delete as acceptance phases.
The operator plan capped external AI at 1,000 calls and required the expected durable
import-job completions plus two consecutive drained-queue samples for every phase. All
four phases passed: `add50` in 38.610 seconds, `add150` in 119.095 seconds, `add350` in
134.259 seconds, and `update350a` in 125.237 seconds. The gate observed exactly 700
embedding calls, 272 successful health samples, and zero health failure. Maximum response
times were 626 ms for live, 1,026 ms for ready, and 1,186 ms for operate.

Independent Docker sampling recorded a 104.15% peak CPU, 47.85% below the retained
alpha.275 peak of 199.72%. Peak Docker memory was 1,294,932,640 bytes, with 191,126,045
bytes of growth from the first sample; this is container memory rather than the packaged
process-tree RSS metric and is retained separately. The add/update gate therefore provides
smoke evidence that CPU behavior improved without reproducing the prior saturation or
health failure during those phases.

The complete run is nevertheless retained as failed and was not retried. After the gate
ended, cleanup pushed the probe-removal commit. Health requests then began timing out while
Docker CPU remained mostly 5–18% and memory remained between 1.189 and 1.194 GiB. Three
consecutive five-second Docker health-check timeouts made the container unhealthy, and the
host watchdog restarted it once. Startup reconciliation restored 51 entities, seven notes,
zero probes, an empty queue, one worker, and zero zombies; both driver cleanup and the
independently credentialed cleanup passed and restored the original content tree. This is
separate Git/delete-runtime lockup evidence: it does not erase the bounded add/update
resource comparison, but it prevents whole-run acceptance and keeps rename/delete on the
Git broker track.
