# CMS plugin

`@brains/cms` provides authenticated entity browsing and editing while preserving entity-service conflict and pipeline semantics.

## State ownership

- The package-local TanStack `QueryClient` owns entity types, schemas, lists, entity snapshots, sync status, and optional agent targets.
- `editorWorkflowReducer` owns coordinated browse/create/edit/save/delete transitions, draft fields, body text, save state, and delete confirmation.
- `EditorDocument` separates an immutable cached entity snapshot from its mutable draft and pinned `baseContentHash`. Background cache changes must never replace a dirty draft implicitly.
- CodeMirror owns its live editor document; reducer actions synchronize intentional body changes without normalizing stored bytes.
- Pane choice, field-assist presentation, and other transient controls stay local.

## Query and mutation conventions

All server-state keys come from `ui-react/src/queries.ts`:

```ts
cmsKeys.navigation();
cmsKeys.workspace(workspaceId);
cmsKeys.schema(entityType);
cmsKeys.entities(entityType);
cmsKeys.entity(entityType, entityId);
cmsKeys.syncStatus();
cmsKeys.agentTargets();
```

Transport calls belong in `api.ts`; query and mutation wrappers belong in `queries.ts` and `mutations.ts`. Invalidation must be targeted:

- saves refresh the affected list and sync status, then explicitly reopen the saved detail with its fresh content hash;
- deletes remove the affected detail and refresh its list and sync status;
- image uploads refresh only image-list, navigation-count, and sync-status data;
- publishing and site-build actions refresh only their workspace snapshot;
- sync polling invalidates only `cmsKeys.syncStatus()`.

Do not optimistically rewrite entity content or advance the pinned content hash. The entity service remains authoritative for byte-identical no-op saves and content-hash conflicts. Tests must cover exact request counts, stale responses, deduplication, draft preservation, and invalidation with `@brains/test-utils` `mockFetch` before a server-state path is migrated.

## Workflow and addressable state

Reducer actions are discriminated transitions; rejected transitions return the existing state. Add XState only if this reducer can no longer express the workflow without scattered timers or guards.

CMS doors use `#/{encodedEntityType}` or `#/{encodedEntityType}/{encodedEntityId}`. Optional operational workspaces use `#/workspace/{encodedWorkspaceId}`. The hash selects the initial collection, entity, or workspace. Draft values, conflicts, dialogs, pane selection, and other transient workflow state do not belong in the URL.

## Optional workspaces

Service plugins may register a CMS-owned renderer through `cms:register-workspace`. Registrations are ordered by `priority`, duplicate IDs are rejected, and no provider is required for the CMS to start.

The bundled renderer vocabulary is deliberately narrow:

- `PublishingWorkspace` operates the content-pipeline queue and publication failures;
- `SiteWorkspace` operates site-builder preview and production builds.

Providers own snapshots, validation, authorization, and actions. The CMS owns authenticated transport, navigation, rendering, and targeted query invalidation. Runtime React components are never accepted through registration.
