# Plan: Discord Interface

**Created**: 2026-02-26
**Updated**: 2026-02-27
**Status**: Planned

## Context

Add a Discord bot interface, mirroring the Matrix interface's architecture. Both extend `MessageInterfacePlugin` and share the same agent routing, permission checking, confirmation flow, job tracking, and file upload patterns.

### Discord vs Matrix — what's simpler

- **No client wrapper needed** — discord.js has excellent TS types (Matrix needed 337-line `MatrixClientWrapper`)
- **No HTML conversion** — Discord renders markdown natively (Matrix needs `markdownToHtml()`)
- **Simpler DM detection** — `!message.guild` vs Matrix's `m.direct` account data loading
- **File attachments are direct** — Discord provides `message.attachments` with URLs you can fetch directly (Matrix needs `mxc://` download via SDK)

### Discord-specific concerns

- **2000 char message limit** — Need chunking (Matrix has no practical limit)
- **Typing indicator expires** — Auto-expires after ~10s, needs periodic refresh (Matrix lets you set a timeout)
- **Thread support** — Auto-create threads for bot replies to keep channels clean

## Files

```
interfaces/discord/
├── src/
│   ├── index.ts                 # Exports
│   ├── config.ts                # Zod config schema
│   ├── discord-interface.ts     # Main implementation
│   └── chunker.ts               # Message chunking (pure function)
├── test/
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
  /** Thread auto-archive duration in minutes (Discord only allows specific values) */
  threadAutoArchive: z
    .enum(["60", "1440", "4320", "10080"])
    .default("1440")
    .transform(Number), // 60=1h, 1440=1d, 4320=3d, 10080=7d
});

export type DiscordConfig = z.infer<typeof discordConfigSchema>;
```

### 2. `src/chunker.ts` — Message chunking

Pure function, no discord.js dependency. Algorithm:

1. If message <= 2000 chars, return as single-element array
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

#### Constructor + client setup

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
} from "discord.js";

export class DiscordInterface extends MessageInterfacePlugin<DiscordConfig> {
  private client: Client | null = null;
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private pendingConfirmations = new Map<string, boolean>();

  constructor(config?: Partial<DiscordConfig>) {
    super("discord", packageJson, config, discordConfigSchema);
  }
}
```

Client intents:

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

#### Base class methods to implement

| Method                   | Notes                                              |
| ------------------------ | -------------------------------------------------- |
| `sendMessageToChannel`   | Abstract, required. Chunks + fire-and-forget       |
| `sendMessageWithId`      | Override. Chunks + returns last msg ID             |
| `editMessage`            | Override. Truncates to 2000 chars                  |
| `supportsMessageEditing` | Override. Returns `true`                           |
| `createDaemon`           | Override. Start/stop/healthCheck for bot           |
| `onRegister`             | Override. Store context, call `super.onRegister()` |

#### Private methods

| Method                 | Notes                                                |
| ---------------------- | ---------------------------------------------------- |
| `handleMessage`        | Main message handler — routing, threads, attachments |
| `routeToAgent`         | Agent call, response sending, job tracking           |
| `startTypingIndicator` | Periodic refresh every 8s (Discord expires at ~10s)  |
| `stopTypingIndicator`  | Clear interval                                       |

#### Message handling flow (mirrors Matrix `routeToAgent`)

```
handleMessage(message: Message):
  1. Ignore bot's own messages (message.author.id === client.user.id)
  2. Determine context:
     - DM: !message.guild → always respond (if allowDMs)
     - Thread: message.channel.isThread() → always respond (part of conversation)
     - Server channel: check mention (message.mentions.has(client.user))
  3. Channel allowlist check (if configured)
  4. Resolve channelId for routing:
     - Thread: message.channel.id (thread ID)
     - DM/server channel: message.channel.id
  5. Handle file attachments (before text — same as Matrix)
     - Permission-gate to anchor/trusted users
     - Use base class: isUploadableTextFile(), isFileSizeAllowed()
     - Fetch content from attachment URL
     - Combine with message text if both present (see below)
  6. Strip bot mention from message content
  7. routeToAgent(content, channelId, userId, message)
```

#### Text + attachment in one message

Discord allows a user to send text and file attachments in a single message (unlike Matrix which sends them as separate events). When both are present, combine them into a single agent message:

```typescript
// Build agent message from text + attachments
let agentMessage = messageText; // stripped of mention

for (const attachment of message.attachments.values()) {
  const filename = attachment.name ?? "uploaded-file";
  const mimetype = attachment.contentType ?? undefined;
  const size = attachment.size;

  if (!this.isUploadableTextFile(filename, mimetype)) continue;
  if (!this.isFileSizeAllowed(size)) continue;

  const resp = await fetch(attachment.url);
  const fileContent = await resp.text();
  agentMessage += "\n\n" + this.formatFileUploadMessage(filename, fileContent);
}

