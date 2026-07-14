# Plan: Optional CMS publishing workspace

## Status

**Implemented.** Publication-pipeline operation is available in CMS only when
`@brains/content-pipeline` registers the capability. Queue intent and ordering are
reconciled durably, confirmed direct publishing is content-hash protected, and Dashboard
now renders a compact read-only digest. CMS-only optionality is covered by route and UI
tests; the combined composition was verified in the full Rover test app. The shared
workspace boundary also supports the concrete second provider planned in
[cms-site-workspace.md](./cms-site-workspace.md).

## Goal

Give operators one authoring-and-publishing workflow without making the generic CMS own
publishing behavior.

The intended responsibility split is:

- `@brains/content-pipeline` owns publication state, queue semantics, scheduling, retries,
  provider execution, and action authorization;
- `@brains/cms` optionally hosts a registered publishing workspace and contextual entity
  actions;
- `@brains/dashboard` reports publishing health and attention counts, but does not manage
  the queue.

## Required optionality

`@brains/cms` must not depend on `@brains/content-pipeline` being installed or running.
Optionality is determined by runtime registration, not by probing hard-coded routes or
catching failed publish requests in the browser.

| Installed plugins      | CMS behavior                                                         | Dashboard behavior                               |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| CMS only               | Normal entity browsing and editing; no pipeline workspace or actions | No publication-pipeline widget                   |
| Content pipeline only  | Existing tools, messages, scheduler, and providers continue to work  | Compact publication digest when Dashboard exists |
| CMS + content pipeline | Publishing workspace and contextual actions appear automatically     | Compact digest links to the CMS workspace        |
| Neither                | No publishing UI                                                     | No publication-pipeline widget                   |

The CMS may still render schema-backed fields such as `status`; those fields are entity
content. Queue, retry, schedule, and provider actions appear only when the pipeline
capability registers them.

## Current state

- The content-pipeline plugin registers a Dashboard `PipelineWidget` and the Dashboard
  renders a three-lane Queued / Generating / Review board.
- The CMS is a first-party React editor with typed browser APIs, but it has no plugin
  workspace/action registry.
- The CMS can edit publication-shaped frontmatter because forms are schema-derived, but it
  does not call pipeline queue, reorder, retry, or direct-publish operations.
- Pipeline state is split between in-memory `QueueManager` entries, entity status metadata,
  retry tracking, and active jobs. The Dashboard widget scans entity statuses rather than
  reading one canonical operational snapshot.
- Queue ordering and retry details are not durable enough to serve as an authoritative
  operator-management surface.

A UI move before consolidating this state would expose disagreement between the CMS queue,
the scheduler, and the Dashboard.

## Architecture decisions

### 1. Capability registration, not a CMS-to-pipeline dependency

Add a framework contract for optional CMS workspaces and entity actions through the
`@brains/plugins` import surface. Follow the existing Dashboard registration pattern:

```ts
interface CmsWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName: string;
  priority: number;
  dataProvider: (request: unknown) => Promise<unknown>;
  actionHandler?: (request: unknown, actor: CmsActor) => Promise<unknown>;
}
```

The exact contract remains narrow and Zod-validated. Publishing and Site are now two
concrete providers, so the boundary supports multiple registrations without becoming a
general browser-plugin system. The generic boundary exists so CMS does not import or own
provider behavior. A visibility enum remains omitted until a real non-operator workspace
exists. The contract must support:

- a workspace identifier and CMS-owned renderer name;
- deterministic `priority`, then `id` ordering independent of startup order;
- duplicate-ID rejection rather than silent provider replacement;
- server-side data and action handlers;
- optional entity-type applicability for contextual editor actions;
- serializable workspace descriptors for CMS navigation;
- a registration response containing the resolved workspace URL, so callers do not
  hard-code `/cms` or a configured CMS route path.

The CMS subscribes to `cms:register-workspace` during plugin registration. The content
pipeline sends its registration during its ready phase. No CMS handler is a valid,
non-fatal outcome; pipeline startup must continue unchanged.

Do not pass arbitrary React components to the browser. Unlike the server-rendered
Dashboard, the CMS has a prebuilt client bundle. The CMS owns a small renderer vocabulary
and receives serializable data from registered providers.

### 2. CMS-owned transport, provider-owned behavior

The CMS exposes authenticated generic routes:

- `GET <cms-route>/api/workspaces` for ordered serializable descriptors;
- `GET <cms-route>/api/workspaces/:id`;
- `POST <cms-route>/api/workspaces/:id/actions`.

The CMS navigation renders from the descriptor list. State management uses
`cmsKeys.workspaces` for registration descriptors and `cmsKeys.workspace(workspaceId)` for
provider data. Both queries remain transport state; the server-side registry and provider
snapshots own the domain state.

Routes resolve a registered provider and call its server-side functions. They do not know
about `QueueManager`, publish providers, or content-pipeline message names.

Every action route:

