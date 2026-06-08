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

### 1. Session refinements

Basic explicit sessions are implemented: list recent conversations, switch,
create new, remember last selected in browser storage. Loading/empty/error
states, rename, archive, and explicit delete are in place.

### 2. Outbound attachments / artifacts

Document attachments are shipped end to end: `AgentService` carries attachment
metadata on results, `WebChatInterface` translates attachment-bearing
message-interface events into AI SDK UI data parts, and the React island
renders document previews / download links through `ai-elements/data-parts.tsx`.

Protocol shape is now explicit: attachment-bearing agent output uses a
Brain-specific structured card with `kind: "attachment"`, translated by
`WebChatInterface` into an AI SDK UI `data-attachment` part. This keeps approval
cards on native AI SDK tool parts while giving brain-owned artifacts a stable
contract:

- `id`: stable card id
- optional `jobId`: queued generation job to poll for readiness
- `title` / optional `description`: display copy
- `attachment.mediaType`: MIME type
- `attachment.url`: view/resolve URL
- optional `attachment.downloadUrl`, `previewUrl`, `filename`, `sizeBytes`
- optional `attachment.source`: `{ entityType, entityId, attachmentType }`

Existing PDF document generation now returns predicted attachment metadata for
chat surfaces, and web-chat serves generated document entities through the
operator-only `/api/chat/attachments/document?id=...` route. Generated image
creation now follows the same `data-attachment` card path with predicted image
metadata and an operator-only `/api/chat/attachments/image?id=...` route for
view/download. The React island renders `data-attachment` parts as previews /
download links / generic file cards, and polls `/api/chat/jobs/status?id=...`
for queued artifacts so links stay disabled until the generation job is ready.

Remaining:

- extend the same attachment-data-part path to other durable artifact kinds
  (PDF non-document outputs, exports, previews) instead of treating each
  artifact kind as a one-off renderer;
- confirm download routes for new artifact kinds reuse the existing
  attachment/media provider contracts rather than a web-chat-only blob path.

### 3. Default landing route

`/chat` exists and is bundled. Whether the brain's root URL should land on
chat, the dashboard, or a small chooser remains a product call.

### 4. Inbound uploads

