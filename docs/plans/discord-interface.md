# Discord Interface

## Overview

A Discord bot interface for interacting with the brain via chat. Extends `MessageInterfacePlugin` like CLI and Matrix interfaces.

## Features

- Multi-channel support (DMs and server channels)
- Message editing for progress updates
- Slash commands for common operations
- Mention detection (@bot)
- Permission levels per user
- Typing indicators during processing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Discord Server                           │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│   │ Channel  │   │   DM     │   │ Channel  │               │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘               │
└────────┼──────────────┼──────────────┼──────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│              DiscordInterface (MessageInterfacePlugin)       │
│   - Discord.js Client                                        │
│   - Message routing                                          │
│   - Progress updates                                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     AgentService                             │
│   - Natural language processing                              │
│   - Tool execution                                           │
│   - Conversation management                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Configuration Schema

**File**: `interfaces/discord/src/config.ts` (NEW)

```typescript
import { z } from "zod";

export const discordConfigSchema = z.object({
  /** Discord bot token (from environment) */
  botToken: z.string(),

  /** Application ID for slash commands */
  applicationId: z.string().optional(),

  /** Guild/Server ID (optional - for server-specific commands) */
  guildId: z.string().optional(),

  /** Allowed channel IDs (empty = all channels) */
  allowedChannels: z.array(z.string()).default([]),

  /** Whether to respond only when mentioned */
  requireMention: z.boolean().default(true),

  /** Whether to respond to DMs */
  allowDMs: z.boolean().default(true),

  /** Rate limiting */
  rateLimit: z
    .object({
      /** Max messages per user per minute */
      messagesPerMinute: z.number().default(10),
      /** Cooldown message */
      cooldownMessage: z
        .string()
        .default("Please wait a moment before sending another message."),
    })
    .default({}),

  /** Status message for the bot */
  statusMessage: z.string().default("Use /help for commands"),

  /** Typing indicator during processing */
  showTypingIndicator: z.boolean().default(true),
});

export type DiscordConfig = z.infer<typeof discordConfigSchema>;
```

---

## 2. Discord Interface Implementation

**File**: `interfaces/discord/src/discord-interface.ts` (NEW)

```typescript
import {
  MessageInterfacePlugin,
  type InterfacePluginContext,
  type Daemon,
  type DaemonHealth,
} from "@brains/plugins";
import { Client, GatewayIntentBits, Events, Message } from "discord.js";
import { discordConfigSchema, type DiscordConfig } from "./config";
import packageJson from "../package.json";

interface DiscordJobTrackingInfo {
  messageId?: string;
  channelId?: string;
}

export class DiscordInterface extends MessageInterfacePlugin<
  DiscordConfig,
  DiscordJobTrackingInfo
> {
  private client: Client | null = null;
  private context?: InterfacePluginContext;

  constructor(config: Partial<DiscordConfig> = {}) {
    super("discord", packageJson, config, discordConfigSchema);
  }

  /**
   * Register the interface
   */
  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.context = context;
    this.logger.info("Discord interface registered");
  }

  /**
   * Create daemon for Discord bot lifecycle
   */
  protected override createDaemon(): Daemon | undefined {
    return {
      start: async (): Promise<void> => {
        await this.startBot();
      },
      stop: async (): Promise<void> => {
        await this.stopBot();
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const isConnected = this.client?.isReady() ?? false;
        return {
          status: isConnected ? "healthy" : "error",
          message: isConnected ? "Discord bot connected" : "Bot disconnected",
          lastCheck: new Date(),
          details: {
            guilds: this.client?.guilds.cache.size ?? 0,
          },
        };
      },
    };
  }

  /**
   * Start the Discord bot
   */
  private async startBot(): Promise<void> {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    // Handle ready event
    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.info(`Discord bot ready as ${readyClient.user.tag}`);

      // Set status
      readyClient.user.setActivity(this.config.statusMessage);
    });

    // Handle messages
    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessage(message);
    });

    // Login
    await this.client.login(this.config.botToken);
  }

  /**
   * Stop the Discord bot
   */
  private async stopBot(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      this.logger.info("Discord bot stopped");
    }
  }

  /**
   * Handle incoming Discord message
   */
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if it's a DM
    const isDM = !message.guild;
    if (isDM && !this.config.allowDMs) return;

    // Check allowed channels
    if (!isDM && this.config.allowedChannels.length > 0) {
      if (!this.config.allowedChannels.includes(message.channel.id)) return;
    }

    // Check mention requirement
    const isMentioned = message.mentions.has(this.client!.user!);
    if (this.config.requireMention && !isDM && !isMentioned) return;

    // Extract message content (remove bot mention)
    let content = message.content;
    if (isMentioned) {
      content = content.replace(/<@!?\d+>/g, "").trim();
    }

    if (!content) return;

    const channelId = message.channel.id;
    const userId = message.author.id;

    // Check permissions
    const permissionLevel =
      this.context?.permissions.getUserLevel("discord", userId) ?? "public";

    // Show typing indicator
    if (this.config.showTypingIndicator) {
      void message.channel.sendTyping();
    }

    // Start processing
    this.startProcessingInput(channelId);

    try {
      // Route to agent service
      const response = await this.context?.agentService.chat(
        content,
        `discord-${channelId}`, // conversationId
        {
          userPermissionLevel: permissionLevel,
          interfaceType: "discord",
          channelId,
          channelName: isDM
            ? "DM"
            : ((message.channel as any).name ?? channelId),
        },
      );

      if (response?.text) {
        const sentMessage = await this.sendMessageWithId(
          channelId,
          response.text,
        );

        // Track jobs for completion updates
        if (response.toolResults && sentMessage) {
          for (const toolResult of response.toolResults) {
            if (toolResult.jobId) {
              this.trackAgentResponseForJob(
                toolResult.jobId,
                sentMessage,
                channelId,
              );
            }
          }
        }
      }
    } catch (error) {
      this.logger.error("Error handling Discord message", { error });
      await this.sendMessageToChannel(
        channelId,
        "Sorry, I encountered an error processing your message.",
      );
    } finally {
      this.endProcessingInput();
    }
  }

  /**
   * Send message to Discord channel
   */
  protected sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    if (!channelId || !this.client) return;

    const channel = this.client.channels.cache.get(channelId);
    if (channel?.isTextBased()) {
      void (channel as any).send(message);
    }
  }

  /**
   * Send message and return message ID for editing
   */
  protected override async sendMessageWithId(
    channelId: string | null,
    message: string,
  ): Promise<string | undefined> {
    if (!channelId || !this.client) return undefined;

    const channel = this.client.channels.cache.get(channelId);
    if (channel?.isTextBased()) {
      const sentMessage = await (channel as any).send(message);
      return sentMessage.id;
    }
    return undefined;
  }

  /**
   * Edit existing message
   */
  protected override async editMessage(
    channelId: string,
    messageId: string,
    newMessage: string,
  ): Promise<boolean> {
    if (!this.client) return false;

    try {
      const channel = this.client.channels.cache.get(channelId);
      if (channel?.isTextBased()) {
        const message = await (channel as any).messages.fetch(messageId);
        if (message?.editable) {
          await message.edit(newMessage);
          return true;
        }
      }
    } catch (error) {
      this.logger.warn("Failed to edit Discord message", { error });
    }
    return false;
  }

  /**
   * Discord supports message editing
   */
  protected override supportsMessageEditing(): boolean {
    return true;
  }
}
```

