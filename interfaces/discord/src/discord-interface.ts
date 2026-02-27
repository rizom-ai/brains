import {
  MessageInterfacePlugin,
  parseConfirmationResponse,
  type InterfacePluginContext,
} from "@brains/plugins";
import type { Daemon } from "@brains/plugins";
import { chunkMessage, truncateText } from "@brains/utils";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";
import { discordConfigSchema } from "./config";
import type { DiscordConfig } from "./config";
import packageJson from "../package.json";

const DISCORD_MAX_LENGTH = 2000;
const TYPING_REFRESH_MS = 8000;
const THREAD_NAME_MAX_LENGTH = 100;

/** Type guard for channels that support send/typing */
interface SendableChannel {
  id: string;
  send(
    content: string,
  ): Promise<{ id: string; edit(content: string): Promise<unknown> }>;
  sendTyping(): Promise<void>;
  isThread(): boolean;
  messages: {
    fetch(
      id: string,
    ): Promise<{ id: string; edit(content: string): Promise<unknown> }>;
  };
}

function isSendable(channel: unknown): channel is SendableChannel {
  return (
    !!channel &&
    typeof channel === "object" &&
    "send" in channel &&
    "sendTyping" in channel
  );
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

export interface DiscordDeps {
  fetchText?: (url: string) => Promise<string>;
}

/**
 * Discord Interface - Agent-based architecture
 *
 * Routes all messages to AgentService, supports threads, file uploads,
 * and message chunking for Discord's 2000 char limit.
 */
export class DiscordInterface extends MessageInterfacePlugin<DiscordConfig> {
  declare protected config: DiscordConfig;
  private client: Client | null = null;
  private readonly fetchText: (url: string) => Promise<string>;

  private pendingConfirmations = new Map<string, boolean>();
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(config: Partial<DiscordConfig>, deps: DiscordDeps = {}) {
    super("discord", packageJson, config, discordConfigSchema);
    this.fetchText = deps.fetchText ?? defaultFetchText;
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    // Create Discord client during registration (not daemon start)
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    // Set up event handlers
    this.client.on(Events.MessageCreate, (message: Message) => {
      void this.handleMessage(message);
    });

    this.client.once(Events.ClientReady, () => {
      this.logger.info("Discord bot connected", {
        tag: this.client?.user?.tag,
      });
    });
  }

  protected override createDaemon(): Daemon | undefined {
    return {
      start: async () => {
        if (!this.client) {
          throw new Error("Discord client not initialized");
        }
        await this.client.login(this.config.botToken);
      },
      stop: async () => {
        for (const interval of this.typingIntervals.values()) {
          clearInterval(interval);
        }
        this.typingIntervals.clear();

        if (this.client) {
          await this.client.destroy();
          this.client = null;
        }
      },
      healthCheck: async () => ({
        status: this.client?.user ? "healthy" : "error",
        message: this.client?.user
          ? `Connected as ${this.client.user.tag}`
          : "Not connected",
        lastCheck: new Date(),
      }),
    };
  }

  // ── Abstract method implementation ──

  override sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    if (!channelId || !this.client) return;
    const channel = this.client.channels.cache.get(channelId);
    if (!isSendable(channel)) return;
    const chunks = chunkMessage(message, DISCORD_MAX_LENGTH);
    for (const chunk of chunks) {
      channel
        .send(chunk)
        .catch((e: unknown) =>
          this.logger.error("Failed to send message", { error: e }),
        );
    }
  }

  protected override async sendMessageWithId(
    channelId: string | null,
    message: string,
  ): Promise<string | undefined> {
    if (!channelId || !this.client) return undefined;
    const channel = this.client.channels.cache.get(channelId);
    if (!isSendable(channel)) return undefined;
    const chunks = chunkMessage(message, DISCORD_MAX_LENGTH);
    let lastId: string | undefined;
    for (const chunk of chunks) {
      const sent = await channel.send(chunk);
      lastId = sent.id;
    }
    return lastId;
  }

  protected override async editMessage(
    channelId: string | null,
    messageId: string,
    newMessage: string,
  ): Promise<boolean> {
    if (!channelId || !this.client) return false;
    const channel = this.client.channels.cache.get(channelId);
    if (!isSendable(channel)) return false;
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(newMessage.slice(0, DISCORD_MAX_LENGTH));
      return true;
    } catch {
      return false;
    }
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  // ── Message handling ──

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.id === this.client?.user?.id) return;
    if (!this.context) return;

    const isDM = !message.guild;
    const isThread = message.channel.isThread();

    if (isDM && !this.config.allowDMs) return;

    if (!isDM && !isThread && this.config.requireMention) {
      if (!this.client?.user || !message.mentions.has(this.client.user)) return;
    }

    if (
      this.config.allowedChannels.length > 0 &&
      !isDM &&
      !this.config.allowedChannels.includes(message.channel.id)
    ) {
      return;
    }

    // Build agent message: text + any file attachments
    let agentMessage = this.stripMention(message.content);

    if (message.attachments.size > 0) {
      const userLevel = this.context.permissions.getUserLevel(
        "discord",
        message.author.id,
      );
      const canUpload = userLevel === "anchor" || userLevel === "trusted";

      if (canUpload) {
        for (const attachment of message.attachments.values()) {
          const filename = attachment.name ?? "uploaded-file";
          const mimetype = attachment.contentType ?? undefined;
          const size = attachment.size;

          if (!this.isUploadableTextFile(filename, mimetype)) continue;
          if (!this.isFileSizeAllowed(size)) continue;

          try {
            const fileContent = await this.fetchText(attachment.url);
            agentMessage +=
              "\n\n" + this.formatFileUploadMessage(filename, fileContent);
          } catch (e: unknown) {
            this.logger.error("Failed to download attachment", {
              error: e,
              filename,
            });
          }
        }
      }
    }

    agentMessage = agentMessage.trim();
    if (!agentMessage) return;

    const channelId = message.channel.id;
    await this.routeToAgent(agentMessage, channelId, message);
  }

  private async routeToAgent(
    message: string,
    channelId: string,
    discordMessage: Message,
  ): Promise<void> {
    if (!this.context) return;

    const agentService = this.context.agentService;
    let replyChannelId = channelId;

    if (
      this.config.useThreads &&
      discordMessage.guild &&
      !discordMessage.channel.isThread()
    ) {
      try {
        const thread = await discordMessage.startThread({
          name: truncateText(message, THREAD_NAME_MAX_LENGTH),
          autoArchiveDuration: this.config.threadAutoArchive,
        });
        replyChannelId = thread.id;
      } catch (e: unknown) {
        this.logger.error("Failed to create thread", { error: e });
      }
    }

    const conversationId = `discord-${replyChannelId}`;
    const userPermissionLevel = this.context.permissions.getUserLevel(
      "discord",
      discordMessage.author.id,
    );
    const channelName = discordMessage.guild?.name ?? "DM";

    this.startProcessingInput(replyChannelId);
    try {
      // Start typing in the reply target (thread or original channel)
      const replyChannel = this.client?.channels.cache.get(replyChannelId);
      if (isSendable(replyChannel)) {
        this.startTypingIndicator(replyChannel);
      }

      if (this.pendingConfirmations.has(conversationId)) {
        await this.handleConfirmationResponse(
          message,
          conversationId,
          replyChannelId,
        );
        return;
      }

      const response = await agentService.chat(message, conversationId, {
        userPermissionLevel,
        interfaceType: "discord",
        channelId: replyChannelId,
        channelName,
      });

      if (response.pendingConfirmation) {
        this.pendingConfirmations.set(conversationId, true);
      }

      const messageId = await this.sendMessageWithId(
        replyChannelId,
        response.text,
      );

      if (messageId && response.toolResults) {
        for (const toolResult of response.toolResults) {
          if (toolResult.jobId) {
            this.trackAgentResponseForJob(
              toolResult.jobId,
              messageId,
              replyChannelId,
            );
          }
        }
      }
    } catch (error: unknown) {
      this.logger.error("Error handling message", {
        error,
        channelId: replyChannelId,
      });
      this.sendMessageToChannel(
        replyChannelId,
        `**Error:** ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      this.endProcessingInput();
      this.stopTypingIndicator(replyChannelId);
    }
  }

  // ── Confirmations ──

  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    channelId: string,
  ): Promise<void> {
    const parsed = parseConfirmationResponse(message);
    if (!parsed) {
      this.sendMessageToChannel(
        channelId,
        "_Please reply with **yes** to confirm or **no/cancel** to abort._",
      );
      return;
    }
    this.pendingConfirmations.delete(conversationId);
    const response = await this.context?.agentService.confirmPendingAction(
      conversationId,
      parsed.confirmed,
    );
    if (response) {
      await this.sendMessageWithId(channelId, response.text);
    }
  }

  // ── Typing indicator ──

  private startTypingIndicator(channel: SendableChannel): void {
    if (!this.config.showTypingIndicator) return;
    channel
      .sendTyping()
      .catch((e: unknown) =>
        this.logger.debug("Typing indicator failed", { error: e }),
      );
    const interval = setInterval(() => {
      channel
        .sendTyping()
        .catch((e: unknown) =>
          this.logger.debug("Typing indicator failed", { error: e }),
        );
    }, TYPING_REFRESH_MS);
    this.typingIntervals.set(channel.id, interval);
  }

  private stopTypingIndicator(channelId: string): void {
    const interval = this.typingIntervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(channelId);
    }
  }

  // ── Utilities ──

  private stripMention(content: string): string {
    if (!this.client?.user) return content;
    return content
      .replace(new RegExp(`<@!?${this.client.user.id}>`, "g"), "")
      .trim();
  }
}
