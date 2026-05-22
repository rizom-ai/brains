# Plan: Unified ChatInterface using Vercel Chat SDK

## Status

Proposed. Not release-gating. The production self-hosted Discord interface still uses `@brains/discord` directly. `@brains/chat` is the strategic convergence path, but sequencing is hosted/shared gateway first and self-hosted migration later, after the gateway path proves stable and a low-friction migration exists.

## Confirmed implementation decisions

Confirmed on 2026-05-19 for the first implementation slice:

- Build only the new `interfaces/chat/` package first, with Discord parity tests. Do not migrate Rover, Ranger, or Relay in this slice.
- The Discord adapter config must provide the credentials required by Chat SDK: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and `DISCORD_APPLICATION_ID`. These identify and authenticate an existing Discord application; the SDK does not create Discord bots/apps.
- Use Chat SDK's in-memory state adapter for the first local/parity implementation. Durable state is deferred and must be revisited before hosted/shared gateway production use or any later self-hosted migration.
- For direct opt-in and gateway-owned Discord mode, implement a daemon loop around Chat SDK's bounded `startGatewayListener(...)` API rather than only mounting webhook routes first.
- Close Discord parity with documented gaps is acceptable for the first package landing. Exact parity remains required before hosted gateway rollout, and self-hosted migration comes only after that path is stable.

## Context

The brain currently has a production Discord interface (`@brains/discord`) implemented directly on top of `MessageInterfacePlugin`. Matrix has already been removed from the active interface packages, and should return through the Chat SDK adapter path rather than by resurrecting the old Matrix implementation.

Vercel's Chat SDK (`chat` npm package) is the chosen multi-platform adapter layer. By wrapping it in a single `ChatInterface` that extends `MessageInterfacePlugin`, we get Matrix, Discord, Slack, Teams, Telegram, WhatsApp, GitHub, Linear, etc. through one interface plugin while preserving the brain's existing message behavior: agent routing, progress tracking, confirmations, permissions, file uploads, and URL capture.

This is an interface consolidation project, not a release-blocking prerequisite for `v0.2.0` unless we explicitly reprioritize it.

## Architecture

```text
ChatInterface extends MessageInterfacePlugin<ChatConfig>
  └─ Chat SDK App
       ├─ Discord adapter            ← first SDK target; hosted gateway first, self-hosted later
       ├─ Matrix adapter (Beeper)    ← Matrix return path
       ├─ Slack adapter              ← next likely platform
       ├─ Teams adapter
       └─ ... (any Chat SDK adapter)
```

One plugin, one daemon, multiple platform adapters. The `interfaceType` passed to AgentService is derived per message from the adapter that received it, e.g. `"discord"`, `"matrix"`, or `"slack"`. It must **not** become `"chat"`, because existing permission rules are platform-scoped:

```yaml
permissions:
  rules:
    - pattern: "discord:*"
      level: public
    - pattern: "matrix:*"
      level: trusted
```

## Responsibility split

The Chat SDK owns platform plumbing:

- adapter connection lifecycle
- receive/send/edit message APIs
- platform thread/channel/message abstractions
- typing indicators where available
- adapter-specific auth, sockets, and webhook handling

Brains owns behavior:

- permission lookup from `platform + senderId`
- conversation ID construction
- `agentService.chat()` calls or gateway forwarding
- confirmation state
- progress/job tracking
- URL capture policy
- file upload filtering/formatting
- eval-disable behavior

## Deployment modes

`@brains/chat` must support both direct and shared-gateway operation.

### Direct mode

A standalone brain owns its chat adapter credentials and talks to Discord/Matrix/Slack directly:

```text
rover instance
  → ChatInterface
    → Discord adapter using DISCORD_BOT_TOKEN
```

This is the long-term self-hosted consolidation shape, but it is not the next production migration target. Existing self-hosted Rover users stay on `@brains/discord` until hosted gateway behavior is proven and a low-friction migration path exists.

