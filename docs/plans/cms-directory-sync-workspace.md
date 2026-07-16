# Plan: Optional CMS directory-sync workspace

## Status

**Implemented.** `@brains/directory-sync` registers a Sync workspace when CMS is present.
The workspace provides a sanitized live directory/Git snapshot, one shared manual-sync
action, bounded runtime history, active-run reconciliation, actionable issue badges, and a
Dashboard management link. It remains an operational control surface, not a file editor or
configuration panel.

Interaction reference:
[cms-directory-sync-workspace-mockup.html](../design/cms-directory-sync-workspace-mockup.html).

## Goal

Give operators one place beside authored content to answer five questions:

1. Is the sync directory initialized and being watched?
2. Are the entity database, files, and Git remote currently settled?
3. Is a manual, periodic, or watcher-driven sync active?
4. What failed or was quarantined, and which relative file needs attention?
5. Can I request a normal sync without reaching for CLI or MCP?

The responsibility split is:

- `@brains/directory-sync` owns sync semantics, Git behavior, status projection, safe
  operator data, action validation, and action authorization;
- `@brains/cms` owns authenticated workspace transport, navigation, rendering, query
  invalidation, and active-state polling;
- the existing CMS entity editor continues to own authored content changes;
- the existing CMS save pipeline remains the compact entity DB → file → Git receipt for
  one save;
- Dashboard keeps its compact, read-only Content sync card and may link to this workspace.

## Product language

Register the workspace as:

- ID: `sync`;
- label: **Sync**;
- renderer: `DirectorySyncWorkspace`;
- navigation group: CMS-owned **Operations**;
- priority: `60`, after Publishing (`40`) and Site (`50`).

Use these terms consistently:

- **Content sync** is the workspace title.
- **Sync now** requests the existing normal flow: pull Git when configured, scan files,
  import valid changes, and let existing export/auto-commit behavior settle entity writes.
- **Watching** means the local file watcher is active. It does not imply that a Git remote
  is configured.
- **Remote settled** means the safe Git projection reports no pending local changes and no
  ahead/behind delta at snapshot time. It is not a distributed consistency guarantee.
- **Needs attention** is reserved for actionable failed runs, quarantined files, or an
  unavailable configured source. Brief watcher activity and a normal dirty working tree
  during auto-commit do not earn a badge.

Do not call the action **Backup now**, **Force sync**, or **Deploy**. Current behavior does
not provide backup verification, force-push/reset semantics, or deployment.

## Required optionality

Runtime registration determines availability. The browser must not probe a directory-sync
route or infer the capability from the existing save-pipeline status endpoint.

| Installed plugins          | CMS behavior                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| CMS only                   | Existing entity editor; no Operations group when no provider registers |
| CMS + content pipeline     | Publishing workspace only                                              |
| CMS + site builder         | Site workspace only                                                    |
| CMS + directory-sync       | Sync workspace only                                                    |
| CMS + all three providers  | Publishing, Site, then Sync                                            |
| Directory-sync without CMS | Existing tools, jobs, watcher, messages, and Git automation continue   |

Removing directory-sync removes its descriptor, route target, action, badge, and Dashboard
management link. The CMS must not leave a disabled Sync item or an error panel.

## Current state

- `DirectorySync.getStatus()` already reports the sync path, directory existence, watcher
  state, last in-process sync timestamp, file inventory, and counts by entity type.
- `GitSync.getStatus()` reports repository state, branch, ahead/behind counts, last commit,
  remote, and changed files.
- `directory-sync_sync` requests the normal manual flow. With Git it enqueues a
  `sync-request` job; without Git it enqueues a directory-import batch.
- `sync:status:request` exposes a smaller status projection used by Dashboard and the CMS
  save strip.
- periodic Git pulls, file-watcher imports, event-driven exports, and debounced Git commits
  use separate orchestration paths.
- import results already distinguish imported, skipped, failed, quarantined files, and
  safe per-file errors.
