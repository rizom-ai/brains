# Plan: Brain web chat surface

## Status

MVP shipped — the code is the source of truth for what works today. This plan
now tracks open follow-ups only. Structured confirmations shipped with the chat
surface; multi-platform adapter consolidation is parked in
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
   acceptable UX. Web-chat now streams durable UI events for progress, tool
   activity, approvals, attachments, and final assistant responses. We are not
   pursuing token-by-token model streaming without a clearer product need.

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

This section tracks only unfinished Rover/web-chat hardening work. Completed
session, confirmation, upload, document/image attachment, progress, and live
status slices are covered by package tests and Rover evals rather than kept as
open plan text.

### 1. Upload/import polish

Durable uploads, the unified `upload` ref kind, upload history rehydration,
operator-only upload downloads, conversation-scoped upload promotion, note
extraction, latest-upload semantics, filename selection, and the deck-carousel
upload-context regression are shipped.

Remaining upload work:

- browser-verify the released upload paths against a running Rover instance.

Upload import transform policy: `extract-markdown` is deterministic extraction,
not cleanup, rewriting, or summarization. Future cleanup/summarization should be
a separate explicit transform or follow-up action so markdown import remains
predictable.

### 2. Progress/status polish

Structured progress parts, live tool-status parts, active-channel routing, and
artifact `jobId` polling are shipped. Token-by-token model streaming is not on
the active roadmap.

Remaining progress work:

- browser-verify real tool-status and progress flows in Rover;
- polish failed/completed status copy and rendering based on observed sessions.

Progress transcript policy: pending/processing progress parts stay transient;
terminal completed/failed progress parts persist in transcript history so later
session loads keep the outcome visible.

### 3. Artifact attachment coverage

Document and image artifact cards are shipped. This is not active work until
another durable artifact kind actually appears, such as exports or preview
artifacts that are not saved as `document` or `image` entities.

For new artifact kinds:

- extend the same `data-attachment` contract;
- reuse existing attachment/media provider contracts where possible;
- avoid web-chat-only blob routes unless no shared provider exists;
- keep generated artifacts on `data-attachment` and uploads as input refs until
  the operator explicitly promotes/imports/saves them.

### 4. Richer AI Elements parts (protocol-gated)

Do not add `reasoning`, `sources`, `actions`, `suggestions`, or new artifact UI
as standalone component work. Install or customize a registry component only
when the backend emits the corresponding structured part or a concrete Rover
surface needs it.

Current protocol shape: `AgentResponse.cards` is the backend-owned extension
point for durable structured chat parts. It is already projected through the
public agent contract, remote eval bridge, web-chat stream writer, transcript
metadata, and browser history hydration. Current card kinds are
`tool-approval`, `attachment`, `sources`, and `actions`; web-chat maps those to
AI SDK UI parts rather than deriving UI from assistant text.

Retrieval source/citation cards are shipped as the first richer part. The
`sources` card kind streams as `data-sources` and carries source rows with `id`,
human label/title, source kind (`conversation-memory`, `entity`, `search`,
etc.), optional URL/entity ref, excerpt, and provenance. The first emitters are
explicit retrieval surfaces: agent-context retrieval emits a `Retrieved context`
sources card, structured `system_get` entity results emit a source, and
structured `system_search` results emit a capped, score-sorted `Retrieved
sources` card. Search sources preserve retrieval score in provenance and are
retrieval candidates, not inferred citations from free-form model text. Web-chat
renders `data-sources` with a dedicated sources part and falls back to generic
structured data for malformed payloads.

Suggested follow-up action cards are shipped as the second richer part. The
`actions` card kind streams as `data-actions`, persists through history, and
renders as a collapsible action list. Initial action types are deliberately safe:
`prompt` actions submit a visible prompt through the normal chat path, while
`event` actions are displayed disabled until a concrete runtime handler (such as
playbooks) binds them to existing permission/confirmation paths. The UI must not
execute hidden tool calls directly.

Remaining richer-part implementation order:

1. **Concise reasoning/status summaries.** Prefer existing progress and
   tool-status parts for operational state. If tool-heavy turns need a summary,
   add a compact `status-summary` card with user-facing bullet text and optional
   related job/tool ids. Avoid chain-of-thought or model-internal reasoning;
   this is an outcome/status summary only.

Acceptance bar for any new card kind:

- schema in `@brains/plugins` public agent contract;
- runtime mirror in `@brains/ai-service` types if the agent can emit it;
- public/remote response projection preserves it without leaking internals;
- web-chat stream writer maps it to a `data-*` UI part;
- transcript persistence and history hydration keep terminal/durable cards;
- package tests cover schema, stream output, and history rehydration;
- dedicated UI component work only when a backend emitter exists or a concrete
  Rover/product flow has committed to the card contract.

### 5. Per-release polish pass

Whenever the bundled web chat UI changes, run:

```sh
bun run --filter @brains/web-chat build
bun test interfaces/web-chat/test
bun test interfaces/web-chat/ui-react/src/ai-elements/attachment-part.test.tsx
bun test interfaces/web-chat/ui-react/src/progress-part.test.tsx
bun run --filter @brains/web-chat typecheck
bun run --filter @brains/web-chat lint
```

Browser pass covers: empty state, sign-in required state, sending a message,
assistant markdown, code blocks and long-message overflow, session
switching/new-session, rename/archive/delete, tool result collapse/expand,
confirmation approve/decline, upload pills/download links, generated attachment
cards/job polling, live tool status, progress cards, light/dark mode, and mobile
drawer/header/action layout.

### 6. Final landing route decision

Leave this until after the Rover browser hardening pass. `/chat` exists and is
bundled, but the root URL decision is a final product/navigation choice, not the
next hardening task.

When the remaining chat flows are verified, decide whether a brain's root URL
should route directly to `/chat`, keep the dashboard, or show a small chooser.

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

- [chat-interface-sdk.md](./chat-interface-sdk.md) — parked multi-platform
  Chat SDK adapter consolidation. Revisit only when Slack/Teams/Matrix lands.
