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
- `GitOperationLock` makes that unresolved operation globally significant: its promise-tail turn is
  released only when the callback settles, so later pull, push, commit, and auto-export operations
  queue forever behind it. This exactly explains why only a process restart restores export.
- Node `child_process`, Worker isolation, file sentinels, synchronous filesystem inspection, and
  persistent timer polling were not reliable workarounds inside the affected Bun event loop. Do
  not ship them.
- Bun issue `oven-sh/bun#26580` was reproduced upstream on 1.3.14 and verified fixed on current
  main. With the original Git runner restored, isolated Bun `1.4.0-canary.1+da3851e57` passed three
  consecutive persistence-gated 350-file soaks in 193.63, 193.69, and 193.95 seconds. Production
  remains on Bun 1.3.11; no canary was committed or deployed.
- The production evidence is consistent with a pull holding the shared lock, but it does not prove
  which Git command wedged or exclude the remaining incident-specific checks below.

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
- All git operations are serialized by `GitOperationLock` in `src/lib/git-lock.ts`, invoked via
  `src/lib/git-sync.ts:49` (`this.lock.run(fn, signal)`).
- Restart recovery + the dashboard error live in `src/lib/directory-sync-operation-status.ts`:
  `reconcile()` (line 339); the string **"The active sync batch could not be recovered after
  restart"** is emitted at line 392 (`failRun`, which deletes `activeRun` at line 311). A sibling
  string "…job could not be found after restart" is at line 351.

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

## Confirmed mechanism and remaining incident checks

1. **Confirmed locally: `GitOperationLock` deadlocks behind an unresolved Git completion.**
   `git-lock.ts` chains every operation onto an in-memory `this.queue` promise; the
   `finally { release() }` runs only if `fn` settles. Git can exit and be reaped while Bun's
   completion remains unresolved, leaving every later `git-sync.ts:49` `this.lock.run(...)` —
   including all future export commits — blocked indefinitely. Because the lock is in memory, a
   process restart clears it. CHECK FOR THE PRODUCTION INCIDENT: identify the owning Git command
   from retained logs/status, if available, rather than inferring it solely from the matching
   symptom.

2. **Stale `.git/index.lock`** in `/app/brain-data/.git/` from a crashed/killed git process → every
   commit fails, working tree stays clean, and it **survives restart**. CHECK: does the git layer
   detect/clear a stale `index.lock`, and does an export failure get surfaced or swallowed?

3. **Stuck persisted `operationStatus` / `activeRun` gating the auto-commit.** `setupGitAutoCommit`
   receives `operationStatus`. If the export path is suppressed while an issue/`activeRun` is
   outstanding, or `reconcile()` leaves state that blocks new runs, exports stay off. Trace whether
   `reconcile()`'s `failRun` fully clears the blocking state and whether auto-commit checks it.

4. **Debounce timer / subscription lost after the crash.** The `commitDebounce` scheduler or the
   `entity:updated` subscription may have been torn down (or its pending flush dropped) when the
   batch crashed, so events no longer trigger commits even though `watching: true`. Verify the
   subscription + debounce lifecycle in `plugin.ts` / `export-pipeline.ts`.

## Use the existing tests as a map

`test/sync-mutex.test.ts`, `test/sync-export-race.test.ts`, `test/sync-without-export.test.ts`,
`test/lifecycle-characterization.test.ts`, `test/sync-status-message.test.ts`,
`test/handlers/directorySyncJobHandler.test.ts`. These encode the intended mutex/lock/lifecycle
behavior — a gap between them and the failure mode above is likely where the bug hides.

## Deliverables

1. **Root cause**: the specific file:line and the precise mechanism, with the confirming code path.
2. **A failing regression test** that reproduces it (e.g., a git op that never settles, asserting a
   later export still commits / the lock doesn't deadlock; or a stale-lock scenario).
3. **Minimal durable fix** that preserves serialization while pinning the first stable Bun release
   containing the upstream fix, checkpointing `lastEnqueuedGitHead`, replaying a merged-but-not-
   queued diff on startup, and surfacing an over-age `pulling` run through `/health/operate` to the
   external watchdog. Do not rely on an in-process timer to recover the affected event loop.
4. **Safe live-recovery runbook** for the current wedged server: what to check (stale
   `/app/brain-data/.git/index.lock`?), and confirm that restarting the brain process /
   directory-sync plugin clears the in-memory lock. NOTE: the live DB is the source of truth and is
   **currently consistent with git** (both contain `fc7f038a`'s content), so a restart risks no data
   loss. After recovery, verify by making a trivial edit and confirming an `Auto-sync` commit appears
   and `lastSync` advances.

## Constraints

- Preserve the intended serialization (no two git ops racing); don't fix the deadlock by removing the
  lock.
- Don't propose destructive git recovery (no hard resets / force-push); DB and git already agree.
- Prefer a fix that turns "silent permanent stall" into "recoverable / self-healing with a surfaced
  error," since the failure mode's worst property is that it's invisible.