- the job queue can report active jobs and batches, but directory-sync has no bounded,
  domain-shaped run history that joins those paths.
- Git pull conflicts are currently auto-resolved with the remote version winning. There is
  no unresolved-conflict workflow for a CMS to operate.
- the shared CMS renderer vocabulary currently accepts only `PublishingWorkspace` and
  `SiteWorkspace`.

A UI built directly on `getStatus()` would overstate `lastSync`, miss several automatic
paths, and lose terminal errors. The operational projection is therefore a prerequisite,
not optional UI polish.

## Architecture decisions

### 1. Keep the workspace contract narrow

Extend the first-party renderer vocabulary in `@brains/plugins` with exactly one new name:

```ts
export type CmsWorkspaceRendererName =
  "PublishingWorkspace" | "SiteWorkspace" | "DirectorySyncWorkspace";
```

Update the CMS registry Zod schema and browser descriptor union in lockstep. Continue to
reject arbitrary runtime React components. This is a third concrete first-party renderer,
not a general browser-plugin mechanism.

Directory-sync sends its registration from `onReady`; CMS already subscribes during
`onRegister`. A missing CMS handler remains a normal no-op.

### 2. Add a directory-sync-owned browser-safe snapshot

Define and Zod-validate the snapshot inside `@brains/directory-sync`:

```ts
interface DirectorySyncWorkspaceSnapshot {
  health: "healthy" | "active" | "attention";
  directory: {
    displayPath: string;
    exists: boolean;
    watching: boolean;
    totalFiles: number;
    byEntityType: Record<string, number>;
    lastSettledAt?: string;
  };
  git: null | {
    branch: string;
    remoteLabel?: string;
    hasChanges: boolean;
    ahead: number;
    behind: number;
    lastCommit?: string;
    changedFiles: Array<{
      path: string;
      status: string;
    }>;
  };
  automation: {
    autoSync: boolean;
    watchIntervalMs: number;
    remoteIntervalMinutes?: number;
    commitDebounceMs?: number;
    deleteOnFileRemoval: boolean;
  };
  activeRun?: {
    id: string;
    source: "manual" | "periodic" | "watcher" | "save";
    state: "pulling" | "scanning" | "importing" | "settling";
    startedAt: string;
    jobId?: string;
    batchId?: string;
  };
  recentRuns: Array<{
    id: string;
    source: "manual" | "periodic" | "watcher" | "save";
    outcome: "succeeded" | "attention" | "failed";
    startedAt: string;
    completedAt: string;
    imported: number;
    skipped: number;
    failed: number;
    quarantined: number;
    exported: number;
    summary: string;
  }>;
  issues: Array<{
    kind: "quarantined" | "import" | "export" | "git" | "source";
    path?: string;
    message: string;
    occurredAt: string;
  }>;
}
```

The exact implementation may split this into smaller schemas, but the serialized shape
must remain strict and operator-safe.

Security rules:

- expose relative content paths, not unrestricted absolute host paths;
- derive a safe remote label such as `owner/repo` or a non-secret host label;
- never serialize auth tokens, credential-bearing URLs, environment values, stack traces,
  raw command output, or arbitrary exception objects;
- cap changed files, issues, and recent runs; return totals when truncating;
- sanitize errors at the provider boundary even when internal logs retain more detail.

### 3. Introduce one operational status service

Add a directory-sync status service backed by the plugin-scoped `runtimeState` namespace.
The state is disposable operational history, not durable authored content, so it must not
become an entity or a Markdown file.

The service should:

- record active run identity, source, phase, and job/batch references;
- aggregate import/export/quarantine counts for one logical run;
- retain at most five terminal runs and a small bounded issue list;
- clear an issue when a later successful operation proves that condition resolved;
- reconcile stored job and batch references through `context.jobs` after restart;
- clear stale pre-enqueue activity rather than claiming a sync is still running;
- combine that operational state with live `DirectorySync.getStatus()` and
  `GitSync.getStatus()` for the workspace snapshot.

