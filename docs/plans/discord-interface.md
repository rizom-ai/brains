# Plan: Discord Interface

## Context

The roadmap lists Discord as the first Phase 1 feature. A draft plan exists at `docs/plans/discord-interface.md` but has several issues compared to the actual Matrix implementation. This plan fixes those issues, incorporates Discord-specific improvements, and adds thread support and file/attachment handling.

### Issues in the existing plan

1. **No message chunking** — Discord has a 2000 char limit; the plan ignores this
2. **Sloppy type casts** — `(channel as any).send()` instead of discord.js type guards
3. **Typing indicator expires** — single `sendTyping()` call; Discord typing auto-expires after ~10s
4. **Rate limit config without implementation** — config exists, logic doesn't; removed (discord.js handles API rate limits)
5. **Wrong import** — `import { z } from "zod"` instead of `@brains/utils`
6. **Missing `@brains/agent-service` dependency**
7. **No tests provided**
8. **No thread support** — conversations not threaded
9. **No file/attachment handling** — can't receive or send files

### Improvements over Matrix

- **No client wrapper needed** — discord.js has excellent TS types (Matrix needed 337-line `MatrixClientWrapper`)
- **No HTML conversion** — Discord renders markdown natively (Matrix needs `markdownToHtml()`)
- **Simpler DM detection** — `!message.guild` vs Matrix's `m.direct` account data loading
- **Thread-per-conversation** — auto-create threads for bot replies to keep channels clean
- **File handling** — receive user attachments, send generated images

## Files

```
interfaces/discord/
├── src/
│   ├── index.ts                 # Exports
│   ├── config.ts                # Zod config schema
│   ├── discord-interface.ts     # Main implementation
│   └── chunker.ts               # Message chunking (pure function)
├── test/
│   ├── types/global.d.ts        # Mock type declarations
│   ├── mocks/setup.ts           # discord.js module mock
│   ├── config.test.ts           # Config validation tests
│   ├── chunker.test.ts          # Chunking unit tests
│   └── discord-interface.test.ts # Interface tests
├── package.json
├── tsconfig.json
└── .eslintrc.cjs
```

## Implementation Details

### 1. `src/config.ts` — Configuration

```typescript
import { z } from "@brains/utils";

export const discordConfigSchema = z.object({
  /** Discord bot token */
  botToken: z.string().min(1),
  /** Allowed channel IDs (empty = all channels) */
  allowedChannels: z.array(z.string()).default([]),
  /** Whether to respond only when mentioned in server channels */
  requireMention: z.boolean().default(true),
  /** Whether to respond to DMs */
  allowDMs: z.boolean().default(true),
  /** Show typing indicator during processing */
  showTypingIndicator: z.boolean().default(true),
  /** Status message displayed on bot's profile */
  statusMessage: z.string().default("Mention me to chat"),
  /** Auto-create threads for bot replies in server channels */
  useThreads: z.boolean().default(true),
  /** Thread auto-archive duration in minutes */
  threadAutoArchive: z.number().default(1440), // 1 day
});
```

### 2. `src/chunker.ts` — Message chunking

Pure function, no discord.js dependency. Algorithm:

