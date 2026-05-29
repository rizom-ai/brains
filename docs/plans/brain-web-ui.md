# Plan: Brain web chat surface

## Status

MVP shipped — the code is the source of truth for what works today. This plan
now tracks open follow-ups only. Structured confirmations live in
[structured-chat-confirmations.md](./structured-chat-confirmations.md);
multi-platform adapter consolidation is parked in
[chat-interface-sdk.md](./chat-interface-sdk.md).

## Why this shape (load-bearing decisions)

1. **Bundled with `@rizom/brain`.** Every brain instance ships the chat surface.
   Not a separate package consumers opt into. The brain runtime serves the
   compiled UI from `node_modules/@brains/web-chat/dist/ui/app.js`; external
   sites do not bundle or host the React app themselves.
2. **Web-first, Discord optional.** Discord stays as one possible additional
   interface, not the primary one. Rover users bring their own Discord app
   token if they want it; Relay teams install per-team Discord apps. No shared
   bot, no per-user routing layer.
3. **Anchor-only by default.** The full `/chat` surface requires an
   operator/anchor session so page access, chat POSTs, conversation sessions,
   confirmations, and tool access share one permission model. Public/trusted
   chat is explicitly deferred until an abuse-control design exists.
4. **AI SDK UI transport, not the Vercel Chat SDK platform adapter.** The web
   UI needs browser chat ergonomics and streaming state, not platform-adapter
   plumbing. `WebChatInterface` extends `MessageInterfacePlugin`; the AI SDK
   transport replaces hand-written frontend fetch logic, not the interface
   plugin.
5. **React quarantined under `interfaces/web-chat/ui-react/`.** Mirrors the
   `interfaces/chat-repl` containment pattern: React deps live inside the route
   UI boundary, the dashboard and other site routes stay Preact, and a guard
   test fails if `react` imports appear outside the approved boundary.
6. **AI Elements is canonical for chat primitives.** Components come from the
   shadcn-style registry workflow (`npx ai-elements@latest add <component>`)
   and stay close to upstream behavior. Styling is ours via CSS classes/tokens;
   contracts and structure track upstream so we don't accumulate a homebrew
   fork.
7. **Progress feedback from day one.** Silent 10–30 second waits are not
   acceptable UX. Progress/status/final-response streaming is shipped; true
   token-by-token model streaming remains a later `AgentService` capability.

## Architecture

```text
browser
  → GET /chat                         (HTML shell)
  → GET /chat/assets/app.js           (compiled React chat bundle)
  → POST /api/chat                    (AI SDK UI transport request)
    → AI SDK UI stream response
      → WebChatInterface (MessageInterfacePlugin)
        → AgentService.chat()
          → tool/permission/conversation pipeline
```

Package layout:

```text
interfaces/web-chat/
  src/                                anchor-only route plugin + AI SDK UI stream endpoint
    web-chat-interface.ts             extends MessageInterfacePlugin
    config.ts
    index.ts
  ui-react/
    src/
      App.tsx                         full-page chat shell
      main.tsx                        createRoot mount for /chat
      ai-elements/                    AI Elements registry-derived components
        conversation.tsx              use-stick-to-bottom
        message.tsx                   Message/Content/Response with streamdown
        prompt-input.tsx
        tool.tsx
        data-parts.tsx                temporary bridge for backend data parts
        README.md                     adoption notes / divergences
      ui/                             local primitives below the AI Elements layer
      lib/
      styles.css
  test/
    web-chat-interface.test.ts
    react-containment.test.ts         fails if React imports leak outside ui-react
```

The brain ↔ AI SDK adapter translates brain-native chat events
(`AgentResponse`, progress, pending confirmations, tool results) into AI SDK UI
stream parts. The brain runtime stays the orchestration layer; we do not model
the brain as a raw AI SDK model provider.

Active session bookkeeping: `conversationId/channelId → active UI stream
writer`. Baseclass `sendMessageToChannel`, `sendMessageWithId`, and
`editMessage` write/update the active stream when present. **No-active-stream
policy:** in-flight UI events drop silently rather than persisting as
conversation messages or holding stream writers for disconnected sessions.
Durable job status remains in the job queue.

## Delivery contract

External sites do not fetch the chat UI from a separate hosted frontend. They
get it from the running brain server:

- `interfaces/web-chat` has a `build` script that generates `dist/ui/app.js`.
- `dist` is included in the package `files` list before publish.
- The release/publish pipeline runs `bun run --filter @brains/web-chat build`
  before packing/publishing.
