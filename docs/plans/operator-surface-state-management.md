# Plan: Operator surface state management

## Status

**Active on `work/operator-surface-state-management`.** Dashboard, CMS, and web-chat
currently have intentionally separate runtimes and no shared client-state library. The
CMS entity, type, schema, sync-status, and agent-target reads now use the package-local
query cache; saves, deletes, and image uploads use mutation hooks behind an explicit draft
boundary. The authenticated CMS behavior gate remains before workflow decomposition. This plan standardizes how state is classified and
managed without forcing the three surfaces into one browser store or one application.

The optional publishing UI described in
[`cms-publishing-workspace.md`](./cms-publishing-workspace.md) follows this state model but
keeps domain ownership in `@brains/content-pipeline`. When content-pipeline is absent, the
CMS has no publishing workspace state or requests to manage.

## Problem

The operator surfaces use different state patterns:

- Dashboard is server-rendered Preact with small DOM enhancements and URL-hash tab state.
- CMS is a React application whose entity data, editor workflow, mutations, polling, and
  transient controls are concentrated in `App.tsx` and many related `useState` calls.
- Web-chat is a React application that combines AI SDK `Chat`/`useChat` state with local
  session, history, dialog, upload, and drawer state.
- Console climate is a framework-neutral localStorage preference shared by all surfaces.

The absence of Redux or Zustand is not itself a defect. The actual problem is that server
state, workflow state, navigation state, and ephemeral view state are not consistently
separated. This makes CMS and web-chat harder to reason about and can produce duplicate
loading/error/invalidation logic.

## Decision

Adopt a state taxonomy rather than a universal global store:

| State kind                       | Owner                   | Default mechanism                                                         |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Durable domain data              | Brain services/entities | Existing typed HTTP APIs and service contracts                            |
| Client cache of server data      | Each React surface      | TanStack Query                                                            |
| Active streamed chat messages    | AI SDK                  | Existing `Chat`/`useChat` instance                                        |
| Multi-step local workflow        | Owning feature          | Typed reducer; XState only when transition complexity proves it necessary |
| Ephemeral component state        | Owning component        | `useState`                                                                |
| Addressable selection/navigation | Browser                 | URL path, query, or hash                                                  |
| Cross-surface preferences        | Shared console shell    | Framework-neutral localStorage helper and browser events                  |
| Dashboard render data            | Dashboard request       | Server-rendered input; no client query cache                              |

### Explicit non-goals

- Do not add Redux.
- Do not add a repository-wide Zustand store.
- Do not put entity records, API responses, or AI SDK message streams in a client-only
  global store.
- Do not turn Dashboard, CMS, and web-chat into a single SPA.
- Do not persist TanStack Query caches to localStorage in the first slice.
- Do not introduce optimistic CMS writes; content-hash conflict semantics remain
  authoritative.
- Do not migrate working local state merely to make every component use the same API.
- Do not touch Dashboard or `@brains/console-theme`: Dashboard stays server-rendered with
  URL-hash tab state and no client query cache; console-theme stays framework-neutral with
  its current climate mechanism. A preference subscription API is out of scope until a
  second genuine cross-surface preference exists.

## Architecture

### Query clients

CMS and web-chat each own a `QueryClient` at their React root. They may share conventions,
types, and test helpers, but not a runtime cache. Query keys are package-local factories so
invalidation remains typed and reviewable.

Suggested CMS keys:

```ts
cmsKeys.types();
cmsKeys.schema(entityType);
cmsKeys.entities(entityType);
cmsKeys.entity(entityType, entityId);
cmsKeys.syncStatus();
cmsKeys.agentTargets();
cmsKeys.workspace(workspaceId); // only after an optional workspace registers
```

Suggested web-chat keys:

```ts
chatKeys.sessions();
chatKeys.history(conversationId);
```

The existing API clients remain the transport boundary. Query functions call those clients
rather than embedding `fetch()` calls in components. The first publishing capability has no
workspace-list endpoint or `cmsKeys.workspaces()` query: its local registration controls
whether `cmsKeys.workspace(workspaceId)` is enabled. Add list state only when a second real
workspace requires discovery.

