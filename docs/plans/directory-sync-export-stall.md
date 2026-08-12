# Plan: Directory-sync DB→git auto-export silent permanent stall

## Status

Root-cause class confirmed locally; attribution of the specific live production incident remains
open. The database→git auto-export in `plugins/directory-sync` can silently stop emitting
`Auto-sync` commits because every export shares the Git lock with pulls, and one Git operation
whose runtime completion never settles holds that lock indefinitely. The remaining work is to
prove that exact path for the production incident, pin the fixed Bun runtime, add durable recovery,
and validate the safe live-recovery procedure. Related in-flight work is tracked in Phase 6 of
`docs/plans/directory-sync-import-load.md`.

## Goal

Finish proving the **specific production path** by which the database→git auto-export stopped
emitting commits, then deliver the fixed runtime, deterministic replay, regression tests, and a
safe live-recovery procedure.

Do NOT stop at the matching local symptom. Preserve the distinction between the confirmed code
mechanism and the still-unconfirmed attribution of the alpha.262 production incident.

## Investigation update (2026-08-11)

- Current-main local 350-file runs repeatedly reached a state where Git created the merge commit
  and exited successfully, but Bun 1.3.11 never resolved the owned subprocess completion. A
  mode-0600 shell sentinel recorded `status=0` and complete output while the parent remained
  pending. The changed paths therefore never reached batch enqueue.
- The serialized Git queue makes that unresolved operation globally significant: its promise-tail
  turn is released only when the callback settles, so later pull, push, commit, and auto-export
  operations queue forever behind it. This exactly explains why only a process restart restores
  export.
- Node `child_process`, Worker isolation, file sentinels, synchronous filesystem inspection, and
  persistent timer polling were not reliable workarounds inside the affected Bun event loop. Do
  not ship them.
- Bun issue `oven-sh/bun#26580` was reproduced upstream on 1.3.14 and verified fixed on current
  main. With the original Git runner restored, isolated Bun `1.4.0-canary.1+da3851e57` passed three
  consecutive persistence-gated 350-file soaks in 193.63, 193.69, and 193.95 seconds. Production
  remains on Bun 1.3.11; no canary was committed or deployed.
- The production evidence is consistent with a pull holding the shared lock, but it does not prove
  which Git command wedged or exclude the remaining incident-specific checks below.
- Cross-incident note: the 2026-08-08 smoke web-process wedge on alpha.261 (futex wait, Git child
  exited but unreaped, all requests queued) matches this same Bun non-settlement class. Since
  alpha.265, network Git uses `runGitCommandWithStallTimeout`, which bounds ordinary no-output
  network stalls when Bun continues dispatching events. It does **not** protect Bun 1.3.x from the
  observed lost completion: the current-main reproduction hung inside that guarded pull because
  both `child.exited` and its in-process Effect timer failed to resume the owner. Network and local
  subprocesses therefore remain exposed until the fixed Bun pin; the external stale-operation
  watchdog remains the recovery backstop.

## What the plugin does (confirmed from the code — verify as you go)

- `src/lib/directory-sync.ts:136` `sync()` is **import-only** (files → DB). See the comment at
  lines 133–134. It is NOT the thing that writes DB changes out to git.
- `lastSync` is written in exactly one place: `src/lib/directory-sync.ts:142` (`markSynced` from
  `runDirectorySync`). So `lastSync` only advances on a completed **import** sync.
- The **DB→git export** ("Auto-sync" commits) is event-driven: `entity:created` / `entity:updated`
  subscribers, wired by `setupGitAutoCommit(...)` in `src/plugin.ts` (~line 380, inside
  `startBackgroundWork`). The call passes `config.commitDebounce` and `this.operationStatus`.
  Export is **debounced** (`commitDebounce`) and goes through `src/lib/export-pipeline.ts`
  (`processEntityExport`, lines 68/77).
