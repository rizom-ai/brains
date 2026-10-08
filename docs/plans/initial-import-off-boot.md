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

1. **The initial sync queues; it does not import.** Directory-sync's `pluginsRegistered` subscriber no longer imports inline. It runs the path a brain with `initialSync: false` already starts on: Git reconciliation's pull-and-queue (`replayAndQueue`), which pulls and queues the delta as a batch of `directory-import` jobs (`queueSyncBatch`) for the worker, advancing the Git checkpoint once the batch is durable. Without Git it queues the same batch from the sync directory. No new job type.
2. **Resumable by construction.** The batch's import jobs persist in the job queue; after a restart the worker claims the remaining jobs, and re-imported files whose entities are canonically unchanged are skipped.
3. **Directory-sync owns its completion.** It answers `pluginsRegistered` with whether an initial sync is pending, follows its own batch through `getBatchStatus`, and sends `initialSyncCompleted` when the batch completes or fails, from the web process, where the profile plugin already listens for it.
4. **Defaults follow the import, not the boot order.** The shell collects the `pluginsRegistered` responses (`messageBus.collect`). When an initial sync is pending, ready-state defaults (`initializeIdentityServices`, `materializePrompts`), the embedding backfill and grouping reprojection wait for `initialSyncCompleted`, so a content repo's own character, profile and prompts are imported before any default is created; after a failed import they run too, as a failed initial sync lets boot continue today. Otherwise they run at boot as now.
5. **Boot.** The web process starts the early webserver, has the initial sync queued, readies plugins and reports ready. The worker is spawned and claims the import jobs.
6. **While the import runs.** Health is ready; the agent stays behind the existing index-readiness gate; the site builds when the import's entities arrive, as on any content change; Studio shows the import's progress through directory-sync's operation status.

`#476` (durable binary assets) changes how a file is imported; this plan changes when and where the initial import runs. They stay separate PRs and do not touch the same functions.

## Phases

### Phase 1 — Friedrich boots

- tests first: the initial sync queues an import batch and returns without importing; directory-sync reports the pending sync and sends `initialSyncCompleted` when its batch completes or fails; the shell reports ready without awaiting the import and creates defaults, backfill and reprojection only after `initialSyncCompleted` when a sync is pending, at boot otherwise
- implementation as above
- local verification on Friedrich's corpus: the web child is ready within the deadline, the worker imports all 3,738 entries, prompts from content are not overwritten by defaults, the site builds
- release; bump the `books` cohort; redeploy `friedrich`; verify `/health/ready`, the horizon, a section page and a cited answer

## Risks

- **Fleet-wide change.** Every brain's boot changes. Small content repos import in one batch, so their behaviour is unchanged apart from ordering; the canary cohort deploys first.
