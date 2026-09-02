# Plan: Studio Chat integration

## Status

**Accepted architecture; implementation not started.** Chat will become a native
Studio workspace without embedding the standalone Web Chat application. The
first implementation slice is the public headless Chat contract; no presentation
moves before that boundary is published and tested.

## Shipped baseline

`interfaces/web-chat` currently owns the standalone `/chat` page, its browser
bundle, `/api/chat/*` routes, streaming, sessions, uploads, approvals, source
context, and conversation access. Studio already hosts fixed native workspaces
such as Account while keeping the owning service authoritative for its APIs.

Web Chat is optional composition: the `web` bundle contains Studio, while the
`chat` bundle adds Web Chat and the wider conversational capabilities. A brain
may enable Chat without Studio and must retain a usable standalone browser Chat
surface in that composition.

## Goal

Provide one Chat domain through two native presentations:

- when Chat and Studio are active, Studio renders a native, deeply integrated
  Chat workspace;
- when Chat is active without Studio, Web Chat continues to render the
  standalone `/chat` experience;
- both presentations consume the same public Chat domain and transport
  contract;
- neither presentation imports the other's implementation or reaches into shell
  internals;
- when Studio Chat is available, the legacy `/chat` door redirects to its
  canonical Studio location instead of exposing two browser Chat applications.

The Studio presentation may evolve with Studio's page grammar, navigation,
entity context, workspace handoffs, and responsive behavior. It is not a routed
standalone application mounted inside a workspace, iframe, WebView, or opaque
React subtree.

## Composition matrix

| Active capabilities | Browser behavior                                      |
| ------------------- | ----------------------------------------------------- |
| Chat + Studio       | Native Studio Chat workspace; `/chat` redirects to it |
| Chat without Studio | Standalone `/chat` page                               |
| Studio without Chat | No Chat workspace or dead navigation door             |
| Neither             | No browser Chat surface                               |

Platform Chat capabilities that do not require the browser remain independent
of this matrix.

## Ownership and public boundary

### Chat domain

The Chat capability owns:

- conversation persistence and person ownership;
- permission checks and disclosure semantics;
- message submission and streaming;
- uploads and attachment access;
- approvals, actions, progress, and durable job state;
- source-context authorization;
- the standalone Web Chat presentation used when Studio is absent.

### Public headless API

`@rizom/brain/chat` is the patch-stable browser-safe boundary consumed by both
presentations. It exposes only versioned domain schemas, protocol events,
bounded path builders, and a fetch-injected transport client. Public state is
limited to server-owned domain state such as conversation metadata, approval
lifecycle, durable job status, and stream events. It exposes no active-selection
state, reducers, cache behavior, local storage, navigation, UI-message
transforms, presentation status, error copy, React components, CSS, DOM
renderer, package-local route handlers, shell contexts, stores, or runtime
classes.

The canonical source may live in an internal shared contract package, but the
published export, compatibility fixture, and ledger are authoritative. Studio
and Web Chat use that same canonical source; there is no second internal shape
that can drift from the public API.

All `/api/chat/*` handlers parse requests and serialize responses with these
schemas. Authentication and authorization remain handler-owned. A route being
HTTP-accessible is not sufficient to make it public: only paths and behavior
listed in the public Chat contract are supported.

### Private shared UI model

Presentation-neutral browser orchestration that both hosts demonstrably need
may be extracted into a private workspace package such as
`@brains/chat-ui-model`. Candidate responsibilities include stream lifecycle
orchestration, approval reconciliation, history-to-AI-SDK conversion, upload
preparation, and narrowly shared cache helpers. This package is implementation,
not API: it is marked `private`, used through explicit `workspace:*`
dependencies, bundled into host assets, and omitted from `@rizom/brain` package
exports, public declarations, compatibility fixtures, and the public API
ledger.

No universal UI controller is designed in advance. Logic moves into the private
package only after both native hosts prove the same semantics. Active selection,
routing, navigation, loading presentation, labels, error copy, and layout remain
host-owned even if private lower-level helpers are shared. Presence of private
implementation code inside a distributed browser bundle does not make it a
supported import surface.

### Studio

Studio owns:

- the built-in Chat workspace descriptor and admission;
- Studio routing and browser-history integration;
- the native workspace layout, page grammar, navigation, and responsive UX;
- entity and workspace context presentation;
- integration with Studio-wide launches and attention surfaces.

Studio imports the public headless contract and may directly depend on the
private shared UI-model package for proven common orchestration. It does not
import `interfaces/web-chat`, route handlers, Web Chat package-private hooks, or
the standalone screen. `StudioChatWorkspace` remains a closed first-party
workspace kind; this does not permit external plugins to inject executable
renderers.

### Standalone Web Chat

The Web Chat interface retains its standalone presentation for Chat-only
instances. It consumes the same public headless API but owns its own page shell
and composition. Shared domain and transport behavior belongs in the public
contract; proven presentation-neutral orchestration may live in the private UI
model; host-specific view state and layout stay with each host. The two
presentations are allowed to differ visually without duplicating authorization
or conversation semantics.

## Admission and disclosure

The Studio workspace floor is Trusted. Admins may open any browser conversation;
Trusted people may open only conversations owned by their person id. Public-rank
sessions continue to see Account only. Every public Chat API operation keeps its
interface-owned session and conversation checks; reaching the Studio shell is
not authorization to read a conversation.

Dashboard remains the anonymous public card. This plan does not invent a public
Chat door or lower Chat visibility.

## Conversation URL and handoff

The canonical Studio browser location is:

```text
/studio/workspaces/web-chat%3Achat?session=<conversation-id>
```

