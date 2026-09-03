# Web chat interface

`@brains/web-chat` provides the authenticated standalone Web Chat surface and
owns the shared Chat HTTP APIs. In Chat + Studio composition, an actor admitted
to Studio Chat is redirected there; Chat-only composition retains this
package's standalone presentation.

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
- standalone Web Chat is an authenticated fallback for Chat-only composition;
- active Public and unauthenticated callers have no Chat access.

The intended future split is Studio for authenticated actors, with a separately
restricted Public policy, and standalone Web Chat for explicitly enabled
anonymous guests. Guest mode is not implemented or implied by routes registered
with `public: true`. It must remain disabled until guest identity, capability,
rate, abuse, spend, retention, consent, deletion, and kill-switch policies are
accepted and enforced server-side.

## Build

`bun run build` invokes `scripts/build-ui.ts`, which owns the browser target, ESM output, minification, source maps, React deduplication, the `@/` alias, and compile-time StyleX extraction through `Bun.build`. It emits `app.js` plus static `app.css`; the browser receives no Babel plugin or runtime style injector. Web Chat has no second Vite build path.

Buttons, fields, selects, dialogs, and menus reuse `@brains/app-ui-react`, the same token-driven control vocabulary as Studio. Web Chat keeps its conversation-specific composition and AI elements local.

## State ownership

- The package-local TanStack `QueryClient` owns saved-session metadata and immutable stored-history snapshots.
- `Chat`/`useChat` from the AI SDK exclusively owns the active conversation's messages, transient parts, and stream state.
- Reopening a session fetches `webChatKeys.history(conversationId)`, copies that snapshot with `createActiveMessageSeed()`, and seeds the AI SDK owner. Never render or stream directly from the history query cache.
- Drawer, dialog, composer, upload notice, and other transient controls stay component-local.
- The durable conversation ID remains the AI SDK chat ID and is mirrored in localStorage for reload continuity.

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

A conversation door uses `#s/{encodedConversationId}`. The chat surface consumes the hash, reopens that session, then clears the transient door from the URL. Streaming blocks session switching so an active AI SDK stream cannot be replaced by a history seed.

The interface owns the universal Inbox **Discuss in chat** follow-up at its
configured mount for sources that support permission-checked detail. Its
destination schema bounds a prompt plus source/item identifiers and a safe
label. When native Studio Chat is available, the handoff idempotently opens an
actor-owned context session and routes Studio to it; the bounded locator remains
inspectable after reload. Chat-only composition retains the standalone one-shot
fallback. Both paths re-authorize and resolve source detail on the server, frame
it as untrusted transient context, and never persist or return the source body.
