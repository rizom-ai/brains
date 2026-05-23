# Plan: Brain Web UI (bundled chat surface)

## Status

Proposed. Active near-term investment; reframes the previous hosted-Rover Discord gateway direction and narrows `chat-interface-sdk.md` to a web-first scope.

## Context

Today a user who wants to interact with their Rover has three options: install the CLI and use `brain chat` in a terminal, set up a Discord bot, or wire up MCP through a desktop assistant. None of these is a credible "click and try" path. The static sites and dashboard already render in the browser, but there is no in-browser way to actually _chat_ with the brain.

This gap forces every hosted/onboarding conversation to pick one of two bad framings: "Discord-first" (mandating per-user Discord setup) or "CLI-first" (mandating local terminal). A previous "hosted Rover Discord" plan tried to fix the Discord-first framing with a shared bot + gateway, which introduced significant accidental complexity (new transports, forwarded-chat package, SSE wire protocol, tracking keys) to solve a problem that disappears once Discord stops being load-bearing. That plan has been deleted in favour of this one.

A bundled web chat UI changes the framing:

- Primary UI = web. Every brain ships with a working chat surface at its own URL.
- Discord = optional integration. A user who wants `@MyRover` in their DMs creates their own Discord app (one-time, ~5 minutes) and pastes the token into their config. No gateway, no shared bot, no routing layer.
- The same shape applies to Relay: web UI for admin/config, Discord installed per-team for native team-channel use.

## Goals

- Every `@rizom/brain` install has a working web chat surface out of the box.
- A new user can `brain init`, `brain start`, open the brain's URL, and chat with their brain — no Discord, no MCP, no CLI prerequisites.
- Long AI responses give visible "thinking…" / streaming feedback from day one.
- The web UI complements the existing dashboard; it does not replace it.
- The Discord interface (`@brains/discord`) keeps working exactly as today for users who want it.

## Non-goals

- Replacing the dashboard or absorbing CMS/admin flows into v1.
- Multi-platform chat adapters (Slack/Teams/etc.) in v1 — those become optional later additions, not load-bearing.
- A hosted gateway that forwards Discord messages between users and per-user brain instances.
- Per-user shared Discord bot tokens.
- Standalone front-end app distributed separately from the brain runtime.

## Decisions

1. **Bundled with `@rizom/brain`.** Every brain instance has the web UI. Not a separate package consumers opt into.
2. **Coexists with the dashboard.** The dashboard keeps owning status/widgets; chat is a new surface alongside it. Shared navigation is fine.
3. **Web-first, Discord optional.** Discord stays as one possible additional interface, not the primary one. The previous "hosted Rover Discord gateway" direction is dropped.
4. **Bring-your-own Discord app.** Users who want Discord create their own app and paste the token in. No shared `@Rover` bot, no per-user routing.
5. **Per-team Discord apps for Relay.** A team admin installs the team's own Discord app once when setting up Relay; Relay lives in the team's existing server channels.
6. **Streaming/progress feedback from v1.** No "v1 ships without progress indicators." Silent 10–30 second waits are not acceptable UX.

## Architecture sketch

The chat UI is a new `MessageInterfacePlugin` variant mounted on the existing webserver:

```text
browser (chat UI)
  → HTTP POST /chat/message  (initial request)
    → SSE response stream    (progress, edits, final response)
      → WebChatInterface (MessageInterfacePlugin)
        → AgentService.chat()
          → existing tool/permission/conversation pipeline
```

Concrete components:

- **`interfaces/web-chat/`** — new package, extends `MessageInterfacePlugin`. Owns HTTP routes, SSE streaming, request authentication (via existing `@brains/auth-service` passkey flow), and the browser UI assets.
- **Frontend** — prefer Vercel **AI SDK UI** (`useChat`, transport API, stream protocol) over the Vercel **Chat SDK** platform-adapter package. The web UI needs browser chat ergonomics and streaming state, not Discord/Slack/Teams adapter plumbing. Because AI Elements and assistant-ui are React-first, v0 should test a quarantined React route rather than forcing the chat UI through Preact.
- **Brain ↔ AI SDK adapter** — add a thin adapter that translates brain-native chat events (`AgentResponse`, progress, pending confirmations, tool results) into AI SDK UI-compatible stream parts. Do not model the brain as a raw AI SDK model provider in v1; the brain runtime remains the orchestration layer.
- **Routes** — `/chat` for the chat surface; existing `/dashboard` stays put. Navigation between them lives in the existing app shell. The message endpoint should speak an AI SDK UI-compatible protocol, e.g. `/api/chat` or `/chat/api/message`, and must be registered/owned by `WebChatInterface` rather than bypassing the brain interface layer.
- **Conversation persistence** — reuse the existing conversation service. Each browser session maps to a `conversationId` like `web-${userId}-${sessionId}`.
- **Auth** — already wired. Passkey via auth-service grants anchor; trusted/public callers see the same permission tiers they get elsewhere.

