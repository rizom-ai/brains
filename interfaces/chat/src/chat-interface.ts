import {
  MessageInterfacePlugin,
  parseConfirmationResponse,
  type InterfacePluginContext,
  type PermissionLookupContext,
} from "@brains/plugins";
import type {
  Daemon,
  DaemonHealth,
  JobContext,
  JobProgressEvent,
  WebRouteDefinition,
} from "@brains/plugins";
import { Chat, type Message, type SentMessage, type Thread } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { chunkMessage } from "@brains/utils";
import {
  chatConfigSchema,
  type ChatConfig,
  type DiscordChatAdapterConfig,
} from "./config";
import { ThreadRegistry } from "./thread-registry";
import { CHAT_PLATFORMS } from "./types";
import type {
  ChatAdapterMap,
  ChatPlatform,
  ChatWebhookMap,
  DiscordChatAdapter,
} from "./types";
import packageJson from "../package.json";

const URL_PATTERN = /https?:\/\/\S+/i;
const ANY_MESSAGE_PATTERN = /[\s\S]+/;
const PLATFORM_MESSAGE_LIMITS: Partial<Record<ChatPlatform, number>> = {
  discord: 2000,
};

interface ChatSdkApp {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  webhooks?: ChatWebhookMap;
  onDirectMessage(
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
  onNewMention(
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
  onNewMessage(
    pattern: RegExp,
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
  onSubscribedMessage(
    handler: (thread: Thread, message: Message) => Promise<void>,
  ): void;
}

export class ChatInterface extends MessageInterfacePlugin<ChatConfig> {
  declare protected config: ChatConfig;

  private app: ChatSdkApp | undefined;
  private readonly threadRegistry = new ThreadRegistry();
  private readonly pendingConfirmations = new Map<string, boolean>();
  private discordGatewayAdapter: DiscordChatAdapter | undefined;
  private gatewayAbortController: AbortController | undefined;
  private gatewayLoopPromise: Promise<void> | undefined;

  constructor(config: Partial<ChatConfig> = {}) {
    super("chat", packageJson, config, chatConfigSchema);
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.app = this.createChatApp();
    this.registerChatHandlers(this.app);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: "/api/webhooks/chat/discord",
        method: "POST",
        public: true,
        handler: async (request: Request): Promise<Response> => {
          if (!this.app?.webhooks?.discord) {
            return new Response("Discord chat webhook not configured", {
              status: 404,
            });
          }
          return this.app.webhooks.discord(request);
        },
      },
    ];
  }

  protected override createDaemon(): Daemon | undefined {
    if (!this.config.adapters.discord) return undefined;

    return {
      start: async (): Promise<void> => {
        await this.startGatewayLoop();
      },
      stop: async (): Promise<void> => {
        await this.stopGatewayLoop();
      },
      healthCheck: async (): Promise<DaemonHealth> => ({
        status: this.gatewayLoopPromise ? "healthy" : "error",
        message: this.gatewayLoopPromise
          ? "Chat gateway loop running"
          : "Chat gateway loop stopped",
        lastCheck: new Date(),
      }),
    };
  }

  override sendMessageToChannel({
    channelId,
    message,
  }: {
    channelId: string | null;
    message: string;
  }): void {
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;
    for (const chunk of this.chunkForChannel(channelId, message)) {
      thread.post(chunk).catch((error: unknown) =>
        this.logger.error("Failed to send chat message", {
          error,
          channelId,
        }),
      );
    }
  }

  protected override async sendMessageWithId({
    channelId,
    message,
  }: {
    channelId: string | null;
    message: string;
  }): Promise<string | undefined> {
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return undefined;
    let lastSent: SentMessage | undefined;
    for (const chunk of this.chunkForChannel(channelId, message)) {
      lastSent = await thread.post(chunk);
      this.threadRegistry.trackMessage(thread.id, lastSent);
    }
    return lastSent?.id;
  }

  protected override async editMessage({
    channelId,
    messageId,
    newMessage,
  }: {
    channelId: string | null;
    messageId: string;
    newMessage: string;
  }): Promise<boolean> {
    const sent = this.threadRegistry.getMessage(channelId, messageId);
    if (!sent) return false;
    try {
      const edited = await sent.edit(newMessage);
      if (channelId) this.threadRegistry.trackMessage(channelId, edited);
      return true;
    } catch {
      return false;
    }
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  protected override async handleProgressEvent(
    event: JobProgressEvent,
    context: JobContext,
  ): Promise<void> {
    const interfaceType = event.metadata.interfaceType;
    if (interfaceType && interfaceType !== this.id) {
      if (!this.isEnabledPlatform(interfaceType)) return;
      const routedEvent: JobProgressEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          interfaceType: this.id,
        },
      };
      await super.handleProgressEvent(routedEvent, routedEvent.metadata);
      return;
    }

    await super.handleProgressEvent(event, context);
  }