### Shared gateway mode

A hosted fleet needs a central always-on gateway server. That server can be Ranger or a dedicated gateway app, but it must be a real deployed process with the shared Discord bot token, network access to Discord, and routing access to hosted rovers:

```text
central gateway server (Ranger or dedicated gateway app)
  → ChatInterface
    → Discord adapter using one shared bot token
      → resolve target rover
      → route normalized message to target rover via A2A/internal call
```

Hosted rovers must not need per-user Discord bot tokens in this mode. The SDK-backed Discord adapter only needs the shared bot token in the central gateway process. Rovers receive normalized chat requests from the gateway and respond through that gateway.

This means gateway mode is not just a config variant inside each rover. It requires central infrastructure that owns:

- the shared Discord bot connection
- Discord interaction routing
- target-rover lookup
- authentication/authorization for forwarding requests to rovers
- response/progress routing back to Discord
- operational monitoring and restart behavior for the shared bot process

Gateway mode requires the SDK event context to expose enough Discord identity/routing metadata:

- user id
- guild/server id
- channel id
- thread id
- message id
- mention state
- reply/edit target

The gateway uses that metadata to select the target rover, preserve `interfaceType: "discord"`, and route replies back through the shared bot. Target selection can be based on guild/channel/thread mapping, explicit user bindings, or another hosted-fleet registry, but it must live in the central gateway path rather than in individual rovers.

Progress/job updates need an explicit return path. If a forwarded rover request queues async jobs, the gateway must be able to correlate job/progress/completion events back to the Discord channel/message it owns. Conversation IDs, job routing metadata, or gateway tracking keys must include the target brain/rover id to avoid collisions across hosted users.

## Future app-platform capabilities

`DISCORD_PUBLIC_KEY` and `DISCORD_APPLICATION_ID` do not change the first Discord parity goal. They are Discord-specific examples of a broader app-platform pattern: moving Rover from plain bot-token chat clients toward verified, installable, interactive app surfaces.

The product opportunities are platform-general, even though each platform uses different credentials and APIs:

1. **Verified webhook/interactions entrypoint**
   - Discord: verify signed requests with `publicKey`.
   - Slack: verify requests with the Slack signing secret.
   - WhatsApp/Meta: verify webhook subscription and requests with Meta app/webhook credentials.
   - Enables a hosted gateway to accept platform events over HTTP without trusting unsigned traffic.

2. **Installable Rover app UX**
   - Discord: `applicationId` identifies the installable Discord app/bot.
   - Slack: Slack app installation identifies workspaces and grants scoped bot/user tokens.
   - WhatsApp: Meta app + phone-number IDs identify the business messaging endpoint.
   - Future hosted users can install or connect one shared Rover app, then DM it or use it in approved spaces.

3. **Command-based onboarding and diagnostics**
   - Discord/Slack: `/rover connect`, `/rover help`, `/rover status`, `/rover capture`.
   - WhatsApp: command-like text flows and template-driven setup messages where allowed.
   - Use structured commands for predictable setup and diagnostics instead of relying only on free-form mention text.

4. **Buttons, cards, and interactive actions**
   - Discord/Slack: native buttons, cards/blocks, modals, and shortcuts.
   - WhatsApp: interactive messages, buttons, lists, and templates with stricter policy limits.
   - Use platform-native components for confirmations, approvals, publishing actions, queue operations, and passkey/setup links.
   - Reduce fragile yes/no text parsing for high-risk actions.

5. **Central hosted-rover gateway**
   - Ranger or a dedicated gateway owns the shared platform app and routes signed interactions to the right Rover.
   - Individual hosted rovers do not need their own Discord bot token, Slack app install, WhatsApp phone number, or public socket.

6. **Operationally safer chat integrations**
   - Webhook verification gives a clear security boundary.
   - App identity, installation IDs, workspace/server/channel IDs, phone-number IDs, and interaction IDs improve auditability, retry handling, and progress/edit correlation.

