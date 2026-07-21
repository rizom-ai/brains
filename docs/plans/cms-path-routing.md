# Plan: CMS path routing and browser history

## Status

**Proposed.** Replace the CMS editor's hash doors and one-time hash parsing with
package-local, typed path routing. Browser Back and Forward must restore collections,
entities, and optional workspaces without introducing a global browser store or changing
CMS query, mutation, draft, conflict, or pipeline ownership.

## Problem

The CMS is served as one React document at its configured `routePath`, normally `/cms`.
Its visible screen is mostly reducer and component state. Hashes provide initial deep
links, but they do not currently form a router:

- collection and workspace selections call `history.replaceState()`;
- opening an entity does not update the URL;
- the editor's Back control only dispatches `browseRequested`;
- no `popstate` or `hashchange` listener reconstructs state;
- browser Back and Forward therefore cannot replay CMS navigation.

The existing doors are also an active package contract: Dashboard search, command-palette
results, content-pipeline, site-builder, directory-sync, CMS workspace registration,
documentation, tests, and the visual harness produce hash URLs. The migration must update
those producers atomically rather than retain a second legacy routing system.

## Goals

- Give every durable CMS screen a normal path under the configured CMS base path.
- Make browser Back and Forward authoritative for addressable navigation.
- Make the editor's Back control return to its collection without unexpectedly leaving
  the CMS when an entity was opened through a direct door.
- Preserve custom CMS mounts such as `/studio`.
- Preserve entity IDs containing slashes, spaces, Unicode, and percent characters.
- Keep TanStack Query authoritative for server snapshots and `editorWorkflowReducer`
  authoritative for drafts and coordinated editor transitions.
- Block navigation that would discard a dirty draft until the operator explicitly
  confirms it.
- Remove hash routing completely, including its active link producers and documentation.

## Non-goals

- Combining Dashboard, CMS, and web-chat into one SPA or router.
- Moving drafts, dialogs, mobile pane choice, editor mode, field-assist state, conflicts,
  or save/pipeline presentation into the URL.
- Changing CMS API paths or entity-service write semantics.
- Persisting the Query cache or editor reducer.
- Adding server rendering for CMS React views.
- Supporting old hash bookmarks after the migration.

## Route contract

For a CMS configured with `routePath: "/cms"`, the canonical routes are:

| Screen                       | Path                                                  |
| ---------------------------- | ----------------------------------------------------- |
| CMS entry/default collection | `/cms`                                                |
| Entity collection            | `/cms/entities/{encodedEntityType}`                   |
| Entity detail                | `/cms/entities/{encodedEntityType}/{encodedEntityId}` |
| Optional workspace           | `/cms/workspaces/{encodedWorkspaceId}`                |

`routePath` remains configurable, so `/studio/entities/post/field-notes` is equally valid.
Entity IDs may contain `/`; the entity-detail route therefore treats everything after the
encoded entity-type segment as the ID payload and decodes it exactly once. Route formatting
and parsing must share one implementation and must never infer the API base from the current
deep pathname.

`/cms` may select the first available non-singleton collection after navigation data loads.
A singleton collection may replace the route with its concrete entity-detail path once its
record is known. Invalid entity types, IDs, workspace IDs, malformed encodings, and unknown
CMS subpaths render an explicit not-found/error state; they do not silently open a different
collection.

## Routing decision

Use `@tanstack/react-router` inside `plugins/cms` with browser history and a runtime
`basepath` supplied by the server-rendered shell. Do not add a cross-console router and do
not build another ad hoc history abstraction.

The server shell must expose the normalized configured base path independently of
`window.location.pathname`, for example as `data-cms-base-path` on the CMS root. The API
client must use that value, so a page at `/cms/entities/post/example` still requests
`/cms/api/types` rather than `/cms/entities/post/example/api/types`.

The route tree and route codecs belong in focused package-local modules rather than in
`App.tsx`. `App` consumes one typed route target and issues reducer/query transitions; it
does not parse browser globals itself.

## Server route support

`WebRouteDefinition` and the webserver currently match paths exactly. Add an explicit,
typed match mode with exact matching as the backward-compatible default. Prefix matching
must be segment-boundary aware, method aware, and deterministic:

1. exact method/path routes win;
2. otherwise the longest matching prefix wins;
3. `/cms/entities` must not match `/cms/entities-other`.

CMS registers its authenticated shell for the exact base route and for the entity and
workspace path prefixes. It must not register a catch-all `/cms` prefix: unknown API and
asset paths must continue to return 404 rather than HTML. Direct deep-route requests return
the same no-store shell as `/cms`; unauthenticated requests preserve the full pathname and
search string in the sanitized `return_to` value.

Add this matching capability to the shared web-route contract and webserver only. CMS route
semantics remain owned by `@brains/cms`.

## Navigation semantics

- Selecting a collection or workspace pushes a history entry.
- Opening an entity from a collection pushes its detail route immediately; the route then
  drives the detail query and loading/error presentation.
- Opening another entity pushes another detail route.
- Creating remains transient. A successful create pushes the new entity-detail route so
  browser Back returns to the collection.
- A successful delete replaces the deleted detail route with its collection route, so
  Forward cannot reopen a known-deleted record.
- A workspace action that opens an entity pushes that entity's detail route.
- Browser Back and Forward drive the same typed route-to-state transition as in-app links.
- The editor's Back control uses browser Back only when the current history entry records
  that it came from the same CMS collection. For a direct entity door, it replaces the
  current detail route with the collection route instead of leaving CMS.

