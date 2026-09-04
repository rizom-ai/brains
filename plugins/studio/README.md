# Studio plugin

`@brains/studio` provides an active-session operator shell, a Trusted-floor Overview workspace, the self-service Account workspace, and Trusted entity browsing and editing while preserving entity-service conflict and pipeline semantics. Trusted and Admin sessions land in Overview; Public-rank active sessions can enter the shell and use Account. Dedicated entity, assist, upload, and agent APIs remain Trusted; repository sync diagnostics and administration workspaces remain Admin-only.

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

Studio doors use `{routePath}/entities/{encodedEntityType}`, `{routePath}/entities/{encodedEntityType}/{encodedEntityId}`, or `{routePath}/workspaces/{encodedWorkspaceId}`. Account is the built-in `studio:account` workspace. Package-local TanStack Router browser history owns the selected workspace, collection, or entity, including Back, Forward, refresh, and direct entry. Entity IDs are encoded as one value and may contain slashes. Draft values, conflicts, dialogs, pane selection, and other transient workflow state do not belong in the URL; navigation away from a dirty edit or creation draft requires explicit confirmation.

Destination-owned Inbox handoffs may open `{routePath}/entities/note?mode=create` with a
bounded, schema-validated history-state envelope. Studio consumes that envelope once, seeds an
unsaved title and canonical source backlink, and removes only its own history-state key.
Reloading opens an empty draft, and direct entry still passes normal Studio authentication,
entity availability, and create-policy checks. Studio also owns the registered **Open source
entity** target, so the Inbox renderer never constructs entity URLs itself.

Workspace definitions may opt into host-owned stable URL filters with a typed query schema. Query-backed tabs use their declared tab-block query key, so selection, refresh, and Back/Forward agree while providers load only the active tab; switching tabs resets the prior tab's filters and detail state instead of leaking them into the next concern. The Studio hydrates declared filters from the raw search string, validates them on the server, and replaces their canonical URL without guessing provider semantics. Paging remains transient request state, so reload starts from the first page. Serializable workspace aliases preserve retired deep links by replacing the workspace id and merging bounded canonical query state. Workspaces without a query declaration ignore URL search entirely.

## Account and split assets

Account is a built-in Studio workspace with an explicit Public permission floor beneath the active-session shell gate. Its fixed host-owned renderer is delivered as a lazy React chunk, preserves the WebAuthn ceremonies, and continues to call auth-service's `/auth/account/*` endpoints. External workspace registrations remain restricted to the declarative renderer; they cannot supply browser code. `/account` permanently redirects to the workspace, while `/admin` redirects to neutral Studio home.

The UI build compiles `@brains/app-ui-react` StyleX declarations into a static `app.css`, emits deterministic hashed chunks and `studio-asset-manifest.json`, and performs no browser-time style injection. The server exposes only manifest-listed names under `{routePath}/assets/`; encoded traversal and unlisted files fail closed. The bundled `@rizom/brain` build copies the stylesheet, entry, manifest, source maps, and every split chunk together.

## Interface grammar

Studio owns one responsive frame across the library, editor, Account, Overview, and declarative workspaces. Buttons, fields, switches, dialogs, menus, and hydrated tabs come from the shared app control set; the Dashboard-facing renderer keeps a CSS fallback behind its host component seam. The shared page head derives its access chip from the admitted workspace floor, keeps query controls with their collection, and accepts at most one explicitly declared primary action. The host places that same action control in the desktop title row and the phone action bar; ordinary action blocks stay in flow. The library adapts **New**, the editor adapts **Save changes** while retaining pipeline feedback, Invitations declares **Add a person**, and Content sync declares **Sync now**. Account and Overview intentionally declare no page-level action, while Site, Publishing, and Inbox retain their multiple environment- or item-scoped actions.

At phone width, only source-declared compact table rows reflow into the list grammar. Built-in People, passkey, channel, peer, invitation, Audit, and Site-route collections provide those semantics; unknown or external unannotated rows retain a bounded horizontal-scroll fallback. The console strip and fading workspace rail consume two chrome bars, the page head compresses to one line, and safe-area padding keeps fixed actions reachable. Declarative disclosures, confirmations, disabled and pending state, and sensitive ephemeral results remain attached to the single rendered action control.

## Workspaces

Overview is the built-in `studio:overview` operator home at the Trusted floor. It aggregates needs-attention digests and source-owned launch links, recent entity and job activity, and bounded system/network state. Administration contributes Admin-only failed-delivery and expiring-invitation attention without exposing setup URLs. Non-public semantic widgets declared with the existing Dashboard definition contract are re-homed here automatically; providers do not define a second view or depend on Studio. Its aggregate attention count becomes the workspace rail badge. Public widgets remain on Dashboard, and Dashboard never invokes Trusted/Admin providers.

The headless Admin plugin registers one Admin-only Administration workspace through the shared declarative runtime, without depending on the Studio host or owning an independent browser route. People, Invitations, and Audit are query-backed tabs that load independently; external peer provenance and relationship controls live with People, while peer-first invitations live with Invitations. Invitations leads with Pending/History state, declares **Add a person** as its single collapsed primary disclosure, and keeps peer-first invitation in the secondary rail; channel-owned destination labels replace transport plumbing language. The aggregate attention count becomes one rail badge, and retired workspace ids resolve to the matching tab. Providers read records directly from auth-service. Audit filters and paginates in the auth store; access, invitation, and peer-link mutations preserve actor attribution, prepared confirmation, and one-time setup links without duplicating auth APIs.

Service plugins declare optional workspaces with `defineStudioWorkspace()`. The runtime scopes IDs, registers after setup, unregisters on shutdown, and sends only `DeclarativeOperatorWorkspace` registrations to the Studio. The host enforces each registration's permission floor before every provider callback and defaults omitted floors to Trusted; only an explicit lower floor can admit an active Public-rank actor. Registrations are ordered by `priority`, duplicate IDs are rejected, and no provider is required for the Studio to start.

Every externally registered workspace uses the same closed host-rendered vocabulary: content blocks, composition, query-backed full-view tabs, spatial and relational views, typed actions, inline or disclosure schema-driven forms, channel-selected field labels, bounded ephemeral results, dynamic catalogs, launch intents, and static or prepared confirmation. Publishing, Site, Content sync, Unified Inbox, and Administration all use this path; registrants cannot introduce specialized renderer names or private browser implementations. Account is the sole host-built workspace renderer because its passkey ceremony is part of Studio's trusted browser bundle.

Providers own schema-valid data, permission narrowing, and action execution. The Studio owns authentication, transport, navigation, validation, rendering, accessibility, query URLs, confirmation tokens, and targeted invalidation. Runtime React components, HTML, CSS, scripts, and private URLs are never accepted through registration.
