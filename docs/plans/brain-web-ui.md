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
- **Frontend** — prefer Vercel **AI SDK UI** (`useChat`, transport API, stream protocol) over the Vercel **Chat SDK** platform-adapter package. The web UI needs browser chat ergonomics and streaming state, not Discord/Slack/Teams adapter plumbing. AI Elements is React/shadcn-based, so treat it as UX/component inspiration rather than a default v1 dependency unless we explicitly choose to ship React in the bundled UI.
- **Brain ↔ AI SDK adapter** — add a thin adapter that translates brain-native chat events (`AgentResponse`, progress, pending confirmations, tool results) into AI SDK UI-compatible stream parts. Do not model the brain as a raw AI SDK model provider in v1; the brain runtime remains the orchestration layer.
- **Routes** — `/chat` for the chat surface; existing `/dashboard` stays put. Navigation between them lives in the existing app shell. The message endpoint should speak an AI SDK UI-compatible protocol, e.g. `/api/chat` or `/chat/api/message`.
- **Conversation persistence** — reuse the existing conversation service. Each browser session maps to a `conversationId` like `web-${userId}-${sessionId}`.
- **Auth** — already wired. Passkey via auth-service grants anchor; trusted/public callers see the same permission tiers they get elsewhere.

## What this supersedes or narrows

- **Hosted Rover Discord gateway direction** — the previous plan's gateway + forwarded-chat + per-user routing model is no longer the direction. That plan has been deleted.
- **`chat-interface-sdk.md`** — parked. Multi-platform chat consolidation revisited only if a new platform (Slack/Teams/Matrix return) is actually prioritized.

## UI SDK direction

Use the Vercel **AI SDK UI** stream/transport contract as the preferred browser-chat integration point:

```text
AI SDK UI useChat/custom transport
  → authenticated POST /api/chat
  → WebChatInterface
  → AgentService.chat()
  → AI SDK UI-compatible SSE stream
```

This keeps the web UI aligned with a mature chat frontend contract while avoiding the complexity of the platform Chat SDK adapter model. The adapter boundary is:

```text
Brain AgentResponse/progress events ↔ AI SDK UI stream parts
```

Implementation notes:

- Prefer a custom transport if the default `useChat` request/response shape does not match the brain's auth/session/conversation requirements.
- Keep permission, conversation, confirmation, and tool orchestration in `MessageInterfacePlugin` / `AgentService`.
- Bias toward a Preact-native chat UI for v1, because the existing site/template stack is Preact-oriented and the bundled runtime should stay lightweight.
- Treat AI Elements as reference material for patterns — conversations, messages, reasoning blocks, tool-call displays, markdown/code rendering, attachments — not as a dependency unless we explicitly accept React + shadcn in the runtime.
- Treat the Vercel `chat` package / platform adapters as separate future work covered by `chat-interface-sdk.md`.

## v0 spike: Preact-native chat surface

Before committing to v1, run a timeboxed (~3–5 day) spike to verify the Preact-native direction is viable. The spike's job is to produce a real go/no-go signal, not a "looks fine" vibe.

### Pre-spike check

Quick maturity check on `shadcn-preact` (active maintenance, recent commits, open-issue trajectory). If the foundation is stale, the spike's premise is already weak — fall back to per-route React without spending the time.

### Spike scope

Build a working `/chat` route in Preact connected to a brain's `AgentService.chat()` via SSE. Must render all four:

1. **Streaming text messages** — chunk-by-chunk updates, partial-markdown handled gracefully (rendering incomplete markdown without flicker is the real test).
2. **Markdown rendering** with code blocks and syntax highlighting.
3. **Tool-call display** — collapsed/expanded tool invocations with parameters, results, status. The AI-specific pattern where `ai-elements` does real work; the hardest one to replicate.
4. **One confirmation prompt** — `pendingConfirmation` from `AgentResponse` rendered as something interactive.

Out of scope for the spike: attachments, conversation history sidebar, voice, theming, polished styling.

### Exit criteria

- ✅ **Pass:** All four work, code is maintainable, no Radix-style portal/focus issues from `shadcn-preact`, extrapolated v1 component cost looks like ≤2 weeks of pure UI work. Proceed Preact-native.
- ❌ **Fail:** `shadcn-preact` shows visible component bugs, tool-call rendering balloons into a from-scratch project, or extrapolated v1 cost reaches 3+ weeks of UI work. Fall back to **per-route React** with `ai-elements` (or `assistant-ui`) — `/chat` ships its own React bundle, other routes stay Preact, monorepo accepts the React version-sync overhead.

### Why this is the right next step

The Preact-native direction has lower long-term cost (single runtime, no two-stacks cognitive load) but higher upfront component-build cost. Per-route React is the inverse. The spike resolves the uncertainty about `shadcn-preact`'s maturity and AI-pattern coverage cheaply, before sinking weeks into either path.

## Open decisions

1. **Default landing.** Should opening the brain's root URL land you on the chat surface or the dashboard? My instinct: chat for a fresh install (the first thing a new user wants), dashboard once the brain has content. But a deterministic answer is simpler.
2. **Conversation history in v1.** Single active conversation, or sidebar with prior conversations? MVP can be single-conversation; history is a small follow-up.
3. **Attachments in v1.** File uploads through the chat UI are useful but not strictly required for a first ship. Defer if they add meaningful complexity.

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
