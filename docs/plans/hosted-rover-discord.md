# Plan: Hosted Rover Discord UX (DM-only + Internal Forwarding + A2A Mesh)

## Context

Hosted Rover needs a Discord UX that supports many user-specific agents. Design exploration mapped an unwinnable triangle:

- distinct per-user agent identity in Discord
- shared community space (rovers visible to each other)
- self-service onboarding (no manual Discord Developer Portal step)

Discord's model is "humans are members, bots are tools." Each workaround addresses one corner and breaks another:

- **Webhook impersonation (PluralKit-style)** gives distinct identities in shared rooms but breaks in DMs and adds UX seams (`APP` tag, can't be @mentioned or DM'd, member list still shows one `@Rover`).
- **Per-user bot tokens** require a manual Discord Developer Portal step per user; Discord exposes no API for programmatic application/bot creation.
- **Shared bot in a shared server** makes everyone see one `@Rover` identity with no per-user distinction.

External signal: every product whose value prop is per-user distinct AI identity (Character.AI, Replika, Pi) built their own client and is not Discord-native.

**Decision: drop the shared-community corner.** Scope hosted Discord interaction to 1:1 DMs between each user and a single shared `@Rover` bot. Rover-to-rover communication moves to A2A — entirely off Discord's surface.

## Goal

- one shared `@Rover` user-installable Discord app
- one DM channel per user, routed by `discord_user_id → rover instance` in a central `rover-gateway` plugin running on Ranger
- A2A as the inter-rover mesh, gated by the existing agent-directory approval model

## Why DM-only works

In a 1:1 DM, identity ambiguity is structurally impossible. Only two parties exist — the user and `@Rover` — so `@Rover` _is_ their rover by virtue of being in their DM. No webhook tricks, no `APP` personas, no member-list lies.

Routing collapses to a single key: the Discord user id.

Self-service signup becomes clean: install `@Rover` to your Discord account (user-installable apps require no Manage Server permission), open a DM, talk. No Developer Portal, no token paste, no per-user bot creation.

One shared bot token is safe because each DM is an independent conversation context — no event duplication, no rate/session conflicts across rovers.

The constraint set stops being a triangle and becomes a tractable two-axis problem (identity + onboarding), both sidestepped by DM scoping.

## Architecture

Human ↔ rover (Discord DM):

```text
discord user (alice)
  → DM with @Rover                       [user-installable app, one shared token]
    → ChatInterface (interfaces/chat/)   [gateway endpoint, owns Discord connection via Chat SDK]
      → router callback                  [registered by rover-gateway plugin]
        → resolve discord_user_id → alice's rover endpoint
          → HTTP POST + SSE → alice's rover ForwardedChatInterface
            → AgentService.chat()
              → SSE events stream back: progress, edit, confirm, final
                → router → ChatInterface → @Rover (alice's DM)
```

Rover ↔ rover (A2A, off Discord):

```text
alice (DM): ask bob's rover what he is working on
  → alice's rover → outbound a2a_call → bob's rover   [interfaces/a2a/]
    → response → alice's rover → ChatInterface → @Rover (alice's DM)
  → optional proactive ping → ChatInterface → @Rover (bob's DM)
```

The human user is the proxy/witness for cross-rover interaction. There is no Discord-visible inter-rover channel. Cross-rover authorization defers to the agent-directory approval model (`discovered`/`approved`/`archived`) already used by `a2a_call`.

## Three transports, three roles

This plan introduces three distinct transports. They must not be conflated:

| Transport                    | Carries                    | Trust model                              | Where it lives                                                              |
| ---------------------------- | -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Discord (Chat SDK)           | user ↔ shared `@Rover` bot | Discord platform auth                    | `interfaces/chat/` (gateway side)                                           |
| Internal HTTP+SSE forwarding | gateway ↔ per-user rover   | Internal control-plane (shared secret)   | `rover-gateway` plugin in Ranger; new `ForwardedChatInterface` on the rover |
| A2A (JSON-RPC)               | rover ↔ peer rover         | Bearer-token + agent-directory allowlist | `interfaces/a2a/` (already exists)                                          |

A2A is **not** the gateway↔rover transport. A2A is shaped for peer-agent calls across permission boundaries (bearer auth, agent-card discovery, allowlists, task semantics). Internal forwarding within the hosted fleet has a different trust context (co-managed components), needs to carry the _user's_ identity as the actor (not "another agent"), and needs chat semantics (streaming progress, edits, confirmations) rather than task semantics.