### Workflow reducers

Reducers own transitions that currently require several coordinated state values. Reducer
actions and states should be discriminated unions with impossible combinations excluded.

CMS candidates:

- browse/create/edit selection and loaded draft identity;
- save lifecycle: idle → saving → saved/no-op or conflict/error;
- delete confirmation and in-flight deletion;
- AI assist request/suggestion/answer/error transitions.

Web-chat candidates:

- session dialog mode and pending rename/archive/delete operation;
- drawer and selected-session transitions only if component extraction does not make them
  naturally local.

Do not place CodeMirror document state in a reducer. CodeMirror remains authoritative for
its editor state while the CMS retains the existing byte-identical synchronization
contract.

### URL state

Keep addressable state in the URL:

- Dashboard tab anchors;
- CMS entity type and entity id;
- web-chat conversation deep links.

Mobile panes, open dialogs, draft text, and composer text remain local unless a concrete
reload/share requirement emerges.

### Shared preferences

Keep `@brains/console-theme` framework-neutral. Extend its current climate mechanism only
if another genuine cross-surface preference appears. A small browser API may expose
`get`, `set`, and `subscribe` using localStorage plus `storage`/custom events. React adapters
may use `useSyncExternalStore`, but React must not become a dependency of the shared theme
package.

### Serialization and restore

Serialization is a reason for this taxonomy, not a reason for a unified store. A snapshot
of one global store would mix state kinds that must not be serialized together: a query
cache is stale the moment it is written (the correct restore is a refetch, not a
rehydrate), a streaming message list is not restorable mid-stream, CodeMirror state is not
plain data, and in-flight workflow state (a save mid-request, a half-open dialog) must not
be resurrected after a reload. Such snapshots also version badly across deploys.

Instead, every state kind already has a serialized form at its natural owner:

| State kind           | Serialized form                              |
| -------------------- | -------------------------------------------- |
| Durable domain data  | Brain database                               |
| Chat history         | Server-side under durable conversation IDs   |
| Addressable state    | The URL itself — a deep link is the snapshot |
| Preferences          | localStorage                                 |
| Query cache          | Not serialized; restore is a refetch         |
| Ephemeral view state | Not serialized; deliberately reset on reload |

Restoring the console after a reload is therefore: read URL, refetch, seed the `Chat`
instance from history. Reducer state is kept as discriminated-union plain data precisely
so that any workflow later needing persistence can be serialized as-is.

The one ephemeral-but-precious value is an unsaved dirty draft surviving a crash or
accidental reload. Draft recovery is out of scope for this plan; if it is wanted later, it
is a targeted persistence of one value — draft text plus base content hash, keyed by
entity ID in localStorage, offered for restore only when the base hash still matches —
not a store snapshot.

## Implementation phases

Each phase is a thin vertical slice: it migrates one concrete path end to end, writes its
characterization tests before the migration, and ships independently. Inventory and
network-behavior recording are not a standalone phase — each slice characterizes only the
paths it touches, immediately before touching them.

### Phase 1 — Walking skeleton: CMS entity list

1. Write characterization tests for the entity-list read as it behaves today: loading,
   error, refresh after mutation elsewhere, and request count.
2. Install `@tanstack/react-query` in `@brains/cms` (pinned major version), mount a
   package-local query client, and create the `cmsKeys` factory with only the keys this
   slice needs.
3. Migrate the entity-list read to a query hook backed by the existing typed API client.
   Everything else in `App.tsx` stays as-is.

Gate: entity-list tests pass with identical request counts; the query-client mounting, key
factory, and invalidation conventions are proven in miniature before anything else moves.

### Phase 2 — CMS entity detail and save

1. Write characterization tests first for the semantics that live on this path: content-hash
   precondition, no-op save, conflict reload, and the named acceptance test — **a background
   refetch or cache update must never replace dirty editor state**; the cached entity
   snapshot and the mutable draft are separate values, and replacing the draft requires an
   explicit transition.
2. Migrate the entity-detail read to a query hook and the save mutation to a mutation hook.
3. On successful writes, update or invalidate only the affected detail/list/sync keys.
4. CodeMirror body round trips remain byte-identical; CodeMirror stays authoritative for
   editor document state.

