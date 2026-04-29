# Plan: Unified ChatInterface using Vercel Chat SDK

## Context

The brain currently has a production Discord interface (`@brains/discord`) implemented directly on top of `MessageInterfacePlugin`. Matrix has already been removed from the active interface packages, and should return through the Chat SDK adapter path rather than by resurrecting the old Matrix implementation.

Vercel's Chat SDK (`chat` npm package) is the chosen multi-platform adapter layer. By wrapping it in a single `ChatInterface` that extends `MessageInterfacePlugin`, we get Matrix, Discord, Slack, Teams, Telegram, WhatsApp, GitHub, Linear, etc. through one interface plugin while preserving the brain's existing message behavior: agent routing, progress tracking, confirmations, permissions, file uploads, and URL capture.

This is an interface consolidation project, not a release-blocking prerequisite for `v0.2.0` unless we explicitly reprioritize it.

## Architecture

```text
ChatInterface extends MessageInterfacePlugin<ChatConfig>
  └─ Chat SDK App
       ├─ Discord adapter            ← first parity target; replaces @brains/discord
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

This is the self-hosted/default mental model. It preserves the current `@brains/discord` shape, just through the Chat SDK adapter layer.

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
      discord: env["DISCORD_BOT_TOKEN"]
        ? { botToken: env["DISCORD_BOT_TOKEN"] }
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

Existing Discord config migrates from:

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

Permission rules stay unchanged (`discord:*`, `matrix:*`, etc.).

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

This parity list is the acceptance contract before switching Rover off `@brains/discord`.

## Abstract method implementations

- **`sendMessageToChannel(channelId, message)`** → `threadRegistry.get(channelId).post(message)`
- **`sendMessageWithId(channelId, message)`** → `thread.post(message)` returns `SentMessage`, store it, return `sent.id`
- **`editMessage(channelId, messageId, newMessage)`** → look up the sent message and call `edit(newMessage)`
- **`supportsMessageEditing()`** → `true` when the active adapter supports `SentMessage.edit()`

Everything else — progress tracking, input buffering, confirmation flow, URL capture helpers, file validation — comes from `MessageInterfacePlugin` unless Chat SDK requires a small adapter-specific bridge.

## Daemon

```typescript
createDaemon() → {
  start: () => app.start(),       // Chat SDK starts enabled adapters
  stop: () => app.stop(),         // Graceful disconnect
  healthCheck: () => ({ status, adapterCount })
}
```

Webhook adapters such as Slack/Teams should use socket mode where available. If an adapter requires inbound HTTP, mount the Chat SDK handler through the interface/plugin API route mechanism before enabling that adapter in production.

## Migration path

1. **Build `@brains/chat` with Discord adapter first**
   - Add the new workspace package alongside existing `@brains/discord`.
   - Implement SDK-backed Discord using the parity spec above.
   - Keep current `@brains/discord` untouched during comparison.

2. **Rover opt-in trial**
   - Switch Rover test/local config to `chat.adapters.discord`.
   - Verify live Discord behavior: mention gating, DMs, threads, URL capture, uploads, confirmations, progress edits.
   - Ensure `evalDisable` includes `"chat"`.

3. **Migrate Rover**
   - Replace Rover's `@brains/discord` import with `@brains/chat`.
   - Keep permission strings and env vars stable.

4. **Design/confirm central gateway server**
   - Decide whether Ranger remains the central Discord gateway or whether a dedicated hosted-chat gateway app owns the shared bot.
   - Define target-rover lookup, forwarding auth, and response/progress routing.
   - This is required before hosted rovers can drop per-user Discord bot tokens.

5. **Migrate Ranger and Relay**
   - Preserve the hosted rover/shared Discord gateway topology. Do not require each hosted rover to run its own Discord adapter or own Discord bot token.
   - Verify gateway-mode progress routing: async job status from a target rover must still edit/send messages through the gateway-owned Discord adapter.

6. **Remove old `@brains/discord`**
   - Only after no brain model imports it and docs/config examples point to `chat.adapters.discord`.

7. **Enable Matrix via Chat SDK**
   - Matrix returns through the Chat SDK adapter path.
   - Do not reintroduce the old native Matrix interface or `matrix-sdk-crypto-nodejs` path.

8. **Add Slack/Teams/Telegram adapters as needed**
   - Prefer socket-mode setups first.
   - Add API route mounting only for adapters that need inbound webhooks.

## Key files

| File                                                              | Role                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `shell/plugins/src/message-interface/message-interface-plugin.ts` | Base class to extend                                   |
| `interfaces/discord/src/discord-interface.ts`                     | Current Discord behavior spec and parity reference     |
| `shell/app/src/brain-resolver.ts`                                 | Config merge behavior for adapter sub-objects          |
| `brains/rover/src/index.ts`                                       | First brain to adopt ChatInterface                     |
| `brains/ranger/src/index.ts`                                      | Shared Discord gateway topology must remain compatible |
| `brains/relay/src/index.ts`                                       | Later migration target                                 |

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
4. Live Rover Discord test verifies mention gating, DMs, threads, URL capture, uploads, confirmations, typing, progress edits, and job completion edits.
5. Eval mode does not start ChatInterface.
6. Rover can run on SDK-backed Discord without user-visible regression.
7. Ranger/Relay migrate without breaking shared gateway behavior.
8. Matrix adapter can be enabled through Chat SDK without reintroducing the old native Matrix dependency path.