Wire the projection into all relevant paths rather than treating only CMS actions as runs:

- manual tool/CMS requests;
- periodic Git sync;
- watcher-triggered imports;
- import and export job terminal results;
- event-driven export failures;
- debounced Git commit/push success or failure.

Keep normal high-frequency save activity compact. It may produce one grouped `save` run,
not one permanent history item per entity event.

Do not use the generic job table itself as the browser contract. Job state remains the
execution authority; the directory-sync projection gives it domain meaning and bounds the
safe payload.

### 4. Share manual-sync orchestration

Extract the current manual request logic from `createDirectorySyncTools()` into a small
service/function owned by directory-sync. Both the existing tool and CMS action call it.
It must preserve current semantics:

- with Git, enqueue `sync-request` so pull occurs under the existing Git lock before the
  import batch is queued;
- without Git, enqueue the existing directory sync batch;
- preserve routing metadata for tool callers;
- return a domain result with a run ID and optional job/batch reference;
- report no-work as a successful settled result;
- do not implement force push, hard reset, or a second pull algorithm.

The first slice exposes one action:

```ts
type DirectorySyncWorkspaceAction = { type: "sync-now" };
```

The provider validates it with Zod and requires `anchor` permission. The result is an
accepted/settled receipt; the browser refetches the workspace for progress and terminal
state.

Repeated requests retain existing behavior unless characterization tests justify a shared
in-flight deduplication change. The UI disables its button while the snapshot reports an
active run, but it is not the global concurrency authority.

### 5. Make attention derived and actionable

Derive the navigation badge from unresolved snapshot issues, not from all Git changes.

Attention-worthy examples:

- an import/export job failed;
- one or more files were quarantined;
- a configured Git operation failed or stalled;
- the configured sync directory is unavailable;
- the watcher was expected but failed to start.

Informational examples that do not earn a badge:

- local changes are waiting for the normal commit debounce;
- a periodic or manual sync is active;
- the branch is briefly ahead while push settles;
- remote-wins conflict resolution completed successfully.

The workspace may explain a quarantined relative file and safe validation message, but it
does not edit invalid files in place. The operator repairs/restores the file outside the
CMS, then uses Sync now.

### 6. Keep configuration read-only

The first workspace shows useful facts only:

- display directory;
- watcher on/off;
- branch and safe remote label;
- periodic pull interval;
- commit debounce;
- deletion policy;
- entity-type coverage.

Do not edit `syncPath`, remote URLs, auth, branch, intervals, seed content, or deletion
policy in this slice. Those values remain application configuration. Reconfiguration has
lifecycle and credential implications that deserve a separate plan.

### 7. Add a CMS-owned renderer and targeted polling

Add `DirectorySyncWorkspace` to the existing CMS React bundle. The component contains:

- workspace health and last-settled state;
- entity DB → files → Git flow;
- file/type/branch/remote summary;
- **Sync now**;
- active run state without invented percentage progress;
- five recent runs;
- actionable issue details;
- read-only automation, source, and entity coverage facts.

Extend the typed API unions, mutation wrappers, renderer dispatch, tests, and responsive
CSS. Reuse `cmsKeys.workspace("sync")`; after the action, invalidate only that workspace
query plus `cmsKeys.syncStatus()` because the editor save strip consumes the smaller status
projection.

Poll the Sync workspace while `activeRun` exists, using the same targeted one-second
pattern as Site. Stop when the snapshot settles. Generalize active-workspace polling only
as far as the three first-party snapshot predicates require.

On tablet and phone, Sync joins the existing horizontal destination switcher. Lead with
health, the three-stage flow, summary, and a touch-sized action; place history and facts
below it.

### 8. Preserve the existing Dashboard glance

Dashboard already renders a read-only **Content sync** card from
`sync:status:request`. Do not add a duplicate widget.