Suggested product sequencing:

- **Phase A — Parity only:** keep Discord behavior equivalent to `@brains/discord`; require app identifiers only for the opt-in SDK path.
- **Phase B — Diagnostics:** add `/rover status` and `/rover help` on platforms that support commands; fall back to text commands elsewhere.
- **Phase C — Safer actions:** replace confirmation text for dangerous actions with buttons/cards where available.
- **Phase D — Hosted onboarding:** support one shared installable Rover app routed through the central gateway, starting with Discord and later Slack/WhatsApp if product demand warrants it.
- **Phase E — Rich workflows:** use app components for publishing queues, review/approval flows, and content capture shortcuts.

## Package: `interfaces/chat/`

```text
interfaces/chat/
  package.json          # @brains/chat — deps: chat, adapter packages, @brains/plugins
  tsconfig.json
  src/
    index.ts            # Public exports: ChatInterface
    chat-interface.ts   # Extends MessageInterfacePlugin, wires Chat SDK events to AgentService
    config.ts           # Zod schema for per-adapter config
    thread-registry.ts  # Maps channelId strings ↔ Chat SDK Thread objects (TTL-evicted)
  test/
    chat-interface.test.ts
    discord-parity.test.ts
```

## Config design

Secrets come from the brain model env mapper. Non-secret adapter behavior lives in `brain.yaml`.

**Brain model:**

```typescript
[
  "chat",
  ChatInterface,
  (env) => ({
    adapters: {
      discord:
        env["DISCORD_BOT_TOKEN"] &&
        env["DISCORD_PUBLIC_KEY"] &&
        env["DISCORD_APPLICATION_ID"]
          ? {
              botToken: env["DISCORD_BOT_TOKEN"],
              publicKey: env["DISCORD_PUBLIC_KEY"],
              applicationId: env["DISCORD_APPLICATION_ID"],
            }
          : undefined,
      matrix: env["MATRIX_ACCESS_TOKEN"]
        ? { accessToken: env["MATRIX_ACCESS_TOKEN"] }
        : undefined,
      slack: env["SLACK_BOT_TOKEN"]
        ? {
            botToken: env["SLACK_BOT_TOKEN"],
            signingSecret: env["SLACK_SIGNING_SECRET"],
          }
        : undefined,
    },
  }),
];
```

**brain.yaml:**

```yaml
plugins:
  chat:
    adapters:
      discord:
        requireMention: true
        allowDMs: true
        useThreads: true
        captureUrls: true
      matrix:
        homeserver: https://matrix.rizom.ai
        userId: "@rover:rizom.ai"
```

Adapters with `undefined` config are skipped. `disable: [chat]` disables all chat adapters.

A future self-hosted migration would move existing Discord config from:

```yaml
plugins:
  discord:
    requireMention: true
```

to:

```yaml
plugins:
  chat:
    adapters:
      discord:
        requireMention: true
```

Permission rules stay unchanged (`discord:*`, `matrix:*`, etc.). This migration is intentionally later than the hosted/shared gateway work.

## Event flow

```text
Chat SDK event
  → extract platform name from adapter
  → resolve thread/channel id and register it in ThreadRegistry
  → extract sender id and permission level
  → apply platform response policy (mention/DM/thread/channel rules)
  → optionally capture URLs without replying
  → startProcessingInput(thread.id)
  → thread.startTyping() when supported
  → check pending confirmations
  → agentService.chat(message, conversationId, { interfaceType: platform, channelId, ... })
  → thread.post(response.text) → SentMessage
  → trackAgentResponseForJob(jobId, sent.id, thread.id)
  → endProcessingInput()
```

Conversation IDs should be platform-scoped and deterministic:

```text
${platform}-${threadOrChannelId}
```

## Discord parity spec

The first implementation target is SDK-backed Discord parity with the current `@brains/discord` behavior.

Discord response policy must preserve:

