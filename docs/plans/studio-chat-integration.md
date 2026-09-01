# Plan: Studio Chat integration

## Status

**Proposed; architecture defined, implementation not started.** This plan moves
the authenticated browser Chat experience into Studio without coupling the move
to Studio's broader visual refactor. It consumes the existing fixed-workspace
frame and may adopt the accepted page-head grammar later; it does not block on
unrelated table, filter, or Account restyling.

## Shipped baseline

`interfaces/web-chat` currently owns the standalone `/chat` page, its browser
bundle, `/api/chat/*` routes, streaming, sessions, uploads, approvals, source
context, and conversation access. Studio already hosts one fixed lazy client
workspace, Account, while keeping auth-service authoritative for its APIs.

Web Chat is optional composition: the `web` bundle contains Studio, while the
`chat` bundle adds `web-chat`. A brain without the Chat capability must not
advertise or mount a Chat workspace.

## Goal

Make Chat a first-party Studio workspace with durable, linkable conversation
navigation and no cross-surface reload, while keeping all Chat server authority
in `interfaces/web-chat`.

End state:

- admitted Trusted and Admin sessions see one `web-chat:chat` workspace;
- the Studio Chat client calls the existing interface-owned APIs;
- selecting a conversation updates a bookmarkable Studio URL;
- “Discuss in chat” creates or resumes a bounded, titled conversation for the
  source item through router navigation;
- leaving and reopening Chat restores persisted messages and in-flight job
  state without relying on one browser's local storage;
- the configured legacy Chat page redirects permanently to the workspace;
- the console strip contains Dashboard / Studio;
- brains without `web-chat` expose no Chat workspace or dead door.

## Ownership and dependency boundary

- `interfaces/web-chat` retains `/api/chat/*`, authorization, person ownership,
  conversation creation and lookup, streaming, uploads, approvals, source
  permission checks, and error semantics.
- Studio owns the fixed browser presentation and lazy mount, just as it owns
  Account presentation while auth-service owns Account APIs.
- Browser-safe Chat request/response and handoff schemas used on both sides live
  in an existing shared contract package; Studio does not import the interface
  implementation package or shell internals.
- `StudioChatWorkspace` is a closed first-party renderer. It is not added to the
  external workspace renderer vocabulary and providers cannot supply code.
- Studio includes the built-in descriptor only when the registered HTTP route
  table contains an active `web-chat` plugin. Absence is tested; no provider
  callback is invoked merely to discover availability.
- The Chat lazy chunk is emitted into Studio's generated asset manifest, copied
  into the packed brain, and served only by the traversal-safe Studio asset
  route. The standalone self-bootstrapping Chat asset retires after redirect
  cutover.

## Admission and disclosure

The workspace floor is Trusted. Admins may open any browser conversation;
Trusted people may open only conversations owned by their person id. Public-rank
sessions continue to see Account only. Every `/api/chat/*` route keeps its own
interface-owned session and conversation checks; reaching the Studio shell is
not authorization to read a conversation.

Dashboard remains the anonymous public card. This plan does not invent a public
Chat door or lower Chat visibility. A sign-in-only contact door, if desired,
requires a separate declarative navigation contract and disclosure decision.

## Conversation URL and handoff

The canonical browser location is:

```text
/studio/workspaces/web-chat%3Achat?session=<conversation-id>
```

The session id is routing state, not authorization. Unknown or inaccessible ids
return the same bounded not-found state and disclose no owner or title. Session
selection replaces or pushes URL state consistently; refresh and copied links
restore through the API rather than local storage. Local storage may remain a
fallback for an unpersisted blank conversation but is not the cross-device
contract.

“Discuss in chat” carries only a versioned, schema-bounded locator and label:
`sourceId`, `itemId`, and a sanitized title seed. The interface resolves the
source and permission server-side. A same-origin endpoint idempotently finds or
creates the actor's non-archived conversation for `(personId, sourceId,
itemId)`, stores only the locator and bounded title, and returns its id. Source
detail remains transient and is resolved again when a message uses it; the
handoff never stores private source content in history state or an entity.

Repeated launches resume that conversation. If it was archived, the endpoint
creates a new one unless the product explicitly chooses restoration. A newly
created empty conversation is durable so it appears on another device; archive
and deletion clean up the locator association with the conversation.

Navigating away may detach the browser stream, but it must not lose the server
job or durable messages. Reopening the conversation hydrates history and current
job status through the existing APIs.

## Legacy route behavior

The configured Chat page path (default `/chat`) becomes a permanent redirect to
the canonical workspace. Query state is bounded and merged deliberately;
conversation hash doors such as `#s/<id>` are translated or preserved until the
workspace client consumes them. Anonymous callers follow the Studio login flow
with a return target for the Chat workspace. `/api/chat/*` paths do not move.