After CMS registration returns a workspace URL, directory-sync may include the resolved
management URL in its backward-compatible status response. Dashboard can render
**Manage in CMS →** when present and omit it when CMS is absent.

The richer workspace snapshot should become the source for any new health/attention facts,
but the existing compact status fields must remain compatible for Dashboard and the CMS
save strip.

## Product shape

### Desktop

- Header: **Content sync**, health, and last settled time.
- Vitals: file count, entity-type count, branch, and remote delta/issue count.
- Flow: Entity DB → `brain-data` → Git remote, followed by **Sync now**.
- Main column: active run, then five recent runs.
- Aside: unresolved attention, automation facts, source facts, and largest synced entity
  types.

### Mobile

- Existing horizontal CMS destination switcher.
- Health summary before inventory.
- Compact DB → Files → Git flow.
- Touch-sized **Sync now** action.
- Recent runs before read-only facts.
- Relative paths wrap safely; controls do not require horizontal page scrolling.

### Empty and degraded states

- No Git configured: show DB → Files, label the source **Local only**, and keep Sync now as
  a filesystem scan/import action.
- Empty directory: show zero files without treating a valid initialized directory as a
  failure.
- Missing directory: show attention and a safe source message.
- Watcher off by configuration: show **Manual**, not a failure.
- Snapshot provider failure: use the existing workspace error boundary without leaking the
  raw exception.
- Directory-sync absent: remove the Sync destination entirely.

## Implementation phases

### Phase 1 — Characterize current orchestration

1. Pin manual tool behavior with and without Git, including no-work results.
2. Pin periodic pull, watcher batch, event export, auto-commit/push, quarantine, and failure
   behavior.
3. Document which current timestamps are updated by each path.
4. Add serialization tests proving Git status does not expose auth tokens.

Gate: status work can be added without silently changing sync, conflict, or commit policy.

### Phase 2 — Canonical operational projection

1. Define Zod schemas for runs, issues, actions, and the browser-safe snapshot.
2. Add the runtime-state-backed status service with bounded records.
3. Connect manual, periodic, watcher, job, event-export, and Git auto-commit transitions.
4. Reconcile active job/batch references after restart.
5. Add healthy, active, attention, no-Git, missing-directory, and restart tests.

Gate: tools and automatic paths produce one truthful snapshot without CMS installed.

### Phase 3 — Shared action and provider registration

1. Extract manual sync request orchestration from the tool handler.
2. Keep the tool on the shared path and preserve its result language/metadata.
3. Add `DirectorySyncWorkspaceProvider` with snapshot and Zod-validated action handling.
4. Require anchor permission for Sync now.
5. Register `sync` during directory-sync `onReady` and retain the returned workspace URL.
6. Test absent CMS as a non-fatal result.

Gate: a test CMS registration receives a safe snapshot and can request the same sync path
as the tool.

### Phase 4 — Shared contract and CMS renderer

1. Add `DirectorySyncWorkspace` to the shared renderer union and CMS registry schema.
2. Extend CMS browser API data/action unions.
3. Render Sync under Operations at priority 60.
4. Add health, flow, action, active run, recent runs, attention, facts, and empty states.
5. Add targeted invalidation and polling only while active.
6. Add tablet/phone layouts and attention badge behavior.
7. Test zero, one, two, and three workspace providers in different startup orders.

Gate: direct reload of `#/workspace/sync` works, manual sync settles without a full app
refresh, and other workspaces remain independent.

### Phase 5 — Dashboard and documentation polish

1. Add the optional CMS management URL to the existing sync status response.
2. Link the existing Dashboard Content sync card when the URL is present.
3. Keep Dashboard read-only and useful without CMS.
4. Update directory-sync and CMS documentation with product language and optionality.
5. Add package changesets.

Gate: Dashboard remains a glance, CMS is the workbench, and no surface hard-codes `/cms`.

### Phase 6 — Application verification