Route transitions invalidate outstanding entity-open request IDs before loading the next
target. Delayed responses must not reopen an entity after Back, Forward, collection, or
workspace navigation.

## Dirty-draft boundary

A route transition that would leave a dirty edit or creation draft must be blocked for:

- CMS links and buttons;
- browser Back and Forward;
- console-strip navigation;
- logout and page unload where the browser permits a warning.

Use the router's blocker integration for in-app and history traversal, backed by one CMS
confirmation dialog. Confirming discards the draft and completes the originally requested
navigation exactly once; cancelling leaves both the URL and reducer state unchanged. Saving
or deleting clears the blocker through existing reducer transitions. Query refreshes remain
non-navigational and must never trigger the blocker or replace a dirty draft.

## No hash compatibility layer

Do not parse, redirect, or otherwise support `#/{type}/{id}` or
`#/workspace/{workspaceId}` after this migration. All in-repository producers are under our
control and must move in the same change. Historical changelog text remains historical;
active package documentation and fixtures use only canonical paths.

Update at least:

- CMS workspace registration results;
- Dashboard console-jump and command-palette entity doors;
- content-pipeline, site-builder, and directory-sync management URLs;
- shared console-theme palette fixtures;
- CMS README and provider documentation;
- visual-regression navigation targets;
- all related package and integration tests.

## Implementation slices

Each slice starts with focused characterization or failing contract tests and lands
independently where practical.

### 1. Typed route and server matching contracts

- Add exact/prefix web-route matching tests to webserver and shell route collection.
- Add route-codec tests for default/custom base paths, collection/workspace targets,
  slash-bearing IDs, Unicode, percent encoding, malformed input, and unknown paths.
- Implement the shared match mode and package-local CMS route tree/codecs.
- Verify existing exact web and API routes are unchanged.

### 2. Deep shell delivery and stable API base

- Characterize current authentication, no-store shell, asset, and API behavior.
- Serve the shell on canonical entity/workspace prefixes without catching API/assets.
- Inject the configured CMS base path and stop deriving API paths from the current pathname.
- Cover direct authenticated and unauthenticated deep-route requests under `/cms` and a
  custom `/studio` mount.

### 3. Route-owned CMS selection

- Characterize collection, singleton, detail, workspace, stale-response, and dirty-draft
  behavior before changing ownership.
- Mount the package-local router and translate typed route targets into existing query and
  reducer transitions.
- Remove initial hash refs/parsers and duplicate `entityType`/workspace selection paths
  where the router is now authoritative.
- Preserve exact query request counts and stale entity-open rejection.

### 4. History-writing interactions

- Migrate collection, workspace, entity-open, create-save, delete, and workspace-to-entity
  actions to typed navigation.
- Implement browser Back/Forward and the direct-door-safe editor Back behavior.
- Add history-stack tests covering list → detail → Back → Forward, workspace transitions,
  direct detail entry, deleted records, and rapid navigation with delayed responses.

### 5. Dirty navigation protection

- Add failing tests for cancelled and confirmed navigation from dirty edit/create states.
- Integrate one blocker dialog across router navigation and history traversal.
- Add unload protection and verify clean drafts navigate without prompts.
- Confirm cached entity changes still cannot replace dirty editor documents.

### 6. Atomic producer migration and hash removal

- Change every active CMS URL producer to the shared canonical path formatter or an
  equivalent server-side helper.
- Remove hash parser exports, tests, comments, and active documentation.
- Add repository-level containment coverage that rejects new `/cms#/` and CMS
  `#/workspace/` producers outside historical changelogs.
- Refresh visual baselines only if the canonical route changes deterministic harness output;
  do not use baseline updates to approve visual changes.

## Validation

Run the lightest checks per slice, then before review run:

- CMS typecheck, unit tests, and UI build;
- webserver and shell route-registry tests;
- Dashboard, content-pipeline, site-builder, directory-sync, and console-theme targeted
  tests for generated doors;
- full repository typecheck, tests, lint, and commit-hook suite because the shared web-route
  contract crosses packages;
- `bun run docs:check` and `bun run roadmap:check`;
- `git diff --check`.

Authenticated full-Rover smoke must verify:

1. direct load of a collection, slash-bearing entity ID, and each registered workspace;
2. list → entity → browser Back → browser Forward;
3. editor Back after both in-app navigation and a direct external door;
4. refresh at every canonical route;
5. custom CMS `routePath` coverage;
6. dirty-draft cancel and confirm behavior;
7. create, save/no-op save, conflict reload, delete, upload, and workspace actions;
8. Dashboard/command-palette doors landing on the intended CMS screen;
9. API and asset requests staying under the configured CMS base path;
10. unknown CMS, API, and asset paths returning the intended error rather than the shell.

Repeat navigation and blocker smoke at desktop and mobile widths.

## Completion criteria

- No active CMS hash routes or compatibility redirects remain.
- Every addressable CMS screen has one canonical path under configurable `routePath`.
- Back, Forward, refresh, direct doors, and the editor Back control behave as specified.
- Dirty drafts cannot be discarded by navigation without confirmation.
- Server-state, reducer, CodeMirror, content-hash, upload, AI assist, optional workspace, and
  pipeline semantics remain intact.
- Shared exact-route behavior remains backward compatible for every other plugin.
- Durable routing and state-ownership conventions replace this plan in the CMS README, then
  this plan is retired.