  private isEnabledPlatform(interfaceType: string): boolean {
    return interfaceType === "discord" && Boolean(this.config.adapters.discord);
  }

  private chunkForChannel(channelId: string | null, message: string): string[] {
    const platform = this.parseChatPlatform(channelId);
    const limit = platform ? PLATFORM_MESSAGE_LIMITS[platform] : undefined;
    return limit ? chunkMessage(message, limit) : [message];
  }

  private parseChatPlatform(
    channelId: string | null,
  ): ChatPlatform | undefined {
    const platform = channelId?.split(":")[0];
    return CHAT_PLATFORMS.find((candidate) => candidate === platform);
  }

  private createChatApp(): ChatSdkApp {
    const discord = this.config.adapters.discord;
    if (!discord) {
      return new Chat({
        userName: this.config.userName,
        adapters: {},
        state: createMemoryState(),
      });
    }

    const discordAdapter = createDiscordAdapter({
      botToken: discord.botToken,
      publicKey: discord.publicKey,
      applicationId: discord.applicationId,
      mentionRoleIds: discord.mentionRoleIds,
    });
    this.discordGatewayAdapter = discordAdapter;

    return new Chat({
      userName: this.config.userName,
      adapters: { discord: discordAdapter } satisfies ChatAdapterMap,
      state: createMemoryState(),
    });
  }

  private registerChatHandlers(app: ChatSdkApp): void {
    app.onDirectMessage(async (thread, message) => {
      await this.handleRoutedMessage(thread, message);
    });

    app.onNewMention(async (thread, message) => {
      if (!thread.isDM && this.getPlatformConfig(thread)?.useThreads) {
        await thread.subscribe();
      }
      await this.handleRoutedMessage(thread, message);
    });

    app.onSubscribedMessage(async (thread, message) => {
      await this.handleRoutedMessage(thread, message);
    });

    if (
      this.config.adapters.discord &&
      !this.config.adapters.discord.requireMention
    ) {
      app.onNewMessage(ANY_MESSAGE_PATTERN, async (thread, message) => {
        await this.handleRoutedMessage(thread, message);
      });
    }

    app.onNewMessage(URL_PATTERN, async (thread, message) => {
      await this.handlePassiveUrlCapture(thread, message);
    });
  }

  private async handleRoutedMessage(
    thread: Thread,
    message: Message,
  ): Promise<void> {
    if (!this.context) return;
    const platform = this.getPlatform(thread);
    if (platform !== "discord") return;

    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig) return;
    if (thread.isDM && !platformConfig.allowDMs) return;
    if (message.author.isBot && !message.isMention) return;
    if (!this.isAllowedChannel(thread, platformConfig)) return;

    const agentMessage = await this.buildAgentMessage(
      platform,
      thread,
      message,
    );
    if (!agentMessage) return;