1. Start the full Rover app with `cd brains/rover && bun start:full`.
2. Open the registered Sync workspace through its returned CMS URL.
3. Exercise no-op, local file edit, entity save/export/commit, remote pull/import, quarantine,
   failed Git operation, and recovery.
4. Verify workspace, Dashboard card, CMS save strip, tools, files, Git status, and jobs agree.
5. Restart during an active referenced job/batch and verify reconciliation.
6. Verify CMS without directory-sync and directory-sync without CMS.

Gate: every supported composition has useful behavior and no dormant controls.

## Validation

Targeted checks:

- `bun run --filter @brains/plugins typecheck`
- `bun run --filter @brains/plugins test`
- `bun run --filter @brains/directory-sync typecheck`
- `bun run --filter @brains/directory-sync test`
- `bun run --filter @brains/cms build:ui`
- `bun run --filter @brains/cms typecheck`
- `bun run --filter @brains/cms test`
- `bun run --filter @brains/dashboard typecheck`
- `bun run --filter @brains/dashboard test`
- `bun scripts/lint.mjs --force --filter @brains/plugins --filter @brains/directory-sync --filter @brains/cms --filter @brains/dashboard`
- `bun run docs:check`

Application checks:

- CMS-only: no Operations group unless another provider registers;
- all providers: Publishing, Site, Sync ordering is deterministic;
- local-only directory-sync: no empty Git card or remote-only language;
- manual Sync now uses the same request path as the tool;
- active state polls and stops after terminal settlement;
- quarantined and failed files produce safe, actionable attention;
- normal auto-commit debounce does not produce a false attention badge;
- no response contains auth tokens, credential-bearing URLs, stack traces, or unrestricted
  absolute paths;
- removing directory-sync removes the workspace and Dashboard link while ordinary CMS
  editing remains intact.

## Risks and mitigations

- **The workspace lies about convergence:** use precise snapshot language and avoid a broad
  “fully synced” guarantee; distinguish local watcher, working tree, and remote delta.
- **Only CMS-triggered runs are visible:** instrument the shared orchestration paths before
  adding the renderer.
- **Status history becomes durable content:** keep it bounded in runtime state, never in
  entities or the synced directory.
- **Credentials leak through Git status:** shape and sanitize the browser payload; expose a
  derived remote label only.
- **CMS duplicates sync behavior:** share the existing manual request path; CMS never calls
  Git or enqueues low-level import jobs directly.
- **Dashboard becomes a second control panel:** retain its read-only card and link to CMS.
- **Attention becomes noisy:** badge only unresolved actionable failures, not normal dirty
  or active states.
- **Generic workspace contract expands too far:** add one concrete CMS-owned renderer name,
  not arbitrary browser components.
- **Restart leaves stale activity:** persist references and reconcile through the jobs
  namespace; clear unrecoverable pre-enqueue state.

## Non-goals

- Editing Markdown or quarantined files in the workspace.
- A general filesystem browser.
- Git diff, commit history, restore, reset, rebase, force-push, or branch management.
- Editing sync/Git configuration or credentials.
- A dry-run action before a canonical diff/plan model exists.
- Exact percentage progress when current operations only expose lifecycle/batch facts.
- Replacing the entity editor save pipeline.
- Adding duplicate sync controls to Dashboard.
- Changing the current remote-wins Git conflict policy in this feature.

## Success criteria

- Sync appears automatically only when CMS and directory-sync are both installed.
- Publishing, Site, and Sync coexist as independent optional workspaces.
- Manual CMS sync uses the same orchestration as the existing tool.
- Automatic and manual paths feed one directory-sync-owned operational snapshot.
- Operators can identify watcher, directory, branch, remote, active-run, quarantine, and
  recent-run state without seeing secrets or internal stack traces.
- The navigation badge represents unresolved actionable attention only.
- Dashboard remains read-only and links to the configured CMS workspace only when the
  registration URL is available.
- Removing either optional plugin leaves the remaining behavior intact.