- requires an active operator session;
- derives the actor and `anchor` permission context on the server rather than trusting the
  browser payload;
- validates the workspace action with Zod;
- delegates permission checks and mutation semantics to the owning provider;
- returns typed errors for stale content, invalid transitions, and unavailable providers.

Direct external publication retains an explicit confirmation step and content-hash
precondition. The CMS must not bypass the confirmation protection currently used by the
publish tool or duplicate provider execution logic.

### 3. One canonical pipeline snapshot

Expose a content-pipeline-owned projection consumed by both CMS and Dashboard:

```ts
interface PublicationPipelineSnapshot {
  summary: {
    draft: number;
    queued: number;
    generating: number;
    failed: number;
    published: number;
    needsOperator: number;
  };
  queue: PublicationQueueItem[];
  generating: PublicationJobItem[];
  failures: PublicationFailureItem[];
  publishableEntityTypes: string[];
}
```

Only entity types registered with the pipeline are included. The snapshot joins durable
entity state with active job and provider state; surfaces must not independently rescan all
entity types and reinterpret arbitrary `status` fields.

Use a hybrid source of truth:

- entity `status` is authoritative for durable publication intent and lifecycle
  (`draft` / `queued` / `failed` / `published`);
- namespaced `runtimeState` records own recoverable queue mechanics such as rank,
  `queuedAt`, enqueue content hash, actor context, and mutation revision;
- the in-memory queue is only an execution projection rebuilt by reconciling both stores.

This keeps queue membership recoverable from entities without writing every reorder into
Markdown or producing noisy Git commits. Losing disposable runtime state loses custom
ordering, not publication intent; reconciliation recreates missing records and removes
orphans deterministically.

Pipeline mutations maintain the stores consistently:

- queue: validate publish permission, persist `status: queued`, then create the operational
  queue record and refresh the execution projection;
- remove: return the entity to the appropriate non-queued state, remove its runtime record,
  and refresh execution order;
- reorder: mutate runtime rank/revision only; do not rewrite entity content;
- failure: persist failed entity state and operator-safe error information, then remove the
  queue record;
- retry: perform a validated failed-to-queued transition and create a fresh queue record;
- success: keep the existing centralized published-state update and remove operational
  queue state.

No permanent reorder audit log is required in the first slice. If audit history becomes a
requirement, append mutation events to the operator audit store rather than treating
content Git history as an operations log.

Characterization tests must pin current scheduler and restart behavior before this change.
This plan does not silently introduce new delivery guarantees for external providers.

### 4. CMS product shape

When registered, the CMS adds a **Publishing** workspace to its local navigation. It is
addressable through the CMS URL so Dashboard and console-jump links can open it directly.

The first workspace includes:

- compact status totals;
- ordered queue with move earlier/later controls;
- active generation jobs as read-only progress;
- failed items with error details and retry actions;
- links from every item to its normal CMS entity editor.

Publishable entity editors gain contextual actions supplied by the same registration:

- add to queue;
- remove from queue;
- retry a failed publication;
- publish now, with explicit confirmation.

Do not turn the editor save bar into a second queue manager. Its existing entity DB → file
→ git strip describes save persistence and remains distinct from publication state.

### 5. Dashboard simplification

The content pipeline continues to register a Dashboard widget only when it is installed.
Replace the three-lane management board with a compact read-only card showing:

- queued;
- generating;
- awaiting review / failed;
- published total;
- at most a short list of current failures requiring attention.

The existing Overview digest and operator badge derive from the same canonical snapshot.
When CMS workspace registration returned a URL, render **Manage in CMS →**. When CMS is
absent, omit the link; the compact digest remains useful and tools/chat remain the
management path.

No queue mutation, drag-and-drop, retry, or direct-publish controls belong on Dashboard.

## Implementation phases

### Phase 1 — Characterize and consolidate pipeline state

1. Add tests covering queue/add/remove/reorder, scheduler consumption, failure, success, and
   restart reconstruction.
2. Define the Zod schemas for the canonical snapshot and pipeline actions inside
   `@brains/content-pipeline`.
3. Make registered publishable types, not arbitrary status-bearing entities, the snapshot
   boundary.
4. Persist publication intent through entity status and queue ordering through a
   Zod-validated `content-pipeline.queue.v1` runtime-state namespace.
5. Reconcile those stores at startup and make `QueueManager` their execution projection.
6. Switch the existing Dashboard data provider to the canonical snapshot without changing
   its rendering yet.

Gate: scheduler, tools, messages, and restart tests agree with snapshot queue order and
status; no surface computes its own conflicting pipeline counts.

### Phase 2 — Generic optional CMS workspace contract

1. Add shared registration types through `@brains/plugins` and a CMS-local registry.
2. Support deterministic priority ordering and reject duplicate workspace IDs.
3. Subscribe during CMS registration so later plugin ready hooks can register workspaces.
4. Add authenticated generic list/data/action routes with Zod validation.
5. Return the configured CMS workspace URL from successful registration.
6. Test CMS startup and every existing editor route with no workspace registrations.
7. Test zero, one, and two providers in both startup orders.
8. Test absent-CMS registration as a non-fatal content-pipeline startup path.

