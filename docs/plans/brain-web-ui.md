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
- **Frontend** — Vercel Chat SDK is a strong candidate: it solves mdast rendering, message threading, streaming UI, attachments. Evaluate alternatives (custom Preact, AI Elements directly) before committing.
- **Routes** — `/chat` for the chat surface; existing `/dashboard` stays put. Navigation between them lives in the existing app shell.
- **Conversation persistence** — reuse the existing conversation service. Each browser session maps to a `conversationId` like `web-${userId}-${sessionId}`.
- **Auth** — already wired. Passkey via auth-service grants anchor; trusted/public callers see the same permission tiers they get elsewhere.

## What this supersedes or narrows

- **Hosted Rover Discord gateway direction** — the previous plan's gateway + forwarded-chat + per-user routing model is no longer the direction. That plan has been deleted.
- **`chat-interface-sdk.md`** — parked. Multi-platform chat consolidation revisited only if a new platform (Slack/Teams/Matrix return) is actually prioritized.

## Open decisions

1. **Vercel Chat SDK vs. alternatives.** Chat SDK is the obvious candidate but couples to a specific frontend stack; lighter-weight alternatives (custom Preact + the AI SDK streaming primitives, or AI Elements) may fit better given the brain already ships Preact for site templates.
2. **Default landing.** Should opening the brain's root URL land you on the chat surface or the dashboard? My instinct: chat for a fresh install (the first thing a new user wants), dashboard once the brain has content. But a deterministic answer is simpler.
3. **Conversation history in v1.** Single active conversation, or sidebar with prior conversations? MVP can be single-conversation; history is a small follow-up.
4. **Attachments in v1.** File uploads through the chat UI are useful but not strictly required for a first ship. Defer if they add meaningful complexity.

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