The redirect ships before the standalone page and asset are deleted. Tests
cover the default and configured route, query and fragment deep links, login
return targets, and redirect loops.

## Phases

### Phase 1 — Extract the fixed client boundary

- Tests first around the browser-safe Chat contracts and current standalone
  client behavior.
- Move Chat presentation into Studio's lazy client tree; move only shared
  schemas/constants needed by both sides into the shared contract package.
- Keep the standalone `/chat` page rendering the same client during this phase
  so extraction is behavior-preserving.
- Emit, manifest, serve, and package the Chat chunk through Studio's bounded
  asset pipeline.

Exit condition: source and packed builds can load the same Chat client from
Studio without moving an API or changing standalone behavior.

### Phase 2 — Conditional workspace admission

- Tests first: `web` without `chat` has no descriptor; `web + chat` admits
  Trusted/Admin and omits active Public; denied actors cannot load data.
- Add the closed `StudioChatWorkspace` descriptor when the `web-chat` route is
  active.
- Mount the existing session rail, conversation, composer, uploads, approvals,
  progress, and action UI inside the fixed workspace frame.
- Ensure unmount/remount cleans listeners and browser resources without
  cancelling durable server work.

Exit condition: Chat works inside Studio while `/chat` remains available as a
rollback door.

### Phase 3 — Durable routing and Discuss handoff

- Add the validated `session` URL state and update it on session selection,
  creation, archive, and deletion.
- Add the idempotent context-session operation with actor ownership and
  source-permission checks.
- Replace Studio's `pushState` plus `window.location.reload()` handoff with one
  router navigation to the returned conversation.
- Title the session from the bounded item label and preserve transient source
  resolution on send.
- Test repeat launch, refresh, copied URL, another browser, inaccessible ids,
  archive/delete, navigation during a stream, and source permission revocation.

Exit condition: no Chat launch requires a page reload or browser-local identity
for restoration.

### Phase 4 — Cut over the surface

- Permanently redirect the configured legacy page path to the workspace.
- Remove the standalone Chat shell, self-bootstrapping asset, and Chat console
  strip entry only after source and packed redirect tests pass.
- Keep all interface API routes and source-owned endpoint/interaction metadata
  needed by runtime policy; remove only the separate browser-surface door.
- Update console, route-manifest, migration, package, and visual fixtures.

Exit condition: Dashboard / Studio is the complete strip, old links converge on
Studio Chat, and rollback requires only restoring the page handler rather than a
conversation-data migration.

## Validation

- Exact route/admission matrix for anonymous, active Public, Trusted, and Admin.
- Trusted own-conversation and Admin cross-person access tests on every API used
  by the workspace.
- Optional-composition tests for brains with Studio but no Web Chat.
- Source and packed lazy-chunk loading with manifest-bounded asset names.
- Session list, deep-link, history, streaming, upload, approval, action,
  archive, delete, and job-resume behavior.
- Same-origin mutation protection and bounded handoff schema rejection.
- Desktop and phone visual baselines preserving the existing session rail and
  drawer behavior.
- Permanent redirect coverage for configured paths, query, fragments, and
  login return targets.

## Risks

- Treating a URL id as authorization can leak another person's conversation.
  Every read and mutation continues through interface-owned access checks.
- An unconditional built-in workspace creates a dead door in `web`-only brains.
  Availability derives from active route registration and is tested both ways.
- Moving the client without moving all emitted chunks breaks only after the
  workspace is opened. Studio's generated manifest and packed loading tests are
  release gates.
- Reusing history state as durable identity fails across devices and repeated
  launches. The server-owned context-session operation is idempotent and the
  canonical id lives in the URL.
- Persisting resolved Inbox detail would move private source content into the
  conversation index. Only the locator and bounded title persist; detail is
  permission-checked again when used.
- Combining this move with the broad Studio refactor makes security and
  conversation regressions hard to isolate. This plan consumes a stable frame
  but does not implement the cross-Studio visual grammar.
