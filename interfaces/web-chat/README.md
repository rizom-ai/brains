# Web chat interface

`@brains/web-chat` provides the guest-facing Web Chat surface at `/ask` and
owns the shared Chat HTTP APIs. Native authenticated Chat is hosted by Studio
at `/chat`; the two presentations share the transport contract without sharing
browser components. The standalone surface carries a small public Ask masthead;
it does not restore the retired Dashboard/Chat/Studio product switcher.

## Public boundary

`@rizom/brain/chat` owns the supported browser-safe domain schemas, paths, and
fetch-injected transport client. This package's route handlers and standalone
transport consume that canonical contract. The React application, AI SDK
adapters, query cache, active-conversation state, routing, browser storage,
copy, and styles remain private Web Chat presentation logic and are not
re-exported from `@rizom/brain`.

## Audience boundary

The current release remains fail-closed:

- Studio Chat is limited to Trusted and Admin actors;
- standalone Web Chat at `/ask` remains authenticated until guest policy is explicitly enabled;
- active Public and unauthenticated callers have no Chat access.

The intended future split is Studio for authenticated actors, with a separately
restricted Public policy, and standalone Web Chat for explicitly enabled
anonymous guests. Neither `public: true` nor preview route reachability grants
guest access. It must remain disabled until guest identity, capability,
rate, abuse, spend, retention, consent, deletion, and kill-switch policies are
accepted and enforced server-side.

## Bounded preview authorization

With guest configuration omitted, the runtime derives the preview origin from
deployment context and reuses shared guest bounds. It stays off until an
administrator explicitly authorizes access. Existing `guest: false` blocks this
activation; `guest: local-test` remains a separate loopback-only test convention.

On the authenticated primary origin, `GET /api/chat/guest/access` reports the
proposed allowance and current usage without granting access or invoking a model.
`POST` accepts only `{"enabled":true}` or `{"enabled":false}`, requires an Admin
browser session and same-origin JSON request, and cannot override the origin,
limits or accounting. This is an operator HTTP action, not an Ops/YAML setting.

The current shared bounds authorize at most **two messages and $4 total** across
all visitors and time. Authorization and lifetime reservations are durable in the
existing CAS ledger. Failures, cleanup, retries, restart and disable/re-enable do
not refund or replenish them. An exhausted allowance cannot be renewed through
this action. Background generation/indexing is accounted separately.

Only declared guest routes and their presentation assets are served on preview.
Management and other APIs stay excluded there; primary-host guest requests remain
denied. Owned history and deletion remain available after exhaustion. Guest
credentials are HttpOnly cookies; optional conversation locators use sessionStorage,
not transcript storage. Closing a tab can lose its locators; this is not automatic
credential or locator recovery. Production guest access requires separate work
and approval.

## Build

`bun run build` invokes `scripts/build-ui.ts`, which owns the browser target, ESM output, minification, source maps, React deduplication, the `@/` alias, and compile-time StyleX extraction through `Bun.build`. It emits `app.js` plus static `app.css`; the browser receives no Babel plugin or runtime style injector. Web Chat has no second Vite build path.

Buttons, fields, selects, dialogs, and menus reuse `@brains/app-ui-react`, the same token-driven control vocabulary as Studio. Web Chat keeps its conversation-specific composition and AI elements local.

## State ownership

- The package-local TanStack `QueryClient` owns saved-session metadata and immutable stored-history snapshots.
- `Chat`/`useChat` from the AI SDK exclusively owns the active conversation's messages, transient parts, and stream state.
- Reopening a session fetches `webChatKeys.history(conversationId)`, copies that snapshot with `createActiveMessageSeed()`, and seeds the AI SDK owner. Never render or stream directly from the history query cache.
- Drawer, dialog, composer, upload notice, and other transient controls stay component-local.
- In the authenticated presentation, the durable conversation ID remains the AI SDK chat ID and is mirrored in localStorage for reload continuity. Anonymous guest locators follow the separate sessionStorage boundary described above.

## Query and mutation conventions

All server-state keys come from `ui-react/src/queries.ts`:

```ts
webChatKeys.sessions();
webChatKeys.history(conversationId);
```

Transport calls belong in `api.ts` or `mutations.ts`, not in components. Session mutations have targeted cache effects:

- rename updates only the matching session metadata;
- archive and delete remove the matching session metadata and history snapshot;
- successful sends and runtime actions invalidate the active history and refresh session metadata.

Do not persist the query cache or use it as a second active-message owner. Tests must cover exact request counts, encoded IDs, errors, and cache effects with `@brains/test-utils` `mockFetch` before a server-state path is migrated.

## Addressable state

An authenticated standalone conversation door uses `/ask#s/{encodedConversationId}`. The chat surface consumes the hash, reopens that session, then clears the transient door from the URL. Streaming blocks session switching so an active AI SDK stream cannot be replaced by a history seed.

The interface owns the universal Inbox **Discuss in chat** follow-up at its
configured mount for sources that support permission-checked detail. Its
destination schema bounds a prompt plus source/item identifiers and a safe
label. When native Studio Chat is available, the handoff idempotently opens an
actor-owned context session and routes Studio to it; the bounded locator remains
inspectable after reload. Chat-only composition retains the standalone one-shot
fallback. Both paths re-authorize and resolve source detail on the server, frame
it as untrusted transient context, and never persist or return the source body.
