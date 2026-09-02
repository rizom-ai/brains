# Web chat interface

`@brains/web-chat` provides the authenticated browser chat surface and its session APIs.

## Public boundary

`@rizom/brain/chat` owns the supported browser-safe domain schemas, paths, and
fetch-injected transport client. This package's route handlers and standalone
transport consume that canonical contract. The React application, AI SDK
adapters, query cache, active-conversation state, routing, browser storage,
copy, and styles remain private Web Chat presentation logic and are not
re-exported from `@rizom/brain`.

## Build

`bun run build` invokes `scripts/build-ui.ts`, which owns the browser target,
ESM output, minification, source maps, React deduplication, and the `@/` alias
through `Bun.build`. Web Chat has no second Vite build path.

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

The interface owns the universal Inbox **Discuss in chat** follow-up at its configured
mount for sources that support permission-checked detail. Its destination schema bounds a
one-shot prompt plus source/item identifiers and a safe label. The browser consumes the
handoff into a fresh conversation, keeps the reference in memory behind a removable context
chip, and never receives the source body. Attached turns re-authorize and resolve source
detail on the server, frame it as untrusted transient context, and omit it from stored user
text and reusable attachment references. Detaching, starting a new conversation, or
switching sessions clears the context; a reload does not create a durable mail-to-chat
binding.