- **Mention gating**: in public/server channels, the bot only replies when explicitly mentioned if `requireMention: true`.
- **DMs**: direct messages are accepted when `allowDMs: true`.
- **Owned threads**: once the bot creates/owns a thread, follow-up messages in that thread do not require another mention.
- **Allowed channels**: configured channel allowlists gate both replies and URL capture.
- **Bot messages**: messages from other bots are ignored unless they explicitly mention this bot.
- **URL capture exception**: with `captureUrls: true`, links in unmentioned channel messages can be silently captured without a conversational reply.
- **Thread creation**: when `useThreads: true`, channel replies create/use a thread and route follow-ups there.
- **Message chunking**: long replies are split to fit Discord limits.
- **Message editing**: progress and completion updates edit tracked messages when possible.
- **File uploads**: trusted/anchor users can upload supported text files; unsupported/oversized files are ignored.
- **Confirmations**: yes/no confirmation replies continue pending agent actions in the same conversation.

This parity list is the acceptance contract before hosted gateway rollout and any later self-hosted Rover migration off `@brains/discord`.

## Abstract method implementations

- **`sendMessageToChannel(channelId, message)`** → `threadRegistry.get(channelId).post(message)`
- **`sendMessageWithId(channelId, message)`** → `thread.post(message)` returns `SentMessage`, store it, return `sent.id`
- **`editMessage(channelId, messageId, newMessage)`** → look up the sent message and call `edit(newMessage)`
- **`supportsMessageEditing()`** → `true` when the active adapter supports `SentMessage.edit()`

Everything else — progress tracking, input buffering, confirmation flow, URL capture helpers, file validation — comes from `MessageInterfacePlugin` unless Chat SDK requires a small adapter-specific bridge.

## Daemon

Chat SDK does not expose a generic long-running `app.start()`/`app.stop()` lifecycle for Discord. The first Discord implementation should initialize the Chat SDK app and run a small daemon loop around the Discord adapter's bounded `startGatewayListener(...)` API. The loop must be abortable on daemon stop. This supports both local opt-in trials and the future gateway-owned shared bot process.

```typescript
createDaemon() → {
  start: () => runDiscordGatewayLoop(),
  stop: () => abortGatewayLoopAndShutdownChat(),
  healthCheck: () => ({ status, adapterCount })
}
```

Webhook routes should still be mounted for Discord interactions where configured, and for future webhook-based adapters. Webhook adapters such as Slack/Teams should use socket mode where available. If an adapter requires inbound HTTP, mount the Chat SDK handler through the interface/plugin web route mechanism before enabling that adapter in production.

## Migration path

1. **Build `@brains/chat` with Discord adapter first**
   - Add the new workspace package alongside existing `@brains/discord`.
   - Implement SDK-backed Discord using the parity spec above.
   - Use Chat SDK memory state for the first implementation; document restart-related owned-thread/subscription gaps.
   - Keep current `@brains/discord` untouched during comparison.
   - Do not migrate Rover, Ranger, or Relay in this first slice.

2. **Rover opt-in trial only**
   - Allow Rover test/local config to opt into `chat.adapters.discord`.
   - Keep `@brains/discord` as the default self-hosted/direct Rover interface.
   - Verify live Discord behavior: mention gating, DMs, threads, URL capture, uploads, confirmations, progress edits.
   - Ensure `evalDisable` includes `"chat"`.

3. **Hosted/shared gateway first**
   - Decide whether Ranger remains the central Discord gateway or whether a dedicated hosted-chat gateway app owns the shared bot.
   - Add the `ChatInterface` router callback needed by gateway mode.
   - Add the rover-side `ForwardedChatInterface` for internal gateway → rover delivery.
   - Add the Ranger `rover-gateway` plugin for `discord_user_id → rover endpoint` lookup, forwarding auth, and response/progress routing.
   - This is required before hosted rovers can drop per-user Discord bot tokens.