    await this.routeToAgent(platform, thread, message, agentMessage);
  }

  private async routeToAgent(
    platform: string,
    thread: Thread,
    message: Message,
    agentMessage: string,
  ): Promise<void> {
    if (!this.context) return;

    this.threadRegistry.set(thread);
    const conversationId = this.getConversationId(platform, thread.id);
    const channelId = thread.id;
    const permissionContext = this.getPermissionContext(thread, message);
    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      message.author.userId,
      permissionContext,
    );

    this.startProcessingInput(channelId);
    try {
      if (this.getPlatformConfig(thread)?.showTypingIndicator) {
        await thread
          .startTyping()
          .catch((error: unknown) =>
            this.logger.debug("Typing indicator failed", { error, channelId }),
          );
      }

      if (this.pendingConfirmations.has(conversationId)) {
        await this.handleConfirmationResponse(
          agentMessage,
          conversationId,
          thread,
        );
        return;
      }

      const response = await this.context.agent.chat(
        agentMessage,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: platform,
          channelId,
          channelName: this.getChannelName(thread, message),
          ...this.buildUserMessageMetadata(platform, thread, message),
        },
      );

      if (response.pendingConfirmation) {
        this.pendingConfirmations.set(conversationId, true);
      }

      const messageId = await this.sendMessageWithId({
        channelId,
        message: response.text,
      });

      if (messageId && response.toolResults) {
        for (const toolResult of response.toolResults) {
          if (toolResult.jobId) {
            this.trackAgentResponseForJob(
              toolResult.jobId,
              messageId,
              channelId,
            );
          }
        }
      }
    } catch (error: unknown) {
      this.logger.error("Error handling chat message", { error, channelId });
      this.sendMessageToChannel({
        channelId,
        message: `**Error:** ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      this.endProcessingInput();
    }
  }

  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    thread: Thread,
  ): Promise<void> {
    const parsed = parseConfirmationResponse(message);
    if (!parsed) {
      await thread.post(
        "_Please reply with **yes** to confirm or **no/cancel** to abort._",
      );
      return;
    }

    this.pendingConfirmations.delete(conversationId);
    const response = await this.context?.agent.confirmPendingAction(
      conversationId,
      parsed.confirmed,
    );
    if (response) {
      await thread.post(response.text);
    }
  }

  private async handlePassiveUrlCapture(
    thread: Thread,
    message: Message,
  ): Promise<void> {
    const platform = this.getPlatform(thread);
    if (platform !== "discord") return;
    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig?.captureUrls) return;
    if (!platformConfig.requireMention) return;
    if (!this.isAllowedChannel(thread, platformConfig)) return;
    if (message.author.isBot) return;
    if (message.isMention) return;

    const urls = this.extractCaptureableUrls(
      message.text,
      platformConfig.blockedUrlDomains,
    );
    if (urls.length === 0) return;

    this.threadRegistry.set(thread);
    const permissionContext = this.getPermissionContext(thread, message);
    for (const url of urls) {
      await this.captureUrlViaAgent(
        url,
        thread.id,
        message.author.userId,
        platform,
        permissionContext,
      ).catch((error: unknown) =>
        this.logger.error("URL capture failed", { error, url }),
      );
    }
  }

  private async buildAgentMessage(
    platform: string,
    thread: Thread,
    message: Message,
  ): Promise<string> {
    let agentMessage = message.text.trim();
    if (message.attachments.length === 0) return agentMessage;
    if (!this.context) return agentMessage;

    const userLevel = this.context.permissions.getUserLevel(
      platform,
      message.author.userId,
      this.getPermissionContext(thread, message),
    );
    const canUpload = userLevel === "anchor" || userLevel === "trusted";
    if (!canUpload) return agentMessage;

    for (const attachment of message.attachments) {
      const filename = attachment.name;
      if (!filename) continue;
      if (!this.isUploadableTextFile(filename, attachment.mimeType)) continue;
      if (!this.isFileSizeAllowed(attachment.size ?? 0)) continue;

      try {
        const contentBuffer = attachment.fetchData
          ? await attachment.fetchData()
          : undefined;
        if (!contentBuffer) continue;
        agentMessage +=
          "\n\n" +
          this.formatFileUploadMessage(
            filename,
            contentBuffer.toString("utf8"),
          );
      } catch (error: unknown) {
        this.logger.error("Failed to read chat attachment", {
          error,
          filename,
        });
      }
    }

    return agentMessage.trim();
  }

  private getPlatform(thread: Thread): string {
    return thread.adapter.name;
  }

  private getPlatformConfig(
    thread: Thread,
  ): DiscordChatAdapterConfig | undefined {
    const platform = this.getPlatform(thread);
    if (platform === "discord") return this.config.adapters.discord;
    return undefined;
  }

  private getConversationId(platform: string, threadId: string): string {
    return `${platform}-${threadId}`;
  }

  private isAllowedChannel(
    thread: Thread,
    config: DiscordChatAdapterConfig,
  ): boolean {
    if (config.allowedChannels.length === 0 || thread.isDM) return true;
    const ids = this.getThreadIdParts(thread.id);
    return [thread.id, thread.channelId, ids.channelId, ids.threadId].some(
      (id) => typeof id === "string" && config.allowedChannels.includes(id),
    );
  }

  private getPermissionContext(
    thread: Thread,
    message: Message,
  ): PermissionLookupContext {
    const ids = this.getThreadIdParts(thread.id);
    return {
      channelId: ids.channelId ?? thread.channelId,
      isBot: Boolean(message.author.isBot),
    };
  }

  private getChannelName(thread: Thread, _message: Message): string {
    return thread.isDM ? "DM" : thread.channelId;
  }

  private buildUserMessageMetadata(
    platform: string,
    thread: Thread,
    message: Message,
  ): Record<string, unknown> {
    const ids = this.getThreadIdParts(thread.id);
    return {
      actor: {
        actorId: `${platform}:${message.author.userId}`,
        interfaceType: platform,
        role: "user",
        displayName: message.author.fullName || message.author.userName,
        username: message.author.userName,
        isBot: Boolean(message.author.isBot),
      },
      source: {
        messageId: message.id,
        channelId: thread.id,
        channelName: this.getChannelName(thread, message),
        ...(ids.threadId ? { threadId: ids.threadId } : {}),
        metadata: {
          ...(ids.guildId ? { guildId: ids.guildId } : {}),
        },
      },
    };
  }

  private getThreadIdParts(threadId: string): {
    guildId?: string;
    channelId?: string;
    threadId?: string;
  } {
    const parts = threadId.split(":");
    if (parts[0] !== "discord") return {};
    return {
      ...(parts[1] ? { guildId: parts[1] } : {}),
      ...(parts[2] ? { channelId: parts[2] } : {}),
      ...(parts[3] ? { threadId: parts[3] } : {}),
    };
  }

  private async startGatewayLoop(): Promise<void> {
    if (this.gatewayLoopPromise) return;
    if (!this.app) throw new Error("Chat SDK app not initialized");

    this.gatewayAbortController = new AbortController();
    await this.app.initialize();
    this.gatewayLoopPromise = this.runGatewayLoop(
      this.gatewayAbortController.signal,
    );
  }

  private async stopGatewayLoop(): Promise<void> {
    this.gatewayAbortController?.abort();
    await this.gatewayLoopPromise?.catch((error: unknown) =>
      this.logger.debug("Chat gateway loop stopped with error", { error }),
    );
    this.gatewayLoopPromise = undefined;
    this.gatewayAbortController = undefined;
    this.threadRegistry.clear();
    await this.app?.shutdown();
  }

  private async runGatewayLoop(signal: AbortSignal): Promise<void> {
    if (!this.app) return;
    const adapter = this.discordGatewayAdapter;
    if (!adapter) return;
    while (!this.isAborted(signal)) {
      const tasks: Promise<unknown>[] = [];
      try {
        await adapter.startGatewayListener(
          { waitUntil: (task): void => void tasks.push(task) },
          this.config.gatewayRunMs,
          signal,
        );
        await Promise.allSettled(tasks);
      } catch (error: unknown) {
        if (this.isAborted(signal)) return;
        this.logger.error("Discord gateway listener failed", { error });
      }

      if (this.isAborted(signal)) return;
      await this.delay(this.config.gatewayRestartDelayMs, signal);
    }
  }

  private isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
}
