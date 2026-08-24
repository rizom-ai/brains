# Studio plugin

`@brains/studio` provides an active-session operator shell and Trusted entity browsing and editing while preserving entity-service conflict and pipeline semantics. Public-rank active sessions can enter the shell, but dedicated entity, assist, upload, and agent APIs remain Trusted; repository sync diagnostics remain Admin-only.

## State ownership

- The package-local TanStack `QueryClient` owns entity types, schemas, lists, entity snapshots, sync status, and optional agent targets.
- `editorWorkflowReducer` owns coordinated browse/create/edit/save/delete transitions, draft fields, body text, save state, and delete confirmation.
- `EditorDocument` separates an immutable cached entity snapshot from its mutable draft and pinned `baseContentHash`. Background cache changes must never replace a dirty draft implicitly.
- CodeMirror owns its live editor document; reducer actions synchronize intentional body changes without normalizing stored bytes.
- Pane choice, field-assist presentation, and other transient controls stay local.

## Query and mutation conventions

All server-state keys come from `ui-react/src/queries.ts`:

```ts
studioKeys.navigation();
studioKeys.workspace(workspaceId);
studioKeys.schema(entityType);
studioKeys.entities(entityType);
studioKeys.entity(entityType, entityId);
studioKeys.syncStatus();
studioKeys.agentTargets();
```

Transport calls belong in `api.ts`; query and mutation wrappers belong in `queries.ts` and `mutations.ts`. Invalidation must be targeted:

- saves refresh the affected list and sync status, then explicitly reopen the saved detail with its fresh content hash;
- deletes remove the affected detail and refresh its list and sync status;
- image uploads refresh only image-list, navigation-count, and sync-status data;
- declarative workspace actions refresh only their workspace snapshot and any badge-bearing navigation;
- sync polling invalidates only `studioKeys.syncStatus()`.

Do not optimistically rewrite entity content or advance the pinned content hash. The entity service remains authoritative for byte-identical no-op saves and content-hash conflicts. Tests must cover exact request counts, stale responses, deduplication, draft preservation, and invalidation with `@brains/test-utils` `mockFetch` before a server-state path is migrated.

## Workflow and addressable state

Reducer actions are discriminated transitions; rejected transitions return the existing state. Add XState only if this reducer can no longer express the workflow without scattered timers or guards.

Studio doors use `{routePath}/entities/{encodedEntityType}` or `{routePath}/entities/{encodedEntityType}/{encodedEntityId}`. Optional operational workspaces use `{routePath}/workspaces/{encodedWorkspaceId}`. Package-local TanStack Router browser history owns the selected collection, entity, or workspace, including Back, Forward, refresh, and direct entry. Entity IDs are encoded as one value and may contain slashes. Draft values, conflicts, dialogs, pane selection, and other transient workflow state do not belong in the URL; navigation away from a dirty edit or creation draft requires explicit confirmation.

Destination-owned Inbox handoffs may open `{routePath}/entities/note?mode=create` with a
bounded, schema-validated history-state envelope. Studio consumes that envelope once, seeds an
unsaved title and canonical source backlink, and removes only its own history-state key.
Reloading opens an empty draft, and direct entry still passes normal Studio authentication,
entity availability, and create-policy checks. Studio also owns the registered **Open source
entity** target, so the Inbox renderer never constructs entity URLs itself.

Workspace definitions may opt into host-owned stable URL filters with a typed query schema. The Studio hydrates declared filters from the raw search string, validates them on the server, and replaces their canonical URL without guessing provider semantics. Paging remains transient request state, so reload starts from the first page. Workspaces without a query declaration ignore URL search entirely.

## Workspaces

The Admin plugin registers Admin-only Audit, People, Invitations, and Peers workspaces through the shared declarative runtime, without depending on the Studio host. Their providers read records directly from auth-service. Audit filters and paginates in the auth store; access and invitation mutations preserve actor attribution, prepared confirmation, and one-time setup links without duplicating auth APIs.

Service plugins declare optional workspaces with `defineStudioWorkspace()`. The runtime scopes IDs, registers after setup, unregisters on shutdown, and sends only `DeclarativeOperatorWorkspace` registrations to the Studio. The host enforces each registration's permission floor before every provider callback and defaults omitted floors to Trusted; only an explicit lower floor can admit an active Public-rank actor. Registrations are ordered by `priority`, duplicate IDs are rejected, and no provider is required for the Studio to start.

Every workspace uses the same closed host-rendered vocabulary: content blocks, composition, queries, spatial and relational views, typed actions, schema-driven forms, bounded ephemeral results, dynamic catalogs, launch intents, and static or prepared confirmation. Publishing, Site, Directory Sync, Unified Inbox, Audit, People, Invitations, and Peers all use this path; there are no specialized renderer names or private browser implementations.

Providers own schema-valid data, permission narrowing, and action execution. The Studio owns authentication, transport, navigation, validation, rendering, accessibility, query URLs, confirmation tokens, and targeted invalidation. Runtime React components, HTML, CSS, scripts, and private URLs are never accepted through registration.