1. If message <= 2000 chars, return as-is
2. Parse into blocks (split on `\n\n`), treating code blocks (```) as atomic
3. Greedily accumulate blocks into chunks
4. If a single block > 2000: split at line boundaries, then word boundaries
5. Code blocks preserve opening/closing ``` markers when split

```typescript
export const DISCORD_MAX_MESSAGE_LENGTH = 2000;
export function chunkMessage(message: string, maxLength?: number): string[];
```

### 3. `src/discord-interface.ts` — Main implementation

Extends `MessageInterfacePlugin<DiscordConfig>`.

#### Type-safe discord.js usage (no `as any`)

```typescript
import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  type Message,
  type TextBasedChannel,
  ChannelType,
  ThreadAutoArchiveDuration,
  AttachmentBuilder,
} from "discord.js";

// Use discord.js type guards
if (channel?.isSendable()) {
  await channel.send(content);
}
if (message.channel.isThread()) {
  /* in thread */
}
```

#### Periodic typing indicator (Discord-specific)

Discord typing expires after ~10s. Refresh every 8s with `setInterval`.

```typescript
private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

private startTypingIndicator(channel: TextBasedChannel): void {
  channel.sendTyping().catch(/* log */);
  const interval = setInterval(() => {
    channel.sendTyping().catch(/* log */);
  }, 8000);
  this.typingIntervals.set(channel.id, interval);
}

private stopTypingIndicator(channelId: string): void {
  const interval = this.typingIntervals.get(channelId);
  if (interval) { clearInterval(interval); this.typingIntervals.delete(channelId); }
}
```

#### Thread support

When `config.useThreads` is true and the message is in a server channel (not DM, not already a thread), the bot creates a thread from its reply message. Subsequent messages in that thread are part of the same conversation.

```typescript
// In handleMessage, after sending the response:
if (config.useThreads && message.guild && !message.channel.isThread()) {
  const reply = await message.reply(responseText);
  const thread = await reply.startThread({
    name: truncateThreadName(responseText), // First ~100 chars of response
    autoArchiveDuration: config.threadAutoArchive,
  });
  // conversationId maps to thread: `discord-${thread.id}`
}

// When receiving a message in a thread:
if (message.channel.isThread()) {
  // Use thread ID as conversation, respond directly in thread (no new thread)
  const conversationId = `discord-${message.channel.id}`;
}
```

Conversation mapping:

- **DM**: `discord-${channelId}` (same DM channel = same conversation)
- **Thread**: `discord-${threadId}` (thread = conversation)
- **Server channel (no threads)**: `discord-${channelId}`
- **Server channel (with threads)**: first message creates thread, subsequent use thread ID

#### File/attachment handling

**Receiving attachments**: Extract URLs from `message.attachments` and include them in the agent context so the brain can process images/files.

```typescript
// In handleMessage:
const attachmentUrls = message.attachments.map((a) => ({
  url: a.url,
  name: a.name,
  contentType: a.contentType,
  size: a.size,
}));

// Pass to agent as part of the message
const content =
  attachmentUrls.length > 0
    ? `${messageText}\n\n[Attachments: ${attachmentUrls.map((a) => `${a.name} (${a.url})`).join(", ")}]`
    : messageText;
```

**Sending attachments**: When the agent generates an image (via `image_generate` tool), send it as a Discord attachment.

```typescript
// Check agent response for image results
if (response.toolResults) {
  for (const result of response.toolResults) {
    if (result.type === "image" && result.data) {
      const buffer = Buffer.from(result.data, "base64");
      const attachment = new AttachmentBuilder(buffer, {
        name: "generated-image.png",
      });
      await channel.send({ files: [attachment] });
    }
  }
}
```

File size limit: 8 MB for bot uploads. Validate before sending.

#### Message handling flow (mention-based, mirrors Matrix)

1. Ignore bot messages
2. DM check (`!message.guild`)
3. Channel allowlist check
4. Mention check (`message.mentions.has(client.user)`) — or always respond in threads
5. Strip mention from content
6. Extract attachment URLs
7. Permission check via `context.permissions.getUserLevel("discord", userId)`
8. `startProcessingInput(channelId)` + start typing
9. Check `pendingConfirmations` map
10. Route to `agentService.chat(content, conversationId, context)`
11. Send response (create thread if enabled), send attachments, track jobs
12. `endProcessingInput()` + stop typing in `finally`

#### Chunked message sending

- `sendMessageToChannel`: chunks + fire-and-forget (matching abstract signature)
- `sendMessageWithId`: chunks + returns last message ID for progress editing
- `editMessage`: truncates to 2000 chars (can only edit one message)

#### Client setup

```typescript
new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // Required for DM events
});
```

#### Methods to implement

| Method                   | Notes                                               |
| ------------------------ | --------------------------------------------------- |
| `sendMessageToChannel`   | Abstract, required. Chunks + fire-and-forget        |
| `sendMessageWithId`      | Override. Chunks + returns last msg ID              |
| `editMessage`            | Override. Truncates to 2000 chars                   |
| `supportsMessageEditing` | Override. Returns `true`                            |
| `createDaemon`           | Override. Start/stop/healthCheck for bot            |
| `onRegister`             | Override. Store context, call `super.onRegister()`  |
| `handleMessage`          | Private. Mention/DM flow with threads + attachments |
| `startTypingIndicator`   | Private. Periodic refresh every 8s                  |
| `stopTypingIndicator`    | Private. Clear interval                             |

### 4. `package.json`

```json
{
  "name": "@brains/discord",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts",
    "lint:fix": "eslint . --ext .ts --fix",
    "test": "bun test"
  },
  "dependencies": {
    "@brains/agent-service": "workspace:*",
    "@brains/plugins": "workspace:*",
    "@brains/utils": "workspace:*",
    "discord.js": "^14.14.1"
  },
  "devDependencies": {
    "@brains/core": "workspace:*",
    "@brains/eslint-config": "workspace:*",
    "@brains/typescript-config": "workspace:*",
    "@types/bun": "latest"
  }
}
```

### 5. Tests

**`test/mocks/setup.ts`**: Mock `discord.js` module using `mock.module()` (same pattern as Matrix's `matrix-bot-sdk` mock at `interfaces/matrix/test/mocks/setup.ts`). Mock `Client`, `GatewayIntentBits`, `Events`, `Partials`, `AttachmentBuilder`, `ChannelType`, `ThreadAutoArchiveDuration`.

**`test/config.test.ts`**: Valid/invalid config, defaults.

**`test/chunker.test.ts`**: Under limit, paragraph split, code block preservation, line/word fallback, edge cases.

**`test/discord-interface.test.ts`**: Using `createInterfacePluginHarness`. Tests:

- Message routing to agent
- Bot message filtering
- DM handling
- Mention detection + channel allowlist
- Typing indicator refresh + cleanup
- Chunked responses (multiple sends)
- Confirmation flow
- Error handling
- Thread creation from reply (when `useThreads: true`)
- Thread conversation continuity (respond in thread without creating new one)
- Attachment URL extraction from incoming messages
- Attachment sending for image generation results

### 6. Integration

**brain.config.ts**:

```typescript
new DiscordInterface({
  botToken: process.env["DISCORD_BOT_TOKEN"] || "",
  useThreads: true,
});
```

**Permissions**:

```typescript
permissions: {
  anchors: ["discord:YOUR_DISCORD_USER_ID"],
  rules: [{ pattern: "discord:*", level: "public" }],
}
```

**Environment variables**:

```bash
DISCORD_BOT_TOKEN=your-bot-token
```

**Discord Developer Portal setup**:

1. Create application at discord.com/developers
2. Create bot, copy token → `DISCORD_BOT_TOKEN`
3. Enable MESSAGE CONTENT intent
4. OAuth2 → URL Generator → scopes: `bot`
5. Permissions: Send Messages, Read Message History, Create Public Threads, Send Messages in Threads, Attach Files
6. Invite bot to server

## Implementation Order

1. Package scaffold (`package.json`, `tsconfig.json`, `.eslintrc.cjs`)
2. `src/config.ts` + `test/config.test.ts` → typecheck + test
3. `src/chunker.ts` + `test/chunker.test.ts` → typecheck + test
4. `test/mocks/setup.ts` + `test/types/global.d.ts`
5. `src/discord-interface.ts` + `test/discord-interface.test.ts` → typecheck + test
6. `src/index.ts`
7. `bun install` + full typecheck + lint

## Verification

1. `bun run typecheck` in `interfaces/discord` — no errors
2. `bun test` in `interfaces/discord` — all tests pass
3. `bun run lint` in `interfaces/discord` — clean
4. Manual end-to-end:
   - Add to brain config with env vars
   - Start app, verify bot comes online
   - `@bot summarize my latest post` — verify mention flow
   - Send message in server channel → verify thread created
   - Reply in thread → verify response stays in thread
   - Send image attachment → verify URL passed to agent
   - Trigger image generation → verify image sent as attachment

## Key Reference Files

- `interfaces/matrix/src/lib/matrix-interface.ts` — primary reference (542 lines)
- `interfaces/matrix/test/mocks/setup.ts` — mock pattern to replicate
- `shell/plugins/src/message-interface/message-interface-plugin.ts` — base class contract
- `shell/plugins/src/interface/interface-plugin.ts` — daemon + job tracking
- `interfaces/matrix/package.json` — dependency pattern