The session id is routing state, not authorization. Unknown or inaccessible ids
return the same bounded not-found state and disclose no owner or title. Session
selection replaces or pushes URL state consistently; refresh and copied links
restore through the public API rather than local storage. Local storage may
remain a fallback for an unpersisted standalone blank conversation but is not
the cross-device contract.

“Discuss in chat” carries only a versioned, schema-bounded locator and label:
`sourceId`, `itemId`, and a sanitized title seed. The Chat service resolves the
source and permission server-side. A public same-origin operation idempotently
finds or creates the actor's non-archived conversation for
`(personId, sourceId, itemId)`, stores only the locator and bounded title, and
returns its id. Source detail remains transient and is resolved again when a
message uses it.

Navigating away may detach a browser stream, but it must not lose the server job
or durable messages. Reopening hydrates history and current job status through
the public API.

## Legacy route behavior

The configured Chat page path has composition-sensitive behavior:

- with active Studio Chat, it permanently redirects to the canonical workspace;
- without Studio Chat, it renders the standalone Web Chat page.

Query state is bounded and merged deliberately. Existing conversation hash
doors are translated during redirect migration. Anonymous callers follow the
correct login flow with a return target. `/api/chat/*` paths do not move.

## Phases

### Phase 1 — Publish the headless Chat boundary

- Tests first for every public request, response, path, and authorization-neutral
  client behavior.
- Add the `@rizom/brain/chat` entry, stable export ledger entries, declaration
  checks, and an external compatibility fixture.
- Move browser-safe session, history, streaming, upload, approval, action,
  progress, durable-job, and handoff schemas into the canonical shared source.
- Add a fetch-injected transport client. Keep reducers, active-conversation
  state, cache behavior, navigation, UI-message transforms, presentation copy,
  rendering, and browser storage out of this package.
- Make Web Chat handlers and the existing standalone transport consume the
  public schemas and client.
- Keep standalone `/chat` behavior unchanged.

Exit condition: a packed external consumer can use the complete supported Chat
client contract, handlers validate the same schemas, and standalone Web Chat
passes unchanged behavior tests.

### Phase 2 — Add the native Studio workspace

- Tests first: Studio without Chat has no descriptor; Studio + Chat admits
  Trusted/Admin and omits active Public; denied actors cannot load data.
- Add the closed built-in `StudioChatWorkspace` only when the public Chat
  capability is active.
- Extract only orchestration proven identical in both hosts into the private
  `@brains/chat-ui-model` workspace package; do not export it from
  `@rizom/brain`.
- Build the session rail, conversation, composer, uploads, approvals, progress,
  and actions as native Studio presentation using the public contract and any
  proven private shared orchestration.
- Use Studio routing, page grammar, context, responsive rules, and lifecycle.
- Keep standalone `/chat` available during this phase as a rollback door.

Exit condition: native Studio Chat supports the shipped Chat behavior without
mounting or importing the standalone application.

### Phase 3 — Durable routing and context handoff

- Add validated `session` URL state and update it on session selection,
  creation, archive, and deletion.
- Add the idempotent context-session operation with actor ownership and source
  permission checks.
- Replace reload-based handoffs with Studio router navigation to the returned
  conversation.
- Test repeat launch, refresh, copied URL, another browser, inaccessible ids,
  archive/delete, navigation during a stream, and source permission revocation.

Exit condition: no Studio Chat launch requires a page reload or browser-local
identity for restoration.

### Phase 4 — Composition-aware cutover

- Redirect the configured legacy page path only when Studio Chat is active.
- Retain standalone page and assets for Chat-without-Studio composition.
- Remove the standalone Chat console-strip entry when the Studio workspace owns
  the browser door; retain it in standalone composition.
- Update console, route-manifest, migration, package, and visual fixtures.

Exit condition: each composition exposes exactly one Chat door, old links
converge correctly, and no conversation-data migration is required.

## Validation

- Public API export ledger, declarations, exact-version external fixture, and
  packed compatibility test, including proof that no private UI-model subpath
  is exported.
- Exact route/admission matrix for anonymous, active Public, Trusted, and Admin.
- Trusted own-conversation and Admin cross-person access tests on every API used
  by either presentation.
- Optional-composition tests for all four capability combinations.
- Standalone behavior coverage for Chat-without-Studio.
- Native Studio session list, deep-link, history, streaming, upload, approval,
  action, archive, delete, and job-resume behavior.
- Same-origin mutation protection and bounded handoff schema rejection.
- Desktop and phone visual baselines for each host presentation.
- Redirect coverage for configured paths, query, fragments, and login return
  targets.

## Risks

- A mountable standalone client would make Studio Chat an application inside an
  application and block deeper UX integration. Only the headless model is
  shared.
- Duplicating request or domain-state shapes in each presentation would make
  the “public API” nominal rather than real. Handlers and both transports use
  one canonical schema source; view state remains host-owned.
- Publishing reusable UI orchestration would freeze presentation decisions into
  a patch-stable API. Proven common orchestration stays in an unpublished
  workspace package and is never re-exported from `@rizom/brain`.
- Treating a URL id as authorization can leak another person's conversation.
  Every read and mutation continues through Chat-owned access checks.
- An unconditional workspace creates a dead door in Studio-only brains.
  Availability derives from an explicit public Chat capability and is tested in
  every composition.
- Two visible Chat doors create product ambiguity. Once native parity passes,
  composition-aware routing exposes exactly one.
- Persisting resolved Inbox detail would move private source content into the
  conversation index. Only the locator and bounded title persist; detail is
  permission-checked again when used.