## Where each piece lives

| Concern                                         | Location                                                   | Status                                        |
| ----------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| Shared `@Rover` Discord bot connection          | `interfaces/chat/` (Vercel Chat SDK Discord adapter)       | **new package** (per `chat-interface-sdk.md`) |
| Direct-mode dispatch (self-hosted)              | `interfaces/chat/` → `agentService.chat()`                 | **new**                                       |
| Gateway-mode router callback                    | `rover-gateway` plugin in Ranger                           | **new plugin**                                |
| `discord_user_id → rover endpoint` lookup       | `rover-gateway` (queries provisioner)                      | **new**                                       |
| Discord rendering (chunking, edits, components) | `interfaces/chat/` via Chat SDK                            | **new**                                       |
| Rover-side forwarded-chat receiver              | `interfaces/forwarded-chat/` on the rover                  | **new package**                               |
| Per-rover A2A endpoint (inbound)                | `interfaces/a2a/src/jsonrpc-handler.ts`                    | exists                                        |
| Outbound A2A call rover → rover                 | `interfaces/a2a/src/client.ts` (`a2a_call` tool)           | exists                                        |
| Outbound peer-agent allowlist                   | `entities/agent-discovery/` (`agent` entity, status model) | exists                                        |
| Rover provisioning + endpoint registry          | per `hosted-rovers.md` §3                                  | planned                                       |
| User record + Discord identity link             | per `multi-user.md` §1, §5                                 | planned                                       |
| Onboarding flow for unknown Discord user        | `rover-gateway` + provisioner                              | **new**                                       |

## Router-callback shape

Vercel Chat SDK is purely event-driven: handlers receive `thread` + `message` and are free to do any async work before calling `thread.post(reply)`. The gateway integrates as an async router callback awaited inside the handler:

```typescript
// interfaces/chat/src/chat-interface.ts (sketch)
bot.onSubscribedMessage(async (thread, message) => {
  if (router) {
    await router.forward({
      senderId: message.senderId,
      threadId: thread.id,
      messageId: message.id,
      content: message.content,
      platform: thread.platform,
    }, thread); // router streams events back; uses thread.post / SentMessage.edit
  } else {
    const reply = await agentService.chat(message.content, conversationId, { ... });
    await thread.post(reply.text);
  }
});
```

The router is just an async function. The `rover-gateway` plugin registers it via plugin context (matches existing capability-registration patterns). When no router is registered, `ChatInterface` falls back to direct mode — what self-hosted standalone brains use.

## Response rendering split

**Gateway renders. Rover speaks abstract content.**

The rover produces platform-agnostic responses; the gateway translates them into Discord operations via Chat SDK. This plays to Chat SDK's mdast ↔ platform contract — the abstraction it exists to provide. Bypassing it (rover producing Discord-shaped bytes) would re-implement platform rendering on the rover side, fight the SDK, and break the path for adding Slack/Teams later.

**This boundary already exists in the codebase.** `shell/ai-service/src/agent-types.ts:90` defines `AgentResponse` as `{ text: string (markdown), toolResults, pendingConfirmation, usage }` — already platform-agnostic. `shared/utils/src/chunk-message.ts` is generic markdown chunking, not Discord-specific. Discord-specific behavior lives only in `interfaces/discord/`. The gateway/`interfaces/chat/` slots in at the same boundary `interfaces/discord/` already occupies. No rover-side rework needed for content abstraction.

**Concrete responsibilities:**

Rover (`ForwardedChatInterface`):

- receive forwarded chat events
- run through `AgentService.chat()`
- emit `AgentResponse` shapes as SSE events: `text` content, `toolResults`, `pendingConfirmation`
- handle confirmation round-trips via existing `MessageInterfacePlugin.pendingConfirmations`
- never touch Discord-specific encoding

Gateway (`interfaces/chat/` + `rover-gateway` plugin):

- chunk text to Discord's 2000-char limit
- translate markdown to Discord-flavored where Chat SDK does it via mdast
- render `pendingConfirmation` intents as Discord interactive components
- correlate edit events to the originating `SentMessage` and call `SentMessage.edit()`
- handle attachments and file uploads through Chat SDK
- thread/channel placement (DM-only here, but adapter contract is generic)

## Why Vercel Chat SDK fits one half and not the other

