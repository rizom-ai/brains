# Web chat interface

`@brains/web-chat` provides the authenticated browser chat surface and its session APIs.

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