Gate: detail/save tests pass including the dirty-draft acceptance test; request counts do
not regress; an authenticated smoke covers edit, no-op save, and conflict.

### Phase 3 — CMS remaining server state

1. Per path — types, schema, sync status, agent targets, delete, upload — write its
   characterization tests, then migrate it, one path per commit.
2. Preserve pipeline polling, singleton behavior, uploads, and deep links.
3. Remove each superseded fetch effect and its ad hoc loading/error state in the same
   commit that migrates the path, not in a later cleanup pass.

Gate: no `fetch()` calls or ad hoc server-state effects remain in CMS components; an
authenticated smoke covers create, upload, and delete.

### Phase 4 — CMS workflow decomposition

1. Write reducer transition tests first, covering valid and rejected transitions for the
   mutually dependent browse/create/edit/save/delete workflow.
2. Introduce the typed editor reducer and extract focused hooks/components from the
   monolithic application without changing the visual contract.
3. Keep field inputs and simple presentation controls local.
4. Use XState only if the reducer still requires scattered guards/timers after extraction;
   do not adopt it solely because it exists elsewhere in the repository.

Gate: reducer transition tests cover valid and rejected transitions; no workflow state is
duplicated between reducer, query cache, and CodeMirror.

### Phase 5 — Web-chat server state

1. Write characterization tests first for session listing, session switching, and history
   reload, including request counts and streaming completion.
2. Add a package-local TanStack Query client to `@brains/web-chat` and migrate the session
   listing read.
3. Use a history query for reopening a stored conversation, then deliberately seed the AI
   SDK `Chat` instance. Do not let Query and `useChat` concurrently own the active streamed
   message list.
4. Invalidate/update session metadata after send, rename, archive, and delete operations.
5. Preserve uploads, approvals, progress events, attachment cards, action cards, streaming,
   cancellation, and durable conversation IDs.

Gate: session switching and streaming tests prove a single authoritative active-message
owner; no duplicate history loads or dropped transient parts.

### Phase 6 — Conventions and release

1. Document query-key, invalidation, reducer, and URL-state conventions near the owning
   packages.
2. Run targeted package checks, full typecheck/lint/test hooks, and authenticated Rover
   smoke.
3. Release CMS and web-chat package changes with patch changesets.
4. Delete this plan after the conventions and remaining work are represented in durable
   package documentation and the roadmap.

## Validation

- `bun run --filter @brains/cms typecheck`
- `bun run --filter @brains/cms test`
- `bun run --filter @brains/web-chat typecheck`
- `bun run --filter @brains/web-chat test`
- `bun scripts/lint.mjs --force --filter @brains/cms --filter @brains/web-chat` (from repo
  root — per-package `bun run lint` fails under TS7)
- `bun run docs:check`
- Authenticated Rover smoke for CMS mutations and web-chat session/stream behavior

## Risks and mitigations

- **Draft overwrite from background refetch:** separate cached entity snapshots from the
  mutable draft and block implicit draft replacement while dirty.
- **Two owners for chat messages:** Query may load history, but AI SDK exclusively owns the
  active and streaming message list.
- **Broad invalidation causing request storms:** use query-key factories and targeted
  invalidation; assert request counts in tests.
- **State abstraction obscuring behavior:** migrate one read/mutation path at a time and
  retain typed API clients as the visible boundary.
- **Cross-surface coupling:** share policy and small framework-neutral helpers, never query
  clients or mutable browser caches.
- **Unnecessary dependency spread:** Dashboard and console-theme do not depend on TanStack
  Query unless their runtime architecture changes.

## Success criteria

- CMS and web-chat clearly separate server cache, workflow, local UI, URL, and durable
  service state.
- No entity or chat stream has competing state owners.
- CMS no longer coordinates server reads and invalidation through ad hoc top-level effects.
- Web-chat session metadata updates consistently after every mutation.
- Dashboard remains lightweight and server-rendered.
- Cross-surface preferences remain framework-neutral.
- The migration reduces state complexity without changing visual design or production
  behavior.