4. **Migrate hosted Rover Discord to one shared app**
   - Hosted rovers must not register their own Discord adapter or own Discord bot token.
   - Ranger/gateway owns the shared Discord app credentials, including `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and `DISCORD_APPLICATION_ID`.
   - Verify gateway-mode progress routing: async job status from a target rover must still edit/send messages through the gateway-owned Discord adapter.

5. **Add richer hosted app interactions**
   - Add command diagnostics such as `/rover status` and `/rover help` where supported.
   - Render confirmations and approvals with buttons/cards where available, with text fallback.
   - Keep this at the gateway/app layer so it benefits hosted users and future Slack/WhatsApp paths.

6. **Migrate self-hosted Rover later**
   - Only after hosted gateway mode is stable and the SDK path has proven live Discord behavior.
   - Preserve current self-hosted behavior and avoid forcing extra Discord app identifiers until the migration has clear product value.
   - Keep permission strings stable (`discord:*`). Env/config compatibility may require an adapter wrapper or migration helper.

7. **Remove old `@brains/discord`**
   - Only after hosted and self-hosted brain models no longer import it and docs/config examples point to `chat.adapters.discord`.

8. **Enable other Chat SDK platforms as product demand warrants**
   - WhatsApp is a strong candidate for hosted Rover reach, but requires product-policy work around identity, opt-in, templates, and proactive messaging.
   - Slack is a stronger fit for Relay/team spaces.
   - Matrix returns through the Chat SDK adapter path; do not reintroduce the old native Matrix interface or `matrix-sdk-crypto-nodejs` path.

## Key files

| File                                                              | Role                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `shell/plugins/src/message-interface/message-interface-plugin.ts` | Base class to extend                                        |
| `interfaces/discord/src/discord-interface.ts`                     | Current Discord behavior spec and parity reference          |
| `shell/app/src/brain-resolver.ts`                                 | Config merge behavior for adapter sub-objects               |
| `brains/rover/src/index.ts`                                       | Opt-in direct trial now; hosted/self-hosted migration later |
| `brains/ranger/src/index.ts`                                      | Likely owner of the shared hosted Discord gateway           |
| `brains/relay/src/index.ts`                                       | Later team/chat platform target                             |

## Dependencies & compatibility

- **Shell lifecycle is ready** — `onRegister`/`onReady` semantics are real; chat adapter daemons should start through the normal daemon lifecycle after ready hooks.
- **Central gateway server** — shared-token gateway mode requires one always-on deployed gateway process. Ranger can fill this role, or we can introduce a dedicated hosted-chat gateway app; individual hosted rovers cannot replace this central process.
- **Hosted rovers shared Discord gateway** — Ranger's gateway/proxy pattern must keep working; ChatInterface should not force every hosted rover to own Discord credentials. Gateway mode must keep enough channel/message/job routing metadata to send and edit Discord replies for forwarded rover work.
- **API route registration** — required only for webhook-mode adapters. Verify route mounting before enabling those adapters.
- **Eval mode** — `evalDisable` must include `"chat"` so external chat sockets/webhooks do not start during evals.
- **Permission namespace stability** — platform adapters must emit platform `interfaceType` values, not `"chat"`.

## Verification

1. `bun install` picks up new `@brains/chat` workspace package.
2. `bun run typecheck`, relevant tests, and lint pass.
3. Discord parity tests cover the acceptance contract above.
4. Rover can opt into SDK-backed Discord locally without changing default self-hosted behavior.
5. Eval mode does not start ChatInterface.
6. Hosted Rover can run through one shared gateway-owned Discord app with no per-user bot tokens.
7. Gateway-mode progress, edits, confirmations, and attachments route back through the gateway-owned adapter.
8. Self-hosted Rover migration is deferred until hosted gateway mode is stable and migration friction is acceptable.
9. Other adapters can be enabled through Chat SDK without reintroducing legacy platform-specific interface paths.