// If only attachments (no text), agentMessage starts with the file content
// If only text (no attachments), agentMessage is just the text
// If both, agent sees "user text\n\nUser uploaded a file..."
await this.routeToAgent(agentMessage.trim(), channelId, userId, message);
```

This replaces the separate attachment loop — there's always a single `routeToAgent` call per message.

#### `routeToAgent` — mirrors Matrix pattern

The key difference from Matrix: when `useThreads` is enabled and the message is in a server channel (not DM, not already a thread), we create the thread **before** calling the agent. This ensures the conversation ID is `discord-${threadId}` from the start, so follow-up messages in the thread share the same conversation context.

```typescript
private async routeToAgent(
  message: string,
  channelId: string,
  userId: string,
  discordMessage: Message,
): Promise<void> {
  // If threads enabled and this is a new server channel message, create thread first
  let replyTarget: TextBasedChannel = discordMessage.channel;
  let effectiveChannelId = channelId;

  if (this.config.useThreads && discordMessage.guild && !discordMessage.channel.isThread()) {
    // Create thread from the user's message — agent response goes in the thread
    const thread = await discordMessage.startThread({
      name: truncateThreadName(message),
      autoArchiveDuration: this.config.threadAutoArchive,
    });
    replyTarget = thread;
    effectiveChannelId = thread.id;
  }

  const conversationId = `discord-${effectiveChannelId}`;
  const userPermissionLevel = context.permissions.getUserLevel("discord", userId);

  this.startProcessingInput(effectiveChannelId);
  try {
    this.startTypingIndicator(replyTarget);

    // Check for confirmation response
    if (this.pendingConfirmations.has(conversationId)) {
      await this.handleConfirmationResponse(message, conversationId, effectiveChannelId);
      return;
    }

    // Route to agent
    const response = await this.getAgentService().chat(message, conversationId, {
      userPermissionLevel,
      interfaceType: "discord",
      channelId: effectiveChannelId,
      channelName: discordMessage.guild?.name ?? "DM",
    });

    // Track pending confirmation
    if (response.pendingConfirmation) {
      this.pendingConfirmations.set(conversationId, true);
    }

    // Send response (chunked if needed)
    const messageId = await this.sendMessageWithId(effectiveChannelId, response.text);

    // Track async jobs for progress updates
    if (messageId && response.toolResults) {
      for (const toolResult of response.toolResults) {
        if (toolResult.jobId) {
          this.trackAgentResponseForJob(toolResult.jobId, messageId, effectiveChannelId);
        }
      }
    }
  } catch (error) {
    this.logger.error("Error handling message", { error, channelId: effectiveChannelId });
    this.sendMessageToChannel(effectiveChannelId,
      `**Error:** ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    this.endProcessingInput();
    this.stopTypingIndicator(effectiveChannelId);
  }
}
```

#### Thread support

Thread creation happens in `routeToAgent` **before** calling the agent (see above). This ensures consistent conversation IDs:

- **DM**: `discord-${channelId}` (same DM channel = same conversation)
- **Thread**: `discord-${threadId}` (thread = conversation)
- **Server channel (no threads)**: `discord-${channelId}`
- **Server channel (with threads)**: thread created from user's message, agent response sent into thread, all subsequent messages in thread use `discord-${threadId}`

The thread is created from the user's message (`message.startThread()`), not from the bot's reply. This keeps the channel clean — the user's message becomes the thread starter, and all bot responses live inside the thread.

#### Typing indicator (Discord-specific)

Discord typing expires after ~10s. Refresh every 8s:

```typescript
private startTypingIndicator(channel: TextBasedChannel): void {
  if (!this.config.showTypingIndicator) return;
  channel.sendTyping().catch((e) => this.logger.debug("Typing failed", { error: e }));
  const interval = setInterval(() => {
    channel.sendTyping().catch((e) => this.logger.debug("Typing failed", { error: e }));
  }, 8000);
  this.typingIntervals.set(channel.id, interval);
}

private stopTypingIndicator(channelId: string): void {
  const interval = this.typingIntervals.get(channelId);
  if (interval) {
    clearInterval(interval);
    this.typingIntervals.delete(channelId);
  }
}
```

#### Chunked message sending

```typescript
// Required abstract method
sendMessageToChannel(channelId: string | null, message: string): void {
  if (!channelId || !this.client) return;
  const channel = this.client.channels.cache.get(channelId);
  if (!channel?.isSendable()) return;
  const chunks = chunkMessage(message);
  for (const chunk of chunks) {
    channel.send(chunk).catch((e) => this.logger.error("Send failed", { error: e }));
  }
}

// Override for progress tracking — returns last message ID
async sendMessageWithId(channelId: string | null, message: string): Promise<string | undefined> {
  if (!channelId || !this.client) return undefined;
  const channel = this.client.channels.cache.get(channelId);
  if (!channel?.isSendable()) return undefined;
  const chunks = chunkMessage(message);
  let lastId: string | undefined;
  for (const chunk of chunks) {
    const sent = await channel.send(chunk);
    lastId = sent.id;
  }
  return lastId;
}

// Override for progress editing
async editMessage(channelId: string | null, messageId: string, newMessage: string): Promise<boolean> {
  if (!channelId || !this.client) return false;
  const channel = this.client.channels.cache.get(channelId);
  if (!channel?.isSendable()) return false;
  // Can only edit one message — truncate
  const truncated = newMessage.slice(0, DISCORD_MAX_MESSAGE_LENGTH);
  const msg = await channel.messages.fetch(messageId);
  await msg.edit(truncated);
  return true;
}

supportsMessageEditing(): boolean { return true; }
```

#### Confirmation flow

Same pattern as Matrix — `parseConfirmationResponse()` recognizes yes/no/cancel etc.

```typescript
private async handleConfirmationResponse(
  message: string, conversationId: string, channelId: string
): Promise<void> {
  const parsed = parseConfirmationResponse(message);
  if (!parsed) {
    this.sendMessageToChannel(channelId,
      "_Please reply with **yes** to confirm or **no/cancel** to abort._");
    return;
  }
  this.pendingConfirmations.delete(conversationId);
  const response = await this.getAgentService().confirmPendingAction(conversationId, parsed.confirmed);
  await this.sendMessageWithId(channelId, response.text);
}
```

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
    "@brains/plugins": "workspace:*",
    "@brains/utils": "workspace:*",
    "discord.js": "^14.14.1"
  },
  "devDependencies": {
    "@brains/core": "workspace:*",
    "@brains/eslint-config": "workspace:*",
    "@brains/test-utils": "workspace:*",
    "@brains/typescript-config": "workspace:*",
    "@types/bun": "latest"
  }
}
```

Note: No `@brains/agent-service` dependency needed — agent service is accessed via `this.getAgentService()` from the base class context, not imported directly.

### 5. Tests

**`test/mocks/setup.ts`**: Mock `discord.js` module using `mock.module()` (same pattern as Matrix's `interfaces/matrix/test/mocks/setup.ts`). Mock `Client`, `GatewayIntentBits`, `Events`, `Partials`, `ChannelType`, `ThreadAutoArchiveDuration`.

**`test/config.test.ts`**: Valid/invalid config, defaults.

**`test/chunker.test.ts`**: Under limit, paragraph split, code block preservation, line/word fallback, edge cases.

**`test/discord-interface.test.ts`**: Using test harness (same pattern as Matrix tests). Tests:

- Message routing to agent
- Bot message filtering
- DM handling
- Mention detection + channel allowlist
- Thread creation from user message (when `useThreads: true`)
- Thread conversation ID consistency (first + follow-up messages share same ID)
- Thread skipped for DMs and existing threads
- Typing indicator refresh + cleanup
- Chunked responses (multiple sends)
- Confirmation flow (yes/no/unrecognized)
- File upload: anchor/trusted user accepted, public user rejected
- File upload: text file validation, size validation
- File upload: content downloaded and passed to agent via `formatFileUploadMessage`
- File upload + text combined into single agent message
- Error handling (agent error → user-visible error message)
- Job tracking for async tool results

### 6. Integration

**brain.config.ts** (only in apps that use Discord):

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
4. `test/mocks/setup.ts` — discord.js module mock
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
   - `@bot summarize my latest post` — verify mention flow + thread created
   - Reply in thread → verify response stays in same thread
   - Send second `@bot` message → verify new thread with separate conversation
   - Upload `.md` file → verify content passed to agent
   - DM the bot → verify response without mention

## Key Reference Files

- `interfaces/matrix/src/lib/matrix-interface.ts` — primary reference (617 lines)
- `interfaces/matrix/test/mocks/setup.ts` — mock pattern to replicate
- `interfaces/matrix/test/matrix-interface.test.ts` — test patterns (812 lines)
- `shell/plugins/src/message-interface/message-interface-plugin.ts` — base class contract
- `shell/plugins/src/interface/interface-plugin.ts` — daemon + job tracking
- `shell/ai-service/src/agent-types.ts` — AgentResponse, ToolResultData types
