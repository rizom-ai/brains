# Plan: Unified ChatInterface using Vercel Chat SDK

## Context

The brain currently has separate `MatrixInterface` and `DiscordInterface` plugins, each ~400 lines implementing platform-specific message handling on top of `MessageInterfacePlugin`. Adding a new platform (Slack, Teams, Telegram) means writing another ~400-line plugin from scratch.

Vercel's Chat SDK (`chat` npm package) provides a multi-platform adapter pattern with adapters for Matrix, Discord, Slack, Teams, Telegram, WhatsApp, GitHub, and Linear. By wrapping Chat SDK in a single `ChatInterface` that extends `MessageInterfacePlugin`, we get all platforms through one plugin while preserving the brain's rich features (agent routing, progress tracking, confirmations, permissions, file uploads, URL capture).

## Architecture

```
ChatInterface extends MessageInterfacePlugin<ChatConfig>
  └─ Chat SDK App
       ├─ Matrix adapter (Beeper)    ← replaces MatrixInterface
       ├─ Discord adapter            ← replaces DiscordInterface
       ├─ Slack adapter              ← NEW
       ├─ Teams adapter              ← NEW
       └─ ... (any Chat SDK adapter)
```

One plugin, one daemon, multiple platform adapters. The `interfaceType` passed to AgentService is derived per-message from the adapter that received it (e.g., `"matrix"`, `"discord"`, `"slack"`), so existing permission rules like `{ pattern: "matrix:*", level: "public" }` still work.

## Package: `interfaces/chat/`

```
interfaces/chat/
  package.json          # @brains/chat — deps: chat, @chat-adapter/*, @brains/plugins
  tsconfig.json
  src/
    index.ts            # Public exports: ChatInterface
    chat-interface.ts   # Extends MessageInterfacePlugin, wires Chat SDK events to AgentService
    config.ts           # Zod schema for per-adapter config
    thread-registry.ts  # Maps channelId strings ↔ Chat SDK Thread objects (TTL-evicted)
  test/
    chat-interface.test.ts
```

## Config Design

**Brain model (env mapper — secrets only):**

```typescript
[
  "chat",
  ChatInterface,
  (env) => ({
    adapters: {
      matrix: env["MATRIX_ACCESS_TOKEN"]
        ? { accessToken: env["MATRIX_ACCESS_TOKEN"] }
        : undefined, // undefined = adapter disabled
      discord: env["DISCORD_BOT_TOKEN"]
        ? { botToken: env["DISCORD_BOT_TOKEN"] }
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

**brain.yaml (non-secret overrides):**

```yaml
plugins:
  chat:
    adapters:
      matrix:
        homeserver: https://matrix.rizom.ai
        userId: "@rover:rizom.ai"
      discord:
        requireMention: true
```

Adapters with `undefined` config are skipped. `disable: [chat]` disables all platforms.

## Event Flow

```
Chat SDK event (onNewMention / onSubscribedMessage)
  → extract platform name from adapter
  → register thread in ThreadRegistry
  → extract sender ID, look up permission level
  → startProcessingInput(thread.id)
  → thread.startTyping()
  → check pendingConfirmations
  → agentService.chat(message, conversationId, { interfaceType: platform, ... })
  → thread.post(response.text) → SentMessage
  → trackAgentResponseForJob(jobId, sent.id, thread.id)
  → endProcessingInput()
```

## Abstract Method Implementations

- **`sendMessageToChannel(channelId, message)`** → `threadRegistry.get(channelId).post(message)`
- **`sendMessageWithId(channelId, message)`** → `thread.post(message)` returns `SentMessage`, store in Map, return `sent.id`
- **`editMessage(channelId, messageId, newMessage)`** → `sentMessages.get(messageId).edit(newMessage)`
- **`supportsMessageEditing()`** → `true` (Chat SDK provides `SentMessage.edit()`)

Everything else (progress tracking, input buffering, confirmation flow, URL capture, file validation) comes from the `MessageInterfacePlugin` base class — unchanged.

## Daemon

```typescript
createDaemon() → {
  start: () => app.start(),       // Chat SDK handles all adapter connections
  stop: () => app.stop(),         // Graceful disconnect
  healthCheck: () => ({ status, adapterCount })
}
```

Webhook adapters (Slack, Teams): use socket mode where available, or mount Chat SDK's HTTP handler via `context.apiRoutes`.

## Migration Path

1. **Phase 1**: Build `@brains/chat` as new interface alongside existing Matrix/Discord
2. **Phase 2**: Switch rover to ChatInterface, test feature parity
3. **Phase 3**: Migrate ranger and relay
4. **Phase 4**: Deprecate and remove old `@brains/matrix`, `@brains/discord` packages

Existing `brain.yaml` files only need:

- Replace `matrix:` and `discord:` sections with `chat.adapters.matrix:` and `chat.adapters.discord:`
- Permission rules unchanged (interfaceType still resolves to platform name)

## Key Files

| File                                                              | Role                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `shell/plugins/src/message-interface/message-interface-plugin.ts` | Base class to extend                                             |
| `interfaces/matrix/src/lib/matrix-interface.ts`                   | Reference implementation (routing, confirmations, files, typing) |
| `interfaces/discord/src/discord-interface.ts`                     | Reference implementation (threads, chunking, URL capture)        |
| `shell/app/src/brain-resolver.ts`                                 | Config merge behavior for adapter sub-objects                    |
| `brains/rover/src/index.ts`                                       | First brain to adopt ChatInterface                               |

## Verification

1. `bun install` → picks up new `@brains/chat` workspace package
2. `bun run typecheck` / `bun run lint` / `bun test`
3. Start with Matrix adapter only → verify: messages, confirmations, progress updates, file uploads, typing
4. Add Discord adapter → verify same features
5. Compare behavior side-by-side with existing Matrix/Discord interfaces
6. Run eval suite with ChatInterface to verify tool execution parity