- Current main serializes mutating Git workflows with `SerialQueue` from
  `shared/utils/src/serial-queue.ts`, held at `src/lib/git-sync.ts:42` and entered through
  `withLock` at lines 52–56. The deployed alpha.262 source must be cited separately when
  reconstructing that incident; current main has no `src/lib/git-lock.ts`.
- Restart recovery + the dashboard error live in `src/lib/directory-sync-operation-status.ts`:
  `reconcile()` starts at line 346; **"The active sync batch could not be recovered after
  restart"** is emitted at line 398, while the sibling missing-job message is at line 357.
  `failRun` removes `activeRun`; initialization also currently clears an active run that has no
  attached job or batch.

## Observed production evidence (all 2026-08-11 UTC)

Server: brain runtime `@rizom/brain` v0.2.0-alpha.262, uptime ~66h (booted ~2026-08-08T15:20Z,
**no restart since**). Data dir on server: `/app/brain-data`, git remote
`https://github.com/rizom-ai/rizom-content.git`, branch `main`.

- Auto-export worked normally, committing `Auto-sync: <ISO ts>` roughly every few minutes, **up to
  and including `84443cdc` at 08:36:28Z** (prior one 08:27:03Z).
- **After 08:36:28Z, zero `Auto-sync` commits** — indefinitely. The only later commits are a manual
  one (`94b36371`, 09:49Z) and a manual out-of-band recovery commit I made (`fc7f038a`, 10:51Z).
- A real `system_update` to a note at **10:42:41Z produced NO export commit**.
- `directory_sync` status: `watching: true`, but `lastSync` **frozen at 2026-08-08T15:50:31.212Z**
  (≈ boot). Git working tree **clean, 0 ahead / 0 behind**.
- Dashboard "needs attention": **"The active sync batch could not be recovered after restart."**
- Around 09:57:52Z, four entities had their `updated` timestamps bumped to the **same second** with
  **no content change** — consistent with an import/sync scan re-touching them; likely the tail of a
  bidirectional sync that then crashed mid-batch.
- Recovery attempts that did NOT help: running `directory_sync action:"sync"` twice (each did
  `gitPulled: true`) cleared the active batch (`system_job_status` → 0 active jobs / 0 batches) but
  **export did not resume and `lastSync` did not advance**.

## Already ruled out (don't re-investigate these)

- **Not a content revert / not "one-directional sync overwriting the DB."** DB and git were verified
  byte-identical across all five recently-edited notes. Nothing was reverted to an old ("B.V.")
  version; that earlier theory is false.
- The "update with `content`+`fields` drops content" bug is a **separate** known issue, not this.
- `git status` being clean is expected here — the export never commits, so nothing is left staged.
- Persisted `operationStatus` does not gate auto-commit on current main. `setupGitAutoCommit` uses it
  only to clear/record issues and terminal history after the Git workflow. A stale dashboard run is
  evidence to preserve and reconcile, not the cause of the blocked export.

## Confirmed mechanism and remaining incident checks

1. **Confirmed locally: the serialized git lock deadlocks behind an unresolved Git completion.**
   On current main the lock is `SerialQueue` (`shared/utils/src/serial-queue.ts`), held as
   `private readonly lock = new SerialQueue()` at `git-sync.ts:42` and entered via
   `withLock`/`this.lock.run` at `git-sync.ts:52-56`; there is no `git-lock.ts` /
   `GitOperationLock` on main — cite the alpha.262 tree separately when reproducing against the
   deployed source. The tail promise advances only when the previous operation _settles_. Git can
   exit and be reaped while Bun's completion remains unresolved, leaving every later locked
   operation — including all future export commits — blocked indefinitely. Because the lock is in
   memory, a process restart clears it. CHECK FOR THE PRODUCTION INCIDENT: identify the owning Git
   command from retained logs/status, if available, rather than inferring it solely from the
   matching symptom.

