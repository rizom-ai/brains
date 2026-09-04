# Plan: Studio Chat integration

## Status

**Implemented and released.** The headless Chat contract, native Studio
workspace, durable context handoff, capability-gated admission, and canonical
`/chat` route are published without embedding the standalone Web Chat
application. The standalone guest-facing surface now lives at `/ask`; its guest
admission policy remains fail-closed.

## Shipped baseline

`interfaces/web-chat` owns the standalone `/ask` page, its browser bundle,
`/api/chat/*` routes, streaming, sessions, uploads, approvals, source
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
- Web Chat renders the separately named guest-facing `/ask` experience;
- both presentations consume the same public Chat domain and transport
  contract;
- neither presentation imports the other's implementation or reaches into shell
  internals;
- an authenticated actor admitted to Studio Chat stays at the canonical
  `/chat` door without exposing the encoded workspace implementation path;
- standalone Web Chat remains the architectural home for a future guest
  posture, but guest access stays disabled until its policies are complete.

The Studio presentation may evolve with Studio's page grammar, navigation,
entity context, workspace handoffs, and responsive behavior. It is not a routed
standalone application mounted inside a workspace, iframe, WebView, or opaque
React subtree.

## Composition matrix

| Active capabilities | Browser behavior                                 |
| ------------------- | ------------------------------------------------ |
| Chat + Studio       | Native Studio Chat workspace directly at `/chat` |
| Chat without Studio | Standalone guest-facing `/ask` page              |
| Studio without Chat | No usable Chat workspace; `/chat` fails closed   |
| Neither             | No browser Chat surface                          |

Platform Chat capabilities that do not require the browser remain independent
of this matrix.

### Audience posture

| Audience                     | Intended browser presentation                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| Admin / Trusted              | Native Studio Chat with admitted operator capabilities            |
| Authenticated Public         | Native Studio Chat with a future restricted Public capability set |
| Anonymous guest              | Future standalone visitor Chat, only when explicitly enabled      |
| Anonymous without guest mode | No Chat surface; use the configured authentication entry          |

The current implementation remains narrower: Studio Chat has a Trusted floor,
standalone Web Chat is an authenticated Chat-only fallback, and active Public
or unauthenticated callers receive no Chat access. The target audience split
does not authorize lowering those gates in this phase.

## Ownership and public boundary

### Chat domain

The Chat capability owns:

- conversation persistence and person ownership;
- permission checks and disclosure semantics;
- message submission and streaming;
- uploads and attachment access;
- approvals, actions, progress, and durable job state;
- source-context authorization;
- the authenticated standalone Web Chat fallback used when Studio is absent;
- the future guest-facing transport policy and standalone presentation.

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

The Web Chat interface retains its standalone presentation for authenticated
Chat-only instances today. Its long-term product role is the explicitly enabled
guest/visitor surface, not a second operator application. Authenticated actors,
including a future safely admitted Public tier, converge on Studio when their
policy allows it.

Web Chat consumes the same public headless API but owns its page shell and
composition. Shared domain and transport behavior belongs in the public
contract; proven presentation-neutral orchestration may live in the private UI
model; host-specific view state and layout stay with each host. Visitor Chat may
be visually simpler than Studio and must not inherit operator capabilities merely
because both use the same transport.

## Admission and disclosure

The current Studio workspace floor is Trusted. Admins may open any browser
conversation; Trusted people may open only conversations owned by their person
id. Public-rank sessions continue to see Account only. Every public Chat API
operation keeps its interface-owned session and conversation checks; reaching
the Studio shell is not authorization to read a conversation.

A future authenticated Public Studio workspace requires an explicit safe
capability policy before its floor changes. A future guest Web Chat posture is a
separate admission mode and remains off by default. It requires, at minimum:

- isolated guest identity and conversation ownership;
- a strict guest tool and model capability allowlist;
- no private source context, operator approvals, or cross-person discovery;
- bounded uploads, rate limits, spend limits, and abuse controls;
- explicit retention, deletion, consent, and disclosure behavior;
- non-disclosing errors and operational kill switches.