Gate: a CMS-only brain is behaviorally unchanged, and Publishing plus a test Site provider
can coexist without CMS importing either provider package.

### Phase 3 — Publishing workspace and entity actions

1. Register the publishing capability from `@brains/content-pipeline`.
2. Add the CMS-owned publishing workspace renderer and typed API client methods.
3. Add queue ordering, remove, retry, and editor deep links.
4. Add contextual actions only for entity types reported as publishable.
5. Reuse the publish executor's candidate validation and implement a two-step confirmed
   publish action with content-hash protection.
6. Integrate workspace reads and mutations with the CMS query/reducer conventions from
   `operator-surface-state-management.md`; the client cache is never the domain owner.

Gate: CMS + content-pipeline supports the complete queue workflow; CMS without
content-pipeline shows no dormant navigation or action controls.

### Phase 4 — Simplify Dashboard

1. Replace the three-lane `PipelineWidget` body with the compact digest card.
2. Keep Overview digest lines and `needsOperator` counts derived from the canonical
   snapshot.
3. Render the CMS management link only when registration returned a workspace URL.
4. Remove obsolete board CSS, schemas, scripts, fixtures, and tests.
5. Preserve a useful no-CMS state with counts and no broken link.

Gate: Dashboard is read-only, compact, and accurate in both CMS-present and CMS-absent
compositions.

### Phase 5 — Application verification and release

1. Start the full Rover test app with its preset script.
2. Verify CMS-only and CMS + content-pipeline compositions.
3. Exercise create/edit → queue → reorder → publish/fail → retry from the running app.
4. Verify Dashboard digest values against the CMS workspace after each transition.
5. Add package changesets and update operator documentation for the new workspace.

Gate: both compositions are verified end-to-end from the running app; every transition
shows the same state in tools, CMS, and Dashboard; changesets and documentation landed.

## Validation

Targeted checks:

- `bun run --filter @brains/content-pipeline typecheck`
- `bun run --filter @brains/content-pipeline test`
- `bun run --filter @brains/cms typecheck`
- `bun run --filter @brains/cms test`
- `bun run --filter @brains/dashboard typecheck`
- `bun run --filter @brains/dashboard test`
- `bun scripts/lint.mjs --force --filter @brains/content-pipeline --filter @brains/cms --filter @brains/dashboard`
  (from repo root — per-package `bun run lint` fails under TS7)
- `bun run docs:check`

Application checks:

- CMS starts and edits normally with content-pipeline omitted;
- adding content-pipeline makes the Publishing workspace appear without additional CMS
  configuration;
- removing content-pipeline removes all pipeline-specific CMS navigation and actions;
- Dashboard omits the publication widget when content-pipeline is absent;
- Dashboard shows a compact unlinked digest when CMS is absent;
- Dashboard links to the configured CMS workspace when both are present.

## Risks and mitigations

- **CMS becomes coupled to one domain plugin:** keep the registry and HTTP routes generic;
  put pipeline schemas and behavior in content-pipeline.
- **Client-bundle plugin loading becomes unsafe or brittle:** use CMS-owned renderer names,
  not arbitrary runtime React components.
- **Queue intent and runtime order drift:** entity status wins membership conflicts;
  startup reconciliation repairs missing runtime records, removes orphans, and hydrates one
  execution projection consumed by all surfaces.
- **Browser action bypasses publish confirmation:** require server-issued confirmation data
  tied to entity content hash and expiry.
- **Plugin startup order drops registration:** subscribe in CMS `onRegister`, send from
  content-pipeline `onReady`, and cover plugin-order permutations.
- **Configured CMS paths produce broken links:** return the resolved workspace URL from the
  registration handler; never hard-code `/cms` in content-pipeline.
- **CMS save pipeline is confused with publication pipeline:** preserve separate labels,
  components, and state models.

## Non-goals

- Making content-pipeline a required CMS dependency.
- Moving provider, scheduler, retry, or queue implementation into CMS.
- Adding publication controls to Dashboard.
- Combining Dashboard and CMS into one SPA.
- Loading third-party browser code through workspace registration in the first version.
- Changing external-provider delivery guarantees as an undocumented side effect.
- Making CMS configuration edit cron expressions in the first slice.

## Success criteria

- CMS has no runtime or package requirement on content-pipeline and remains unchanged when
  it is absent.
- Installing both plugins automatically exposes one coherent Publishing workspace.
- Pipeline tools, CMS, and Dashboard report the same queue order and attention counts.
- All operational mutations remain owned and authorized by content-pipeline.
- Dashboard presents publishing health rather than duplicating CMS management.
- No UI contains a hard-coded assumption that the CMS or content-pipeline route exists.