2. **Stale `.git/index.lock`** in `/app/brain-data/.git/` from a crashed/killed git process → every
   commit fails, working tree stays clean, and it **survives restart**. CHECK: does the git layer
   detect/clear a stale `index.lock`, and does an export failure get surfaced or swallowed?

3. **Debounce timer / subscription lost after the crash.** The `commitDebounce` scheduler or the
   `entity:updated` subscription may have been torn down (or its pending flush dropped) when the
   batch crashed, so events no longer trigger commits even though `watching: true`. Verify the
   subscription + debounce lifecycle in `plugin.ts` / `export-pipeline.ts`.

## Use the existing tests as a map

`test/sync-mutex.test.ts`, `test/sync-export-race.test.ts`, `test/sync-without-export.test.ts`,
`test/lifecycle-characterization.test.ts`, `test/sync-status-message.test.ts`,
`test/handlers/directorySyncJobHandler.test.ts`. These encode the intended mutex/lock/lifecycle
behavior — a gap between them and the failure mode above is likely where the bug hides.

## Deliverables

Operational triage precedes code changes, but **restart is not pre-authorized**. Treat the server's
current state as unknown until a new read-only capture proves whether it is still wedged. If it is,
preserve logs, process/child state, active jobs and batches, Git HEAD/status/ahead/behind state,
`.git/index.lock`, runtime/container `StartedAt`, and all DB entities changed since the last known
export. Take a recoverable backup and re-establish current DB↔Git parity; the 10:51Z snapshot is
historical evidence, not a continuing loss-free guarantee. Request explicit restart approval only
after that evidence is reviewed.

1. **Root cause**: the specific current-main file:line and deployed-alpha.262 file:line, with the
   precise mechanism and confirming code path kept distinct.
2. **Regression tests for both failure classes**:
   - A true stalled child may release the serialized queue only after its complete process group is
     killed and reaped; a later export must then commit normally.
   - A lost completion whose process termination cannot be confirmed must keep later Git work
     blocked, surface stale operational health, and recover only through supervised restart plus
     deterministic checkpoint replay. Never `Promise.race` the lock open while an old Git process
     may still mutate the checkout.
3. **Minimal durable fix** that preserves serialization while pinning the first stable Bun release
   containing the upstream fix, storing the repository/branch-scoped
   `lastReconciledGitHead`, replaying a merged-but-not-queued diff on startup, and surfacing an
   over-age `pulling` run through progress-based `/health/operate` degradation. Do not rely on an
   in-process timer to recover the affected Bun 1.3.x event loop.

   Cover every child command that can execute while a serialized Git workflow owns the checkout,
   not only `commitGitChanges` and `resolveLocalConflicts`: status, rev-parse, diff, add, commit,
   show/index inspection, conflict checkout/rm, remote-delete reconciliation, pull, and push.
   Route them through one owned, abortable process abstraction (or an equivalent complete guard)
   after the fixed Bun pin. A timeout may release the queue only after kill-and-reap is confirmed;
   otherwise operational health must fail and the external supervisor must restart the process.
4. **Approval-gated live-recovery runbook**: after the fresh capture, backup, and parity proof,
   request explicit approval to restart the process/container without changing image or config.
   Verify recovery passively first: process `StartedAt`, health, queue/worker state, Git parity, and
   resumed existing export activity. Any active canary edit must be separately approved,
   designated, reversible, and followed by a verified revert; do not make an ad hoc production
   edit merely to prove the restart.

## Constraints

- Preserve the intended serialization (no two git ops racing); don't fix the deadlock by removing the
  lock.
- Don't propose destructive Git recovery (no hard resets / force-push). DB and Git agreed at the
  historical capture; prove fresh parity before claiming that remains true.
- Prefer a fix that turns "silent permanent stall" into "recoverable / self-healing with a surfaced
  error," since the failure mode's worst property is that it's invisible.
- Production restart, watchdog-policy changes, deployment, and active verification edits require
  explicit approval. Read-only evidence capture does not authorize recovery.