## What this supersedes or narrows

- **Hosted Rover Discord gateway direction** — the previous plan's gateway + forwarded-chat + per-user routing model is no longer the direction. That plan has been deleted.
- **`chat-interface-sdk.md`** — parked. Multi-platform chat consolidation revisited only if a new platform (Slack/Teams/Matrix return) is actually prioritized.

## UI SDK direction

Use the Vercel **AI SDK UI** stream/transport contract as the preferred browser-chat integration point:

```text
AI Elements or custom React components
  → @ai-sdk/react useChat
  → DefaultChatTransport/custom ChatTransport
  → authenticated POST /api/chat
  → WebChatInterface route handler
  → MessageInterfacePlugin flow
  → AgentService.chat()
  → AI SDK UI-compatible stream
```

This keeps the web UI aligned with a mature chat frontend contract while avoiding the complexity of the platform Chat SDK adapter model. AI Elements is only a React component layer; it is not the transport. `DefaultChatTransport` (or a custom `ChatTransport` if needed) is the browser protocol layer, and `WebChatInterface` remains the backend interface implementation.

The adapter boundary is:

```text
Brain AgentResponse/progress events ↔ AI SDK UI stream parts
```

Implementation notes:

- Start with `DefaultChatTransport({ api: "/api/chat", credentials: "include" })`; use request preparation hooks for session/conversation metadata where possible.
- Prefer a custom transport only if the default `useChat` request/response shape cannot support the brain's auth/session/conversation/reconnect requirements.
- Do not use `DirectChatTransport` for the browser route; it would couple UI directly to an AI SDK agent shape and bypass the brain runtime abstractions.
- Keep permission, conversation, confirmation, and tool orchestration in `MessageInterfacePlugin` / `AgentService`.
- Bias toward a quarantined React route for v0/v1 if it can be cleanly isolated from the existing Preact site/dashboard stack. This mirrors the existing Ink/CLI solution: real React where the React ecosystem is required, behind a hard package/runtime boundary.
- Treat AI Elements and assistant-ui as viable dependencies inside that isolated route only. They must not pull React imports/types into shared/server packages or the Preact dashboard/site runtime.
- Treat the Vercel `chat` package / platform adapters as separate future work covered by `chat-interface-sdk.md`.

## Interface-plugin boundary

`WebChatInterface` must extend `MessageInterfacePlugin<WebChatConfig>`. The AI SDK transport replaces hand-written frontend fetch logic; it does **not** replace the brain interface plugin.

Backend shape:

```typescript
export class WebChatInterface extends MessageInterfacePlugin<WebChatConfig> {
  protected override async onRegister(context: InterfacePluginContext) {
    await super.onRegister(context);

    // register /chat page/assets
    // register /api/chat endpoint
  }

  // send/edit methods write to the active web stream/session
}
```

Runtime flow:

```text
/api/chat route
  → WebChatInterface.handleChatRequest()
    → authenticate request / resolve session
    → derive permission + conversation context
    → startProcessingInput()
    → check pending confirmation
    → context.agent.chat(...)
    → translate AgentResponse/progress to AI SDK UI stream parts
    → endProcessingInput()
```

`MessageInterfacePlugin` remains the source of shared message-interface behavior: processing state, buffered completion/progress handling, confirmation flow, progress/job subscriptions, and consistent `AgentService` use.

Because web chat replies over a per-request stream rather than a persistent Discord/terminal channel, `WebChatInterface` may need a small active-session registry:

```text
conversationId/channelId → active UI stream writer
```

The baseclass `sendMessageToChannel`, `sendMessageWithId`, and `editMessage` implementations can then write/update the active stream when present. If no stream is active, progress/completion events can be ignored, buffered, or persisted later depending on v1 scope.

## v0 spike: quarantined React chat route

Before committing to v1, run a timeboxed (~3–5 day) spike to verify that a React chat surface can be cleanly isolated from the existing Preact runtime. The spike's job is to produce a real go/no-go signal, not a "looks fine" vibe.

