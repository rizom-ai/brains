# Plan: Initial import off the boot path

## Status

Proposed.

## Problem

A brain's web process imports its whole content repo before it reports ready. `ShellBootloader` awaits `pluginsRegistered`, whose directory-sync subscriber runs the initial sync inline: a Git pull, then `importEntitiesUnbatched` over every file, then a push and checkpoint. Only after that come the embedding backfill, grouping reprojection, ready-state defaults and plugin readiness.

The supervisor gives the web child 30 seconds to report `runtime-ready`. Every brain so far fitted. `friedrich` (3,738 book entries) does not: on its 2-vCPU host the web child runs the import at 98% CPU, misses the deadline, is killed, and the container restarts and starts the import again. The worker is only spawned after the web child is ready, so no job ever runs; the site is never built and the proxy answers 502 between restarts.

Raising or extending the deadline would let the import finish but leaves corpus-sized, CPU-bound work in the process that serves requests, and an import that restarts from nothing after any kill.

## Goal

Boot time does not depend on content size. The web process reports ready within seconds; the initial import runs on the worker as durable, batched work that resumes after a restart; the 30-second deadline keeps meaning "this process is stuck".

## Design

1. **The initial sync is a worker job.** Directory-sync's `pluginsRegistered` subscriber no longer runs the sync. It enqueues one deduplicated `directory-initial-sync` job. The job runs the same steps on the worker: Git pull, then the import through the existing batched path (`importEntitiesWithProgress`, as the `directory-import` job does), then push and checkpoint, then `initialSyncCompleted`.
2. **Resumable by construction.** Each batch persists before the next; a retried job skips files whose entities are canonically unchanged, so a restart continues where the import stopped.
3. **Defaults follow the import, not the boot order.** Ready-state defaults (`initializeIdentityServices`, `materializePrompts`), the embedding backfill and grouping reprojection run when the initial sync job finishes, so a content repo's own character, profile and prompts are imported before any default is created. The job runs on the worker while these belong to the web process; the two share only the job-queue database, so the web process keeps the job's id and a forked task follows `jobQueueService.getStatus` until the job completes or fails, then runs them. They run after a failed import too, as a failed initial sync lets boot continue today. A brain without an initial sync runs them at boot as now.
4. **Boot.** The web process starts the early webserver, enqueues the initial sync, readies plugins and reports ready. The worker is spawned and claims the job.
5. **While the import runs.** Health is ready; the agent stays behind the existing index-readiness gate; the site builds when the import's entities arrive, as on any content change; Studio shows the import's progress through directory-sync's operation status.

`#476` (durable binary assets) changes how a file is imported; this plan changes when and where the initial import runs. They stay separate PRs and do not touch the same functions.

## Phases

### Phase 1 — Friedrich boots

- tests first: boot reports ready without awaiting the import; the initial sync is enqueued once, runs on the worker, resumes after an interrupted run, and emits `initialSyncCompleted`; defaults are created after completion and not before
- implementation as above
- local verification on Friedrich's corpus: the web child is ready within the deadline, the worker imports all 3,738 entries, prompts from content are not overwritten by defaults, the site builds
- release; bump the `books` cohort; redeploy `friedrich`; verify `/health/ready`, the horizon, a section page and a cited answer

## Risks

- **Fleet-wide change.** Every brain's boot changes. Small content repos import in one batch, so their behaviour is unchanged apart from ordering; the canary cohort deploys first.