User → brain uploads are now routed through durable web-chat upload refs. The
prompt accepts `.md`, `.txt`, and `.markdown` text files up to the shared
message-interface text-upload size limit, plus supported native model file
attachments (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.pdf`) up to the
web-chat file-upload limit. The browser posts files to `/api/chat/uploads`, then
sends AI SDK `data-upload` parts into `/api/chat`. The server resolves those
refs into native `AgentService.chat()` attachments: text uploads project into
the current model turn using the compatibility `User uploaded a file "..."`
format, while binary file uploads are forwarded as model file parts.

The active chat transcript shows attached filenames on submitted user messages,
so upload validation/submission success is visible even if the later agent
response times out. The prompt area also shows transient upload notices for
client validation, handoff success, and server-side upload validation failures.
Browser verification confirmed the primary multipart flow: files upload to
`/api/chat/uploads` first, and `/api/chat` receives durable `data-upload` refs
rather than inline file content.

Initial durable upload protocol slice exists: operator-only
`POST /api/chat/uploads` accepts multipart text and supported binary file
uploads, validates explicit media policies, stores content plus metadata under
the runtime web-chat upload store (`data/web-chat/uploads` for standard
instances, not synced `brain-data`), and returns a `web-chat-upload` ref. The
chat endpoint also accepts AI SDK `data-upload` parts carrying those refs and
resolves stored content into native `AgentService.chat()` attachments. Legacy
inline AI SDK `file` parts use the same native attachment path. The agent
service still projects text attachments into the current model turn using the
existing text-upload prompt format for compatibility, but sends binary uploads
as model file parts; the stored user message remains the user's text instead of
an upload-content blob. Attachment-only turns are treated as a handoff, not an
instruction: the assistant acknowledges the upload and asks what the operator
wants to do next without invoking the model or tools. The React prompt now
uploads selected files first, then sends `data-upload` refs through the AI SDK
message parts protocol.

Session reloads preserve stored upload metadata as AI SDK `data-upload` parts
so transcript rendering can continue to show attachment filename pills. Upload
responses and rehydrated refs include operator-only `/api/chat/uploads?id=...`
links, and the same route can serve stored uploads back to the browser for
review/download. Filesystem persistence, metadata/ref validation, URL building,
and retention pruning now live in a focused `WebChatUploadStore` helper rather
than in the route handler. Upload media policy is explicit in
`upload-policy.ts`: text uploads stay `.md`, `.txt`, and `.markdown` / text MIME
only, 100KB max, UTF-8 text required, and binary payloads rejected even with text
filenames or MIME types; native file uploads are restricted to supported
image/PDF MIME types with signature checks and a 5MB max.

Upload refs are chat-context attachments by default. They should not become
content entities unless the operator explicitly asks to save or import them.
Raw-file promotion preserves the original artifact: PDFs promote to `document`
and images promote to `image` through explicit `system_create({ entityType:
"document" | "image", upload: { kind: "web-chat-upload", id } })` calls.
`system_create` validates that the upload ref appears in the current
conversation before forwarding it to the entity plugin, and the receiving plugin
validates media type and ref existence before persisting. Markdown
import/extraction is a separate explicit flow: "turn this PDF into a note"
resolves the upload, extracts text with deterministic PDF extraction in
`@brains/document` (`pdfjs-dist`), then creates a markdown entity such as
`base`/note using `system_create({ entityType: "base", upload, transform:
"extract-markdown" })`. Any future LLM pass should be limited to cleanup or
summarization after deterministic extraction. Derived entities (such as decks
generated from a PDF) should be created from an explicit user instruction that
consumes the upload as context. Bare upload handoff must not create, update, or
delete entities.

Follow-up turns in the same conversation should consume recent upload refs
without forcing the operator to reattach the file. For example, after a bare
image upload acknowledgement, "describe that picture" should resolve the
previous upload ref, attach the stored image bytes to that model turn, and answer
from the image content. If the operator asks to save/import/promote an uploaded
image or PDF, the selected upload must be promoted via `system_create(...,
upload: ...)`; the assistant must not fall back to generated image/document jobs
from the filename or surrounding chat text.

This deferred upload/attachment continuity is not a web-chat behavior. It should
live in the shared message/agent layer so web-chat, Discord, chat-repl, Telegram,
and future transports all resolve recent attachments the same way. Interfaces
should remain responsible for transport-specific parsing, validation, upload
storage routes, and converting inbound files to `ChatAttachment[]`; the shared
agent/conversation layer should own recent attachment context, selected-upload
continuity, and any clarification state needed before model invocation. A
clarification answer such as "the latest one" must be resolved to a concrete
upload ref (or re-ask) before the model sees the turn; raw selection text should
not be allowed to trigger unrelated generation.

Runtime upload storage now lives behind the shared plugin-context upload
registry/service. Web chat scopes that service to `web-chat` and keeps the same
`web-chat-upload` ref contract and `/api/chat/uploads` routes, while runtime
path normalization (`brain-data` → sibling `data`) is centralized for future
interfaces/plugins. The ref kind remains a compatibility detail for the current
web-chat upload route; user-visible copy should say "uploaded file" or "chat
upload", not expose implementation-specific ref names.

Existing web-chat deferred reuse covers some common paths (exact filename
references, positional references such as "the most recent image", and stored
upload metadata after session reload), but this should be treated as an interim
slice until the shared attachment-continuity layer replaces interface-local
intent and disambiguation logic.

Current known regression to preserve through the extraction:

- Scenario: the operator uploads an image, receives the bare-upload
  acknowledgement, then says "can you save it as an image".
- Expected: the latest relevant uploaded image is selected as chat context and
  the model/tool path promotes the original upload with
  `system_create({ entityType: "image", upload: { ... } })`.
- Forbidden: generating a new image job from the uploaded filename/title or from
  surrounding chat text. Saving/importing/promoting an upload must never fall
  back to prompt-based image generation when an upload ref is available or a
  clarification is still unresolved.
- Related clarification case: if the assistant has asked "Which upload should I
  use?", a positional answer such as "the latest one" / "the last one" must be
  resolved to a concrete prior upload ref (or re-ask) before model invocation.
  Raw clarification text must not be sent to the model as a standalone request.
- Regression proof: `brains/rover/test-cases/multi-turn/web-chat-image-upload-save-follow-up.yaml`
  covers the save-as-image path and asserts `upload` is present and `prompt` is
  absent on `system_create`.

Extraction-first plan:

1. Extract upload/attachment continuity out of `interfaces/web-chat/src/web-chat-interface.ts`.
   The 3000+ LOC interface should not own intent regexes, candidate ordering,
   same-conversation attachment recovery, or clarification semantics.
2. Put transport-neutral continuity in a shared message/agent layer with focused
   tests for candidate ordering, latest/current selection, and clarification
   resolution.
3. Rewire web-chat to call the shared layer while retaining only HTTP/UI upload
   plumbing locally.
4. After extraction, fix the regression in the shared layer and rerun the Rover
   upload evals plus targeted interface tests.

Remaining upload work:

- move deferred upload/attachment continuity out of `interfaces/web-chat` and
  into a shared message/agent layer, with transport-neutral tests proving latest
  attachment reuse, clarification resolution, and "save uploaded file" promotion
  across interfaces;

- continue hardening the explicit markdown import/extraction contract for
  text/PDF uploads. The first slice supports
  `system_create({ entityType: "base", upload: { kind: "web-chat-upload", id },
transform: "extract-markdown" })` and deterministic PDF extraction in
  `@brains/document`; future work can add job-backed extraction for large PDFs
  and optional cleanup/summarization after deterministic extraction;
- keep upload promotion separate from generated artifact cards: generated
  artifacts stay on `data-attachment`, while uploads stay input refs until a
  user asks to promote them.

### 5. Richer AI Elements parts (protocol-gated)

Do not add `reasoning`, `sources`, `actions`, `suggestions`, or artifact UI as
standalone component work. Install the registry component only when the backend
emits the corresponding structured part or a concrete product surface needs it.

### 6. Structured progress / job events

Legacy job/progress notifications can still surface as raw text such as
`✅ batch processing: ... completed`. That is a text-transport concern, not the
browser chat protocol. `/chat` should not parse, strip, or beautify those strings
for new events.

Implemented first slice: live web-chat progress events bypass the legacy text
formatters and cross the interface boundary as AI SDK custom data parts with
semantic fields instead of formatted display text:

```ts
{
  type: "data-progress",
  id: "progress:job-123",
  data: {
    status: "processing" | "completed" | "failed",
    operationType: "batch_processing",
    operationTarget: "/brain-data",
    message: "Finished indexing 24 files",
    progress: { current: 24, total: 24, percentage: 100 }
  }
}
```

React renders labels/icons/colors from `status` and plain fields; it should not
regex emoji, markdown, or human-formatted backend strings. Existing historical
messages may remain plain text, but new live `/chat` progress must bypass legacy
`formatProgressMessage()` / `formatCompletionMessage()` display strings.

Routing rule: emit a progress part only when the event is explicitly scoped to
`interfaceType: "web-chat"` and the `channelId` matches an active web-chat
stream. Background/batch jobs without an active web-chat channel stay silent in
the transcript. Async artifacts should use attachment/job polling rather than
injecting late raw completion messages.

Agent tool activity now surfaces while a web-chat turn is in flight.
`MessageInterfacePlugin` subscribes to existing `tool:invoking`,
`tool:completed`, and `tool:failed` events, exposes a no-op base hook, and
`WebChatInterface` translates matching active-channel events into transient
`data-status` parts such as `Using <toolName>…`. The React island uses those
status data parts to replace the generic waiting phrase while tools run.

Remaining progress work: decide whether completed progress parts should be
persisted as transcript history or remain live-only. For artifact readiness,
keep using attachment `jobId` polling unless a broader durable notification
model is introduced.

### 7. Responsiveness roadmap

Token-by-token model streaming is intentionally not on the active roadmap. The
highest-value responsiveness gap was opaque tool/job waits; that is now covered
by structured progress and live tool-status events without changing the core
`AgentService.chat()` generate-to-completion contract.

Do not start model-token streaming unless user feedback shows final answer text
latency is a materially bigger problem than tool/status visibility. If revived,
open a fresh design first; the known risks are approval safety, abort/cancel
threading, conversation persistence, usage accounting, and xstate turn
completion semantics.

Near-term responsiveness work should stay smaller: browser-verify real tool
status flows, polish status copy/rendering, and tighten failed/completed status
semantics before changing AI-service streaming contracts.

### 8. Per-release polish pass

Whenever the bundled web chat UI changes, run:

```sh
bun run --filter @brains/web-chat build
bun test interfaces/web-chat/test
bun run --filter @brains/web-chat typecheck
bun run --filter @brains/web-chat lint
```

Browser pass covers: empty state, sign-in required state, sending a message,
assistant markdown, code blocks and long-message overflow, session
switching/new-session, tool result collapse/expand, confirmation
approve/decline, upload pills/download links, live tool status, light/dark mode,
and mobile drawer/header/action layout.

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