- Runtime serving reads from package-local `dist/ui/app.js`; it must not depend
  on the consumer's site build, Vite/Next config, or React being installed by
  the external site.
- If `dist/ui/app.js` is missing, `/chat` may load but `/chat/assets/app.js`
  must fail clearly with `404 Web chat UI asset not built` rather than silently
  serving stale or empty UI.

Package/build tests prevent regressions in this contract: `build` exists, React
entrypoints are deduped in the UI bundle config, React/React DOM ranges stay
aligned, and `dist` is included in package `files`.

## Open follow-ups

### 1. Session refinements

Basic explicit sessions are implemented: list recent conversations, switch,
create new, remember last selected in browser storage. Loading/empty/error
states, rename, archive, and explicit delete are in place.

### 2. Outbound attachments / artifacts

Next attachment priority is brain/tool → user artifacts: generated images,
PDFs, exports, previews, and other downloadable results.

Protocol shape is now explicit: attachment-bearing agent output uses a
Brain-specific structured card with `kind: "attachment"`, translated by
`WebChatInterface` into an AI SDK UI `data-attachment` part. This keeps approval
cards on native AI SDK tool parts while giving brain-owned artifacts a stable
contract:

- `id`: stable card id
- `title` / optional `description`: display copy
- `attachment.mediaType`: MIME type
- `attachment.url`: view/resolve URL
- optional `attachment.downloadUrl`, `previewUrl`, `filename`, `sizeBytes`
- optional `attachment.source`: `{ entityType, entityId, attachmentType }`

Remaining decision before renderer work:

- **Blob serving.** Prefer existing attachment/media provider contracts for
  resolution and download routes rather than a new web-chat-only path.

Next implementation step: the React island renders `data-attachment` parts as
previews / download links / generic file cards.

### 3. Default landing route

`/chat` exists and is bundled. Whether the brain's root URL should land on
chat, the dashboard, or a small chooser remains a product call.

### 4. Inbound uploads

User → brain file uploads are separate from outbound artifacts. They require
multipart upload routes, auth/size/type checks, storage/registry integration,
and request schema changes to pass attachment refs into `AgentService.chat()`.
Defer until outbound artifact rendering is stable or a concrete use case forces
it earlier.

### 5. Richer AI Elements parts (protocol-gated)

Do not add `reasoning`, `sources`, `actions`, `suggestions`, or artifact UI as
standalone component work. Install the registry component only when the backend
emits the corresponding structured part or a concrete product surface needs it.

### 6. Deeper streaming

Token-by-token model streaming remains a later `AgentService` capability;
current progress/status/final-response streaming is enough for the MVP.

### 7. Per-release polish pass

Whenever the bundled web chat UI changes, run:

```sh
bun run --filter @brains/web-chat build
bun test interfaces/web-chat/test
bun run --filter @brains/web-chat typecheck
bun run --filter @brains/web-chat lint
```

Browser pass covers: empty state, sign-in required state, sending a message,
streaming markdown, code blocks and long-message overflow, session
switching/new-session, tool result collapse/expand, confirmation
approve/decline, light/dark mode, mobile drawer/header/action layout.

## Deferred

### Public / trusted chat

A public chat would be fun, but it has real token-abuse and tool-exposure
risks. Until an explicit abuse-control design exists, `/chat` should not
silently behave as public chat with broken or missing sessions. Likely
safeguards when revived:

- strict per-IP/session rate limits
- public-permission tools only
- short max response/token budget
- no durable operator-style session sidebar by default
- abuse logging and a deploy-level kill switch
- optional CAPTCHA, email gate, or invite token

### Dashboard chat widget

May eventually make sense, but should wait until there is a specific dashboard
placement and UX. When that happens, choose the implementation based on the
surface:

- If it can be isolated as a React island without colliding with the dashboard,
  it may reuse the AI Elements / AI SDK UI stack.
- If it must be a preact-native dashboard island, build only the minimal widget
  needed and keep it behind the same `/api/chat` protocol.

Do not preemptively fork a full mini-chat implementation.

## Related plans

- [structured-chat-confirmations.md](./structured-chat-confirmations.md) —
  unblocked now that AI Elements has landed; aligns confirmation UX across
  web-chat, Discord, and chat-repl behind a shared structured tool/approval
  contract. The biggest outstanding cross-interface workstream.
- [chat-interface-sdk.md](./chat-interface-sdk.md) — parked multi-platform
  Chat SDK adapter consolidation. Revisit only when Slack/Teams/Matrix lands.