---

## 3. Main Export

**File**: `interfaces/discord/src/index.ts` (NEW)

```typescript
export { DiscordInterface } from "./discord-interface";
export { discordConfigSchema, type DiscordConfig } from "./config";
```

---

## 4. Package Configuration

**File**: `interfaces/discord/package.json` (NEW)

```json
{
  "name": "@brains/discord",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint --max-warnings 0 .",
    "test": "bun test"
  },
  "dependencies": {
    "@brains/plugins": "workspace:*",
    "@brains/utils": "workspace:*",
    "discord.js": "^14.14.1"
  },
  "devDependencies": {
    "@brains/test-utils": "workspace:*",
    "@types/bun": "latest",
    "typescript": "5.7.2"
  }
}
```

---

## 5. Usage in brain.config.ts

```typescript
import { DiscordInterface } from "@brains/discord";

// Add to interfaces array:
new DiscordInterface({
  botToken: process.env["DISCORD_BOT_TOKEN"] || "",
  applicationId: process.env["DISCORD_APP_ID"],
  guildId: process.env["DISCORD_GUILD_ID"], // Optional
  requireMention: true,
  allowDMs: true,
  showTypingIndicator: true,
}),
```

---

## Files Summary

| File                                                | Action |
| --------------------------------------------------- | ------ |
| `interfaces/discord/src/config.ts`                  | NEW    |
| `interfaces/discord/src/discord-interface.ts`       | NEW    |
| `interfaces/discord/src/index.ts`                   | NEW    |
| `interfaces/discord/package.json`                   | NEW    |
| `interfaces/discord/tsconfig.json`                  | NEW    |
| `interfaces/discord/test/discord-interface.test.ts` | NEW    |

---

## Implementation Order

1. Create package structure (`interfaces/discord/`)
2. Implement config schema
3. Implement DiscordInterface class
4. Add to turbo.json / workspace
5. Write tests
6. Add to professional-brain config

---

## Environment Variables

```bash
# .env
DISCORD_BOT_TOKEN=your-bot-token-here
DISCORD_APP_ID=your-app-id-here
DISCORD_GUILD_ID=your-server-id-here  # Optional
```

---

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application
3. Go to Bot section, create bot
4. Copy token → `DISCORD_BOT_TOKEN`
5. Enable MESSAGE CONTENT INTENT
6. Go to OAuth2 → URL Generator
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: Send Messages, Read Message History, Add Reactions
9. Copy invite URL and add bot to server

---

## Verification

1. **Unit tests**:
   - Config validation
   - Message handling (mock discord.js)
   - Permission checking

2. **Integration test**:
   - Bot connects to Discord
   - Responds to mentions
   - Handles DMs

3. **E2E test**:
   - Start brain with Discord interface
   - Send message in Discord server
   - Verify response from brain
   - Check job progress updates edit message