**Gateway side: yes.** Chat SDK owns the Discord platform plumbing — webhook verification, message parsing, posting, editing, distributed locking via Redis/Postgres so multiple gateway instances don't double-process a webhook, configurable concurrency. Adapters for Slack/Teams/Matrix come for free if we add other surfaces later. This is the future-proof bet.

**Gateway↔rover hop: no.** Chat SDK adapters are designed for external chat platforms — webhook signatures, platform-API calls, format conversion to/from mdast, platform thread-id encoding. Internal forwarding has none of those concerns: no webhook verification (internal trust), no platform format translation (we own both ends), no platform id encoding (we mint our own conversation ids). A "rover-forwarding" Chat SDK adapter would invent the same wire protocol we're designing here, just wrapped in adapter conventions that don't fit. And the rover side already has `MessageInterfacePlugin` — Chat SDK on top would be a redundant abstraction layer.

## Gateway ↔ rover wire protocol

Inbound (gateway → rover): single HTTP POST with JSON body, response is SSE stream:

```typescript
POST /forwarded-chat/message
{
  "userId": "discord:alice123",          // platform-prefixed identity
  "userRef": "user_abc",                 // brain user record id (when multi-user lands)
  "permissionLevel": "trusted",          // resolved by gateway
  "conversationId": "chat-discord-alice123",
  "messageId": "discord-msg-xyz",        // for progress correlation
  "trackingKey": "gw-track-1234",        // gateway-issued correlation key
  "content": "ask bob's rover what...",
  "attachments": [...],
  "platform": "discord"                  // for permission rules + interfaceType
}
```

SSE response stream:

```text
event: progress
data: {"trackingKey":"gw-track-1234","kind":"started"}

event: edit
data: {"trackingKey":"gw-track-1234","content":"thinking..."}

event: confirm
data: {"trackingKey":"gw-track-1234","prompt":"Bob's rover wants to share X","options":["Yes","No"]}

event: final
data: {"trackingKey":"gw-track-1234","response":<AgentResponse>}

event: complete
data: {"trackingKey":"gw-track-1234"}
```

For confirmations the gateway issues a follow-up POST referencing the same `conversationId`, which the rover's existing `MessageInterfacePlugin.pendingConfirmations` machinery resolves.

Auth: shared per-rover secret in env, issued by the provisioner alongside other rover credentials. Same trust shape as A2A's `trustedTokens` but in a separate namespace so internal forwarding never gets entangled with peer-agent auth.

## Hosted-rover input path

In hosted mode, per-user rovers must **not** register their own Discord interface. Currently `brains/rover/src/index.ts:188-193` registers `DiscordInterface` directly. For hosted rovers:

- remove `DiscordInterface` from the interface set (or make it conditional on environment)
- register the new `ForwardedChatInterface` instead
- keep `A2AInterface` registered (peer-agent calls still work)

`ForwardedChatInterface` extends `MessageInterfacePlugin` — same conversation IDs, agent service routing, confirmation flow, progress tracking, file upload validation. Only the transport differs: instead of Discord gateway socket, it listens on an internal HTTP+SSE endpoint mounted on the rover's existing webserver.

## v1 simplification

Ship without streaming first to prove routing end-to-end:

- POST with the message → response with the final `AgentResponse` (no SSE)
- no progress edits, no in-DM confirmation buttons, no file uploads in hosted mode

Adds visible limitations (no "thinking…" updates, no Yes/No prompts, no attachments) but proves the gateway↔rover hop and Discord rendering. SSE + progress + confirmations + uploads come in v1.1.

The simplification is "the SSE channel emits only `final` events"; the rover-side plugin still works the same internally.

## What this replaces or narrows

- **`chat-interface-sdk.md` shared-gateway-mode** target selection drops to user-id only for hosted mode. No guild/channel/thread mapping, no `useThreads`, no mention gating in hosted mode (DMs only). The "central gateway server" role is now concretely Ranger + `rover-gateway` plugin.
- **Direct mode is unchanged.** Standalone self-hosted brains still register their own Discord interface with their own bot token — `interfaces/chat/` falls back to direct mode when no router callback is registered.
- **Webhook impersonation** drops from the design space.
- **Per-user Discord bot tokens** drop from hosted-fleet onboarding.
- **No rover-side rework needed for content abstraction.** `AgentResponse` is already platform-agnostic; the gateway slots in at the existing boundary.

## Non-goals

