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

1. **The initial sync queues; it does not import.** Directory-sync's `pluginsRegistered` subscriber no longer imports inline. It uses Git reconciliation's pull-and-queue (`pullAndQueue` with `full: true`): it pulls, queues every file as a batch of `directory-import` jobs plus orphan cleanup (`queueSyncBatch`) for the worker, and advances the Git checkpoint once the batch is durable. Every file, not the delta since the checkpoint, so startup still repairs an entity database that lost content (the checkpoint lives in `runtime-state.db`) and retries files whose jobs failed, as the inline sync did; unchanged files are skipped on import. Without Git it queues the same batch from the sync directory. No new job type.
2. **Resumable by construction.** The batch's import jobs persist in the job queue; after a restart the worker claims the remaining jobs, and re-imported files whose entities are canonically unchanged are skipped.
3. **Directory-sync owns its completion.** It answers `pluginsRegistered` with whether an initial sync is pending (`pluginsRegisteredAnswerSchema`), follows its batches through the batch progress the web process publishes on `JOB_CHANNELS.progress` (with a `getBatchStatus` read for a batch that settled before it subscribed), and sends `initialSyncCompleted` when they complete or fail. A batch an earlier boot left unfinished — the operation status's active run — is followed too, so a restart mid-import still waits for it. The run is recorded with source `startup`, so Studio shows the import's progress.
4. **Defaults follow the import, not the boot order.** The shell collects the `pluginsRegistered` answers (`messageBus.collect`), subscribing to `initialSyncCompleted` first so an early completion is not missed. When an initial sync is pending, ready-state defaults (`initializeIdentityServices`, `materializePrompts`) wait for `initialSyncCompleted`, so a content repo's own character, profile and prompts are imported before any default is created. After a failed sync no defaults are created: content it never imported may still be on disk, and a default would be exported over it; the next start syncs again. Directory-sync answers pending when its sync fails, so the shell waits for that failed completion. Otherwise they run at boot as now. The embedding backfill and grouping reprojection stay at boot: both cover what is stored and are harmless while the import adds more.
5. **One signal for defaults.** Once the defaults exist the shell broadcasts `SYSTEM_CHANNELS.startupContentSettled`. Defaults a plugin seeds wait for it: onboarding's bundled playbooks (seeded in `onReady` today) and the profile plugin's starter identity, which otherwise races the shell's identity defaults. Style-guide and site-info already seed on `initialSyncCompleted` and need no change.
6. **The worker creates no defaults.** It loads identity and profile without creating them (`refreshCache`) and follows brain-character and anchor-profile entity events, which its own imports raise; creating defaults there would precede the content's identity, since the worker now runs during the import.
7. **Boot.** The web process starts the early webserver, has the initial sync queued, readies plugins and reports ready. The worker is spawned and claims the import jobs.
8. **While the import runs.** Health is ready; the agent stays behind the existing index-readiness gate; the site builds when the import's entities arrive, as on any content change; Studio shows the import's progress through directory-sync's operation status.

`#476` (durable binary assets) changes how a file is imported; this plan changes when and where the initial import runs. They stay separate PRs and do not touch the same functions.

## Phases

### Phase 1 — Friedrich boots

- tests first: the initial sync queues an import batch and returns without importing; directory-sync reports the pending sync and sends `initialSyncCompleted` when its batch completes or fails; the shell reports ready without awaiting the import and creates defaults only after `initialSyncCompleted` when a sync is pending, at boot otherwise, then broadcasts `startupContentSettled`; onboarding and starter identity seed on it; the worker loads identity without creating defaults
- implementation as above
- local verification on Friedrich's corpus: the web child is ready within the deadline, the worker imports all 3,738 entries, prompts from content are not overwritten by defaults, the site builds
- release; bump the `books` cohort; redeploy `friedrich`; verify `/health/ready`, the horizon, a section page and a cited answer

## Risks

- **Fleet-wide change.** Every brain's boot changes. Small content repos import in one batch, so their behaviour is unchanged apart from ordering; the canary cohort deploys first.