Route registration with `public: true` only makes an HTTP handler reachable; it
does not grant Public or guest Chat permission. Dashboard remains the anonymous
public card until an approved guest posture deliberately adds another door.

## Conversation URL and handoff

The canonical Studio browser location is:

```text
/chat?session=<conversation-id>
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

The configured Chat page path has composition- and actor-sensitive behavior:

- an authenticated actor admitted to Studio Chat remains at canonical `/chat`;
- the standalone Web Chat presentation is addressed independently at `/ask`;
- active Public and unauthenticated callers continue to fail closed today;
- a future guest uses standalone Web Chat only when a separate guest posture is
  explicitly enabled.

Query state is bounded and merged deliberately. Existing conversation hash
doors are translated during redirect migration. Until an approved guest
posture is enabled, anonymous callers follow the correct login flow with a
return target. `/api/chat/*` paths do not move.

## Local implementation checkpoint

The current implementation includes:

- the packed, browser-safe `@rizom/brain/chat` contract and stateless protocol
  decoder;
- actor-owned, idempotent context sessions whose bounded locator is returned in
  session metadata while resolved source detail remains transient;
- the capability-gated `web-chat:chat` workspace at the Trusted permission
  floor;
- native Studio sessions, manuscript conversation, working-context rail,
  composer, uploads, streaming, approvals, suggested actions, artifacts, and
  durable progress;
- canonical bounded `?session=` routing and native Inbox-to-Chat launch;
- canonical native `/chat` routing with standalone Web Chat moved to `/ask`
  and no Public or guest admission;
- desktop, tablet, and sequential phone visual baselines plus admission,
  routing, redirect, transport, interaction, and accessibility-oriented layout
  checks.

The remaining phase exit checks, release publication, and post-package
deployment validation remain explicitly approval-gated.

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
- Keep the then-standalone `/chat` behavior unchanged during this phase.

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
- Keep the then-standalone `/chat` available during this phase as a rollback door.

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

- Redirect the configured legacy page path only when the actor is admitted to
  active Studio Chat.
- Retain standalone page and assets for Chat-without-Studio composition.
- Remove the standalone Chat console-strip entry when the Studio workspace owns
  the browser door; retain it in standalone composition.
- Update console, route-manifest, migration, package, and visual fixtures.

Exit condition: each admitted actor sees exactly one Chat door, old links
converge correctly, and no conversation-data migration is required.

### Phase 5 — Explicit visitor Chat posture

This phase is intentionally blocked on accepted guest policy. It does not begin
by weakening the current authentication checks.

- Define guest identity, conversation isolation, consent, retention, deletion,
  rate, abuse, and spend policies as typed server-owned contracts.
- Define a strict guest capability allowlist independently from the
  authenticated Public and Trusted policies.
- Add an explicit default-off configuration switch and operational kill switch.
- Keep guests in standalone Web Chat; do not expose the Studio shell or
  operator context.
- Add adversarial tests for identity fixation, conversation enumeration, prompt
  injection, upload abuse, tool escalation, quota bypass, and private-data
  disclosure.

Exit condition: guest access is explicitly enabled, bounded, observable,
revocable, and unable to reach authenticated or operator-owned data.

## Validation

- Public API export ledger, declarations, exact-version external fixture, and
  packed compatibility test, including proof that no private UI-model subpath
  is exported.
- Exact route/admission matrix for anonymous guest, active Public, Trusted, and
  Admin, with guest access proven disabled by default.
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
- Two visible operator Chat doors create product ambiguity. Once native parity
  passes, composition- and actor-aware routing exposes exactly one.
- Treating `public: true` route registration as guest authorization would bypass
  the missing identity, abuse, spend, and retention policies. Guest admission
  remains a separate default-off server decision.
- Reusing the authenticated Public policy for anonymous guests would erase the
  ownership boundary. Public Studio Chat and guest Web Chat require distinct
  admission and capability contracts.
- Persisting resolved Inbox detail would move private source content into the
  conversation index. Only the locator and bounded title persist; detail is
  permission-checked again when used.