- shared Discord server or community for hosted rovers
- per-user Discord bot tokens or per-user bot applications
- webhook-based identity impersonation
- multi-rover synchronous group chat in a Discord-visible room
- replacing the agent-directory approval model
- changing self-hosted standalone brain Discord behavior
- using A2A as the gateway↔rover transport

## Open work

### 1. Confirm `@Rover` install shape

- decide user-install only, or user-install + server-install
- verify DM context behavior on the chosen shape
- confirm proactive DMs from gateway → user are reachable (Discord typically requires prior user interaction; first user-initiated DM is the gate)

### 2. Build `interfaces/chat/` (per `chat-interface-sdk.md`)

- Vercel Chat SDK Discord adapter wrapped as `MessageInterfacePlugin`
- accept optional router callback via plugin context
- preserve direct-mode behavior for non-hosted brains (fallback to local `AgentService.chat()`)
- gateway-side rendering: Discord chunking, mdast translation, button rendering for confirmations, `SentMessage.edit()` on tracking-key match

### 3. New `rover-gateway` plugin in Ranger

- registers router callback with `ChatInterface` via plugin context
- maintains `discord_user_id → rover endpoint` lookup (queries the rover provisioner)
- forwards normalized messages via HTTP POST to the target rover's `ForwardedChatInterface`
- consumes SSE response stream and translates events into Chat SDK operations
- correlates async progress events back to the originating Discord `SentMessage` via tracking key
- gates unknown users into the onboarding handoff

### 4. New `interfaces/forwarded-chat/` package on the rover

- extends `MessageInterfacePlugin`
- mounts an HTTP+SSE listener on the rover's webserver
- receives forwarded chat events, runs through `AgentService.chat()`
- emits `AgentResponse` shapes as SSE events (text, toolResults, pendingConfirmation)
- accepts follow-up confirmation POSTs on the same conversation id
- uses shared per-rover secret for inbound auth

### 5. Update `brains/rover/src/index.ts` for hosted mode

- conditionally register `ForwardedChatInterface` instead of `DiscordInterface` based on environment / brain.yaml
- keep `A2AInterface` registered unchanged
- conversation ID convention: `chat-${platform}-${user_id}` for gateway-forwarded chats

### 6. Onboarding for unknown Discord users

- gateway sees DM from unknown `discord_user_id` — what happens?
- decide: in-DM signup flow (text + buttons) vs. handoff to web (DM with signup link)
- where account creation, billing, and rover provisioning happen
- how Discord identity gets linked to brain user record (per `multi-user.md` §5)

### 7. UX details inside the DM

- typing indicators (Chat SDK exposes per-platform support)
- progress message edits via `SentMessage.edit()`
- confirmation prompts as Discord interactive components
- file uploads (Discord DMs accept attachments; Chat SDK adapter handles them)
- long-running responses: edits vs. follow-up posts

### 8. Cost of "no shared community"

- explicit product-side decision: is the lack of inter-rover-visible-in-Discord acceptable for v1?
- if a community surface is wanted later, it lives outside Discord — not in scope here

### 9. v1 vs v1.1 split

- v1: no streaming, single POST/response, no progress edits, no in-DM confirmations, no uploads
- v1.1: full SSE shape, progress edits, confirmations, attachments
- decide which lands first based on implementation cost vs. UX cost

## Dependencies

- `docs/plans/chat-interface-sdk.md` — provides `interfaces/chat/`; this plan narrows its hosted-mode routing surface and concretizes the gateway role
- `docs/plans/hosted-rovers.md` — rover provisioning and the rover-endpoint registry the gateway queries
- `docs/plans/multi-user.md` — Discord identity linked into the user record (§1, §5)
- `docs/plans/2026-03-15-a2a-authentication.md` — auth boundary for inter-rover (peer A2A) calls; separate from the internal forwarding auth in this plan
- `docs/plans/agent-discovery.md` — outbound A2A allowlist semantics for `a2a_call`

## Done when

1. a hosted user can install `@Rover`, DM it, and talk to their own rover end-to-end
2. the Ranger `rover-gateway` plugin routes by Discord user id only — no guild/channel/thread routing exists for hosted mode
3. cross-user rover interaction works through A2A with no Discord-visible cross-talk
4. no per-user Discord bot tokens are required at any point in onboarding or operation
5. first-time onboarding for a brand-new Discord user is fully self-service from a single user-app install
6. Discord rendering (chunking, edits, components, attachments) lives in the gateway via Chat SDK, not in rovers