This follows the precedent from `interfaces/chat-repl`: Ink needs real React, so `@brains/chat-repl` owns its React deps, has its own `jsxImportSource: "react"`, dynamically imports Ink/React at runtime, and keeps React out of shared/server code. `/chat` should use the same containment principle.

### Isolation shape

Single workspace package with internal subdirectories, matching the existing `interfaces/chat-repl` shape for consistency:

```text
interfaces/web-chat/
  src/              # WebChatInterface server/plugin code; no React imports
  ui-react/         # isolated React route app; owns React deps + tsconfig
```

Splitting into two workspaces (`interfaces/web-chat` + `interfaces/web-chat-react-ui`) is a fallback only if the spike surfaces concrete dependency or build-isolation problems that the single-package shape cannot solve.

Containment rules:

- React imports are allowed only inside the route UI boundary.
- The server/plugin side communicates with the UI only through HTTP/SSE contracts, not shared React state/components.
- Do not use `preact/compat` as the first approach for AI Elements/assistant-ui.
- Existing dashboard/site routes remain Preact.
- Add a guard/test that fails if `react` imports appear outside the approved route UI boundary.

### Spike scope

Build a working `/chat` route in React connected to a brain's `AgentService.chat()` via SSE. Must render all four:

1. **Streaming text messages** — chunk-by-chunk updates, partial-markdown handled gracefully (rendering incomplete markdown without flicker is the real test).
2. **Markdown rendering** with code blocks and syntax highlighting.
3. **Tool-call display** — collapsed/expanded tool invocations with parameters, results, status. The AI-specific pattern where `ai-elements` does real work; the hardest one to replicate.
4. **One confirmation prompt** — `pendingConfirmation` from `AgentResponse` rendered as something interactive.

Out of scope for the spike: attachments, conversation history sidebar, voice, theming, polished styling.

### Exit criteria

- ✅ **Pass:** React route bundles only for `/chat`; React imports/types stay inside the approved UI boundary; AI Elements/assistant-ui can render streaming messages, markdown/code, tool-call panels, and confirmations quickly; dependency/version management remains sane. Proceed with the quarantined React route.
- ❌ **Fail:** React or shadcn/Radix types leak into shared/server/Preact packages, route bundling requires invasive app-wide build changes, or dependency/version management repeats the earlier monorepo pain. Fall back to a Preact-native stream client and use AI Elements only as reference material.

### Why this is the right next step

The Preact-native direction has lower long-term runtime surface, but likely turns AI-specific UI into a custom component-library project. A quarantined React route is more pragmatic if the isolation holds: `/chat` gets the mature AI UI ecosystem while the rest of the brain stays Preact. The spike resolves the real uncertainty — React containment — before sinking weeks into either path.

## Open decisions

1. **Default landing.** Should opening the brain's root URL land you on the chat surface or the dashboard? My instinct: chat for a fresh install (the first thing a new user wants), dashboard once the brain has content. But a deterministic answer is simpler.
2. **Conversation history in v1.** Single active conversation, or sidebar with prior conversations? MVP can be single-conversation; history is a small follow-up.
3. **Attachments in v1.** File uploads through the chat UI are useful but not strictly required for a first ship. Defer if they add meaningful complexity.

### Spike target for the React UI dependency

Test **AI Elements** first as the React UI inside the quarantined route. It's first-party Vercel, tightest with AI SDK UI, and has the most coverage for AI-specific patterns (streaming, tool calls, reasoning, attachments). Use `assistant-ui` or a small custom React UI on top of AI SDK UI as fallbacks only if AI Elements hits dealbreaker issues during the spike. Comparing all three within the 3–5 day timebox dilutes the containment signal that's the real point.

## Validation

- A fresh `brain init` + `brain start` exposes a working chat UI at the brain's URL with no extra setup.
- Streaming progress is visible during multi-second AI responses.
- Auth gates the chat surface to the right permission tier.
- Existing Discord, MCP, and CLI interfaces continue to work unchanged.
- Rover, Ranger, and Relay all get the same chat surface; team-shared UX cues for Relay (header indicating team context) are added once Relay-specific work lands.

## Done when

1. `@rizom/brain` ships a bundled web chat UI mounted at the brain's URL.
2. New users can chat with their brain in a browser with no Discord, MCP, or CLI prerequisite.
3. Streaming/progress feedback works for long responses.
4. The dashboard continues to work alongside chat.
5. `chat-interface-sdk.md` stays parked; multi-platform adapter consolidation only revives when a new platform is actually prioritized.
