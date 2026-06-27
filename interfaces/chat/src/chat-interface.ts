import {
  MessageInterfacePlugin,
  buildAgentResponseTextParts,
  buildCoalescedInput,
  buildConfirmationResponseParts,
  buildMessageActorMetadata,
  buildMessageSourceMetadata,
  formatArtifactDisplay,
  getConfirmationResultTitle,
  getDeliverableArtifactCards,
  getResponseJobIds,
  getSupplementalCards,
  formatContentDispositionHeader,
  formatMessageProgressDisplay,
  formatPendingConfirmationHelp,
  getMessageUploadKind,
  isMessageUploadDeclaredSizeAllowed,
  isUploadableTextFile,
  normalizeMessageUploadMediaType,
  PendingApprovalTracker,
  MessageUploadContinuity,
  routeConfirmationResponse,
  sanitizeUploadFilename,
  validateMessageUpload,
  type AgentResponse,
  type ChatAttachment,
  type InterfacePluginContext,
  type MessageInterfaceOutput,
  type PendingConfirmation,
  type StructuredChatCard,
  type PermissionLookupContext,
  type RuntimeUploadStore,
  type ToolActivityEvent,
  type ToolStatusUpdate,
  type UserPermissionLevel,
} from "@brains/plugins";
import type {
  Daemon,
  DaemonHealth,
  JobContext,
  JobProgressEvent,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  Chat,
  type ActionEvent,
  type CardChild,
  type CardElement,
  type Channel,
  type FileUpload,
  type Message,
  type MessageContext,
  type SentMessage,
  type Thread,
} from "chat";
import { z } from "zod";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { chunkMessage, createPrefixedId } from "@brains/utils";
import {
  chatConfigSchema,
  type ChatConfig,
  type DiscordChatAdapterConfig,
} from "./config";
import { ThreadRegistry } from "./thread-registry";
import { ToolStatusMessenger } from "./tool-status-messenger";
import {
  ChatCardBuilder,
  APPROVAL_CONFIRM_ACTION,
  APPROVAL_CANCEL_ACTION,
  PROMPT_ACTION,
} from "./chat-cards";
import { ArtifactDeliveryResolver } from "./artifact-delivery";
import { ApprovalCardTracker } from "./approval-card-tracker";
import {
  createDiscordSubscriptionStateAdapter,
  createDiscordThreadSubscriptionStore,
  type DiscordThreadSubscriptionState,
  type DiscordThreadSubscriptionStore,
} from "./subscription-state";
import { createDiscordChatUploadStoreScope } from "./upload-store";
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
const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_MENTION_REQUIRED_NOTICE =
  "I’ll stop auto-replying now that more people joined. Mention me if you need me.";

interface DiscordCardOutput {
  card: CardElement;
  fallbackText?: string;
}

const chatCardElementSchema = z
  .object({
    type: z.literal("card"),
    children: z.array(z.object({ type: z.string() }).passthrough()),
    imageUrl: z.string().optional(),
    subtitle: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const discordCardOutputSchema = z.object({
  card: z.custom<CardElement>(
    (value) => chatCardElementSchema.safeParse(value).success,
  ),
  fallbackText: z.string().optional(),
});

interface AgentInput {
  message: string;
  attachments: ChatAttachment[];
  notices: string[];
}

interface ChatSdkApp {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  webhooks?: ChatWebhookMap;
  onDirectMessage(
    handler: (
      thread: Thread,
      message: Message,
      channel: Channel,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onNewMention(
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onNewMessage(
    pattern: RegExp,
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onSubscribedMessage(
    handler: (
      thread: Thread,
      message: Message,
      context?: MessageContext,
    ) => Promise<void>,
  ): void;
  onAction(
    actionIds: string[] | string,
    handler: (event: ActionEvent) => Promise<void>,
  ): void;
}

export class ChatInterface extends MessageInterfacePlugin<ChatConfig> {
  declare protected config: ChatConfig;

  private app: ChatSdkApp | undefined;
  private readonly threadRegistry = new ThreadRegistry();
  private readonly pendingApprovals: PendingApprovalTracker;
  private readonly uploadContinuity: MessageUploadContinuity;
  private readonly promptActions = new Map<
    string,
    { threadId: string; label: string; prompt: string }
  >();
  private readonly toolStatusMessenger = new ToolStatusMessenger(
    this.threadRegistry,
  );
  private readonly cardBuilder = new ChatCardBuilder({
    getDisplayBaseUrl: () => this.getPreferredDisplayBaseUrl(),
    registerPromptAction: (threadId, action) =>
      this.registerPromptAction(threadId, action),
  });
  private readonly artifactDelivery = new ArtifactDeliveryResolver({
    getContext: () => this.context,
    getDisplayBaseUrl: () => this.getPreferredDisplayBaseUrl(),
    logger: this.logger,
  });
  private readonly approvalCards = new ApprovalCardTracker({
    cardBuilder: this.cardBuilder,
    clearMessageComponents: (threadId, messageId) =>
      this.clearDiscordMessageComponents(threadId, messageId),
  });
  private discordGatewayAdapter: DiscordChatAdapter | undefined;
  private discordSubscriptions: DiscordThreadSubscriptionStore | undefined;
  private gatewayAbortController: AbortController | undefined;
  private gatewayLoopPromise: Promise<void> | undefined;

  constructor(config: Partial<ChatConfig> = {}) {
    super("chat", packageJson, config, chatConfigSchema);
    this.pendingApprovals = new PendingApprovalTracker({
      loadMessages: async (conversationId): Promise<readonly unknown[]> => {
        return (
          (await this.context?.conversations.getMessages(conversationId, {
            limit: 50,
          })) ?? []
        );
      },
      onRestoreError: (error, conversationId): void => {
        this.logger.debug("Failed to load pending chat approvals", {
          error,
          conversationId,
        });
      },
    });
    this.uploadContinuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (conversationId): Promise<readonly unknown[]> => {
        return (
          (await this.context?.conversations.getMessages(conversationId, {
            limit: 50,
          })) ?? []
        );
      },
      restoreAttachment: async (uploadId): Promise<ChatAttachment> => {
        const uploadStore = this.context?.uploads.scoped(
          createDiscordChatUploadStoreScope(),
        );
        if (!uploadStore) throw new Error("Chat upload store unavailable");
        const resolved = await uploadStore.read(uploadId);
        return this.createChatAttachmentFromStoredUpload(
          resolved.record.filename,
          resolved.record.mediaType,
          resolved.content,
          resolved.record.ref,
        );
      },
      onLoadError: (error, conversationId): void => {
        this.logger.debug("Failed to load prior chat uploads", {
          error,
          conversationId,
        });
      },
      onRestoreError: (error, uploadId): void => {
        this.logger.debug("Failed to restore prior chat upload", {
          error,
          uploadId,
        });
      },
    });
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.discordSubscriptions = createDiscordThreadSubscriptionStore(
      context.runtimeState,
    );
    this.app = this.createChatApp(context);
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
      {
        path: "/api/webhooks/chat/discord/uploads",
        method: "GET",
        public: true,
        handler: async (request: Request): Promise<Response> => {
          return this.handleDiscordUploadRequest(request);
        },
      },
    ];
  }

  private async handleDiscordUploadRequest(
    request: Request,
  ): Promise<Response> {
    if (!this.config.adapters.discord) {
      return new Response("Discord chat uploads not configured", {
        status: 404,
      });
    }

    const uploadId = new URL(request.url).searchParams.get("id")?.trim();
    if (!uploadId) {
      return new Response("Missing upload id", { status: 400 });
    }

    try {
      const uploadStore = this.getDiscordUploadStore();
      const { record, content } = await uploadStore.read(uploadId);
      const body = new Uint8Array(content).buffer;
      return new Response(body, {
        headers: {
          "Content-Type": record.mediaType,
          "Content-Length": String(content.byteLength),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": formatContentDispositionHeader({
            disposition: new URL(request.url).searchParams.has("download")
              ? "attachment"
              : "inline",
            filename: record.filename,
          }),
        },
      });
    } catch {
      return new Response("Upload not found", { status: 404 });
    }
  }

  private getDiscordUploadStore(): RuntimeUploadStore {
    if (!this.context) throw new Error("Chat interface not registered");
    return this.context.uploads.scoped(createDiscordChatUploadStoreScope());
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
    message: MessageInterfaceOutput;
  }): void {
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;
    const cardOutput = this.toDiscordCardOutput(message);
    if (cardOutput) {
      thread.post(cardOutput).catch((error: unknown) =>
        this.logger.error("Failed to send chat message", {
          error,
          channelId,
        }),
      );
      return;
    }
    if (typeof message !== "string") return;
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
    message: MessageInterfaceOutput;
  }): Promise<string | undefined> {
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return undefined;
    const cardOutput = this.toDiscordCardOutput(message);
    if (cardOutput) {
      const sent = await thread.post(cardOutput);
      this.threadRegistry.trackMessage(thread.id, sent);
      return sent.id;
    }
    if (typeof message !== "string") return undefined;
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
    newMessage: MessageInterfaceOutput;
  }): Promise<boolean> {
    const sent = this.threadRegistry.getMessage(channelId, messageId);
    if (!sent) return false;
    try {
      const edited = await sent.edit(
        this.toDiscordCardOutput(newMessage) ??
          (typeof newMessage === "string" ? newMessage : ""),
      );
      if (channelId) this.threadRegistry.trackMessage(channelId, edited);
      return true;
    } catch {
      return false;
    }
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  private toDiscordCardOutput(
    output: MessageInterfaceOutput,
  ): DiscordCardOutput | undefined {
    const parsed = discordCardOutputSchema.safeParse(output);
    if (!parsed.success) return undefined;

    const { card, fallbackText } = parsed.data;
    if (fallbackText === undefined) return { card };
    return { card, fallbackText };
  }

  protected override formatProgressOutput(
    event: JobProgressEvent,
  ): MessageInterfaceOutput {
    return this.formatProgressPayload(event);
  }

  protected override formatCompletionOutput(
    event: JobProgressEvent,
  ): MessageInterfaceOutput {
    return this.formatProgressPayload(event);
  }

  private formatProgressPayload(event: JobProgressEvent): {
    card: CardElement;
    fallbackText: string;
  } {
    const display = formatMessageProgressDisplay(event);
    const children: CardChild[] = [{ type: "text", content: display.label }];
    if (display.amount) {
      children.push({ type: "text", content: display.amount });
    }
    if (display.message) {
      children.push({ type: "text", content: display.message });
    }

    return {
      card: {
        type: "card",
        title: display.title,
        children,
      },
      fallbackText: display.fallback,
    };
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

  protected override async handleToolActivityEvent(
    event: ToolActivityEvent,
  ): Promise<void> {
    if (event.interfaceType === this.id) {
      await super.handleToolActivityEvent(event);
      return;
    }
    if (!this.isEnabledPlatform(event.interfaceType)) return;

    await super.handleToolActivityEvent({
      ...event,
      interfaceType: this.id,
    });
  }

  protected override async handleToolStatusUpdate(
    update: ToolStatusUpdate,
  ): Promise<void> {
    if (update.interfaceType !== this.id || !update.channelId) return;
    await this.toolStatusMessenger.handle(update);
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

  private createChatApp(context: InterfacePluginContext): ChatSdkApp {
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
      concurrency: {
        strategy: "queue",
        maxQueueSize: 5,
        onQueueFull: "drop-oldest",
      },
      state: createDiscordSubscriptionStateAdapter(context.runtimeState),
    });
  }

  private registerChatHandlers(app: ChatSdkApp): void {
    app.onDirectMessage(async (thread, message, _channel, context) => {
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onNewMention(async (thread, message, context) => {
      const platformConfig = this.getPlatformConfig(thread);
      if (
        platformConfig &&
        this.shouldRouteDiscordMessage(thread, message, platformConfig) &&
        !thread.isDM &&
        platformConfig.useThreads
      ) {
        await this.subscribeOwnedDiscordThread(thread, message);
      }
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onSubscribedMessage(async (thread, message, context) => {
      if (!(await this.shouldRouteSubscribedMessage(thread, message))) return;
      await this.handleRoutedMessage(thread, message, context);
    });

    if (
      this.config.adapters.discord &&
      !this.config.adapters.discord.requireMention
    ) {
      app.onNewMessage(
        ANY_MESSAGE_PATTERN,
        async (thread, message, context) => {
          await this.handleRoutedMessage(thread, message, context);
        },
      );
    }

    app.onNewMessage(URL_PATTERN, async (thread, message) => {
      await this.handlePassiveUrlCapture(thread, message);
    });

    app.onAction(
      [APPROVAL_CONFIRM_ACTION, APPROVAL_CANCEL_ACTION],
      async (event) => {
        await this.handleApprovalAction(event);
      },
    );

    app.onAction(PROMPT_ACTION, async (event) => {
      await this.handlePromptAction(event);
    });
  }

  private async handlePromptAction(event: ActionEvent): Promise<void> {
    if (!this.context || !event.thread || !event.value) return;
    const platform = event.adapter.name;
    if (!this.isEnabledPlatform(platform)) return;

    const thread = event.thread as Thread;
    if (!this.shouldHandleDiscordAction(thread, platform)) return;

    const action = this.promptActions.get(event.value);
    if (action?.threadId !== thread.id) {
      await thread.post(
        this.formatNoticePayload(
          "That suggested action is no longer available.",
          "Action unavailable",
        ),
      );
      return;
    }

    const ids = this.getThreadIdParts(thread.id);
    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      event.user.userId,
      {
        channelId: ids.channelId ?? thread.channelId,
        isBot: Boolean(event.user.isBot),
      },
    );
    const conversationId = this.getConversationId(platform, thread.id);
    const channelId = thread.id;

    this.startProcessingInput(channelId);
    try {
      if (this.getPlatformConfig(thread)?.showTypingIndicator) {
        await thread
          .startTyping()
          .catch((error: unknown) =>
            this.logger.debug("Typing indicator failed", { error, channelId }),
          );
      }

      const response = await this.context.agent.chat(
        action.prompt,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: platform,
          channelId,
          channelName: thread.isDM ? "DM" : thread.channelId,
          ...this.buildActionEventMetadata(platform, thread, event),
        },
      );
      await this.renderAgentResponse({
        thread,
        channelId,
        conversationId,
        response,
        userPermissionLevel,
      });
    } catch (error: unknown) {
      this.logger.error("Error handling chat prompt action", {
        error,
        channelId,
      });
      await thread.post(
        this.toDiscordCardOutput(this.formatErrorPayload(error)) ??
          "Message failed.",
      );
    } finally {
      this.endProcessingInput();
    }
  }

  private async handleApprovalAction(event: ActionEvent): Promise<void> {
    if (!this.context || !event.thread || !event.value) return;
    const platform = event.adapter.name;
    if (!this.isEnabledPlatform(platform)) return;

    const conversationId = this.getConversationId(platform, event.thread.id);
    const approvalIds = await this.getPendingApprovalIds(conversationId);
    if (!approvalIds.has(event.value)) {
      await event.thread.post(
        this.formatNoticePayload("That approval is no longer pending."),
      );
      return;
    }

    const thread = event.thread as Thread;
    if (!this.shouldHandleDiscordAction(thread, platform)) return;

    const ids = this.getThreadIdParts(thread.id);
    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      event.user.userId,
      {
        channelId: ids.channelId ?? thread.channelId,
        isBot: Boolean(event.user.isBot),
      },
    );

    await this.confirmApproval({
      thread,
      conversationId,
      approvalId: event.value,
      confirmed: event.actionId === APPROVAL_CONFIRM_ACTION,
      userPermissionLevel,
      metadata: this.buildActionEventMetadata(platform, thread, event),
    });
  }

  private shouldHandleDiscordAction(thread: Thread, platform: string): boolean {
    if (platform !== "discord") return true;
    const platformConfig = this.config.adapters.discord;
    if (!platformConfig) return false;
    if (thread.isDM && !platformConfig.allowDMs) return false;
    return this.isAllowedChannel(thread, platformConfig);
  }

  private async subscribeOwnedDiscordThread(
    thread: Thread,
    message: Message,
  ): Promise<void> {
    if (!this.isBotCreatedDiscordThread(thread, message)) return;

    try {
      await thread.subscribe();
      await this.discordSubscriptions?.set(thread.id, {
        subscribedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.debug("Discord thread subscription failed", {
        error,
        threadId: thread.id,
      });
    }
  }

  private async shouldRouteSubscribedMessage(
    thread: Thread,
    message: Message,
  ): Promise<boolean> {
    if (this.getPlatform(thread) !== "discord") return false;
    if (thread.isDM) return true;

    const subscription = await this.discordSubscriptions?.get(thread.id);
    if (!subscription) return false;

    if (subscription.routingMode === "mention-required") {
      if (!message.isMention && !subscription.mentionRequiredNoticeSent) {
        await this.postMentionRequiredNotice(thread, subscription);
      }
      return Boolean(message.isMention);
    }

    const mentionRequired =
      await this.shouldRequireMentionInSubscribedThread(thread);
    if (!mentionRequired) return true;

    const nextSubscription: DiscordThreadSubscriptionState = {
      ...subscription,
      routingMode: "mention-required",
    };

    if (!message.isMention && !subscription.mentionRequiredNoticeSent) {
      await this.postMentionRequiredNotice(thread, nextSubscription);
    } else {
      await this.discordSubscriptions?.set(thread.id, nextSubscription);
    }

    return Boolean(message.isMention);
  }

  private async postMentionRequiredNotice(
    thread: Thread,
    subscription: DiscordThreadSubscriptionState,
  ): Promise<void> {
    await thread.post(DISCORD_MENTION_REQUIRED_NOTICE);
    await this.discordSubscriptions?.set(thread.id, {
      ...subscription,
      routingMode: "mention-required",
      mentionRequiredNoticeSent: true,
    });
  }

  private async shouldRequireMentionInSubscribedThread(
    thread: Thread,
  ): Promise<boolean> {
    try {
      const participants = await thread.getParticipants();
      const humanParticipants = participants.filter(
        (participant) => !participant.isBot && !participant.isMe,
      );
      return humanParticipants.length > 1;
    } catch (error) {
      this.logger.debug("Failed to inspect Discord thread participants", {
        error,
        threadId: thread.id,
      });
      return false;
    }
  }

  private isBotCreatedDiscordThread(thread: Thread, message: Message): boolean {
    if (thread.isDM) return false;
    const ids = this.getThreadIdParts(thread.id);
    if (!ids.threadId) return false;
    const rawChannelId = this.getRawDiscordChannelId(message);
    return rawChannelId !== undefined && rawChannelId !== ids.threadId;
  }

  private getRawDiscordChannelId(message: Message): string | undefined {
    const raw = message.raw;
    if (typeof raw !== "object" || raw === null) return undefined;
    const value = (raw as Record<string, unknown>)["channel_id"];
    return typeof value === "string" ? value : undefined;
  }

  private async handleRoutedMessage(
    thread: Thread,
    message: Message,
    context?: MessageContext,
  ): Promise<void> {
    if (!this.context) return;
    const platform = this.getPlatform(thread);
    if (platform !== "discord") return;

    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig) return;
    if (!this.shouldRouteDiscordMessage(thread, message, platformConfig))
      return;

    await this.routeToAgent(platform, thread, message, context);
  }

  private shouldRouteDiscordMessage(
    thread: Thread,
    message: Message,
    platformConfig: DiscordChatAdapterConfig,
  ): boolean {
    if (thread.isDM && !platformConfig.allowDMs) return false;
    if (message.author.isMe) return false;
    if (message.author.isBot && !message.isMention) return false;
    if (!this.isAllowedChannel(thread, platformConfig)) return false;
    return true;
  }

  private async routeToAgent(
    platform: string,
    thread: Thread,
    message: Message,
    context?: MessageContext,
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
    const agentInput = await this.buildAgentInput(
      platform,
      thread,
      message,
      userPermissionLevel,
    );
    const sameTurnUploads = [...agentInput.attachments];
    await this.attachPriorUploads(
      conversationId,
      agentInput,
      userPermissionLevel,
    );
    await this.postUploadNotices(thread, agentInput.notices);
    if (!agentInput.message && agentInput.attachments.length === 0) return;
    this.rememberUploadAttachments(conversationId, sameTurnUploads);

    this.startProcessingInput(channelId);
    try {
      if (this.getPlatformConfig(thread)?.showTypingIndicator) {
        await thread
          .startTyping()
          .catch((error: unknown) =>
            this.logger.debug("Typing indicator failed", { error, channelId }),
          );
      }

      const pendingApprovalIds =
        await this.getPendingApprovalIds(conversationId);
      if (pendingApprovalIds.size > 0) {
        await this.handleConfirmationResponse(
          agentInput.message,
          conversationId,
          thread,
          pendingApprovalIds,
          userPermissionLevel,
          this.buildUserMessageMetadata(platform, thread, message),
        );
        return;
      }

      const coalescedInput = this.buildCoalescedAgentInput(
        agentInput.message,
        context,
      );
      const response = await this.context.agent.chat(
        coalescedInput.message,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: platform,
          channelId,
          channelName: this.getChannelName(thread),
          ...this.buildUserMessageMetadata(
            platform,
            thread,
            message,
            coalescedInput.metadata,
          ),
          ...(agentInput.attachments.length > 0
            ? { attachments: agentInput.attachments }
            : {}),
        },
      );

      await this.renderAgentResponse({
        thread,
        channelId,
        conversationId,
        response,
        userPermissionLevel,
      });
    } catch (error: unknown) {
      this.logger.error("Error handling chat message", { error, channelId });
      this.sendMessageToChannel({
        channelId,
        message: this.formatErrorPayload(error),
      });
    } finally {
      this.endProcessingInput();
    }
  }

  private async renderAgentResponse(input: {
    thread: Thread;
    channelId: string;
    conversationId: string;
    response: AgentResponse;
    userPermissionLevel: UserPermissionLevel;
  }): Promise<void> {
    this.rememberPendingConfirmationsFromResponse(
      input.conversationId,
      input.response,
    );
    await this.handleAgentResponseToolStatuses(
      input.response,
      input.conversationId,
    );
    const artifactDelivery = await this.artifactDelivery.resolve(
      input.response.cards,
      input.userPermissionLevel,
    );
    const messageId = await this.sendAgentResponseWithFiles({
      thread: input.thread,
      channelId: input.channelId,
      message: this.formatAgentResponseText(
        input.response.text,
        input.response.cards,
        input.response.pendingConfirmations,
        artifactDelivery.deniedCardIds,
      ),
      files: artifactDelivery.files,
    });
    const artifactMessageId = await this.sendArtifactCards(
      input.thread,
      input.response.cards,
      artifactDelivery.deniedCardIds,
    );
    await this.sendSupplementalCards(
      input.thread,
      input.response.cards,
      input.response.pendingConfirmations,
    );
    await this.approvalCards.trackPendingConfirmations(
      input.thread,
      input.conversationId,
      input.response.pendingConfirmations,
    );

    const progressMessageId = artifactMessageId ?? messageId;
    if (progressMessageId) {
      for (const jobId of getResponseJobIds(input.response)) {
        this.trackAgentResponseForJob(
          jobId,
          progressMessageId,
          input.channelId,
        );
      }
    }
  }

  private rememberPendingConfirmationsFromResponse(
    conversationId: string,
    response: AgentResponse,
  ): void {
    this.pendingApprovals.rememberFromResponse(conversationId, response);
  }

  private async getPendingApprovalIds(
    conversationId: string,
  ): Promise<Set<string>> {
    return this.pendingApprovals.getApprovalIds(conversationId);
  }

  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    thread: Thread,
    approvalIds: Set<string>,
    userPermissionLevel: UserPermissionLevel,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const routed = routeConfirmationResponse({ message, approvalIds });
    if (routed.kind === "not-confirmation") {
      this.pendingApprovals.deleteConversation(conversationId);
      await thread.post(
        this.formatNoticePayload("No pending approval to resolve."),
      );
      return;
    }

    if (routed.kind === "notice") {
      await thread.post(this.formatNoticePayload(routed.message));
      return;
    }

    await this.confirmApproval({
      thread,
      conversationId,
      approvalId: routed.approvalId,
      confirmed: routed.confirmed,
      userPermissionLevel,
      ...(metadata ? { metadata } : {}),
    });
  }

  private async confirmApproval(input: {
    thread: Thread;
    conversationId: string;
    approvalId: string;
    confirmed: boolean;
    userPermissionLevel: UserPermissionLevel;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const response = await this.context?.agent.confirmPendingAction(
      input.conversationId,
      input.confirmed,
      input.approvalId,
      {
        userPermissionLevel: input.userPermissionLevel,
        interfaceType: "discord",
        channelId: input.thread.id,
        channelName: input.thread.isDM ? "DM" : input.thread.channelId,
        ...input.metadata,
      },
    );
    this.removePendingApproval(input.conversationId, input.approvalId);
    if (!response) return;

    this.syncPendingConfirmationsFromResponse(
      input.conversationId,
      response,
      input.approvalId,
    );
    await this.handleAgentResponseToolStatuses(response, input.conversationId);
    const artifactDelivery = await this.artifactDelivery.resolve(
      response.cards,
      input.userPermissionLevel,
    );
    await this.approvalCards.resolve(
      input.conversationId,
      input.approvalId,
      input.confirmed,
    );
    await this.sendAgentResponseWithFiles({
      thread: input.thread,
      channelId: input.thread.id,
      message: this.formatConfirmationResponsePayload(
        response,
        input.confirmed,
        this.getRemainingApprovalHelp(input.conversationId, response),
        artifactDelivery.deniedCardIds,
      ),
      files: artifactDelivery.files,
    });
    await this.sendArtifactCards(
      input.thread,
      response.cards,
      artifactDelivery.deniedCardIds,
    );
    await this.sendSupplementalCards(
      input.thread,
      response.cards,
      response.pendingConfirmations,
    );
    await this.approvalCards.trackPendingConfirmations(
      input.thread,
      input.conversationId,
      response.pendingConfirmations,
    );
  }

  private formatNoticePayload(
    message: string,
    title = "Approval notice",
  ): DiscordCardOutput {
    return {
      card: {
        type: "card",
        title,
        children: [{ type: "text", content: message }],
      },
      fallbackText: message,
    };
  }

  private formatErrorPayload(error: unknown): MessageInterfaceOutput {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      card: {
        type: "card",
        title: "Message failed",
        children: [{ type: "text", content: message }],
      },
      fallbackText: `Message failed: ${message}`,
    };
  }

  private formatAgentResponseText(
    text: string,
    cards: StructuredChatCard[] | undefined,
    pendingConfirmations?: PendingConfirmation[],
    deniedCardIds?: Set<string>,
  ): string {
    return buildAgentResponseTextParts({
      text,
      cards,
      pendingConfirmations,
      deniedCardIds,
      formatCard: (card): string =>
        this.cardBuilder.formatStructuredCard(card, deniedCardIds),
    }).join("\n\n");
  }

  private formatConfirmationResponsePayload(
    response: AgentResponse,
    confirmed: boolean,
    remainingApprovalHelp?: string,
    deniedCardIds?: Set<string>,
  ): MessageInterfaceOutput {
    const result = buildConfirmationResponseParts({
      response,
      confirmed,
      remainingApprovalHelp,
      deniedCardIds,
      formatCard: (card): string =>
        this.cardBuilder.formatStructuredCard(card, deniedCardIds),
      formatPendingConfirmationHelp,
    });

    return {
      card: {
        type: "card",
        title: getConfirmationResultTitle(result.variant),
        children: result.parts.map((content) => ({ type: "text", content })),
      },
      fallbackText: result.parts.join("\n\n"),
    };
  }

  private async sendAgentResponseWithFiles(input: {
    thread: Thread;
    channelId: string;
    message: MessageInterfaceOutput;
    files: FileUpload[];
  }): Promise<string | undefined> {
    if (input.files.length === 0) {
      return this.sendMessageWithId({
        channelId: input.channelId,
        message: input.message,
      });
    }

    const cardOutput = this.toDiscordCardOutput(input.message);
    if (cardOutput) {
      const sent = await input.thread.post({
        ...cardOutput,
        files: input.files,
      });
      this.threadRegistry.trackMessage(input.channelId, sent);
      return sent.id;
    }

    const text =
      typeof input.message === "string"
        ? input.message
        : "Generated artifacts attached.";
    const chunks = this.chunkForChannel(input.channelId, text);
    let lastSent: SentMessage | undefined;
    for (const [index, chunk] of chunks.entries()) {
      const isLastChunk = index === chunks.length - 1;
      lastSent = await input.thread.post(
        isLastChunk
          ? {
              markdown: chunk || "Generated artifacts attached.",
              files: input.files,
            }
          : chunk,
      );
      this.threadRegistry.trackMessage(input.channelId, lastSent);
    }
    return lastSent?.id;
  }

  private getRemainingApprovalHelp(
    conversationId: string,
    response: AgentResponse,
  ): string | undefined {
    return this.pendingApprovals.formatRemainingApprovalHelp(
      conversationId,
      response,
    );
  }

  private async sendArtifactCards(
    thread: Thread,
    cards: StructuredChatCard[] | undefined,
    deniedCardIds?: Set<string>,
  ): Promise<string | undefined> {
    let lastMessageId: string | undefined;
    for (const card of getDeliverableArtifactCards(cards, deniedCardIds)) {
      const display = formatArtifactDisplay(card);
      if (!display) continue;
      const sent = await thread.post({
        card: this.cardBuilder.buildArtifactCard(display),
        fallbackText: this.cardBuilder.formatArtifactFallback(display),
      });
      this.threadRegistry.trackMessage(thread.id, sent);
      lastMessageId = sent.id;
    }
    return lastMessageId;
  }

  private async sendSupplementalCards(
    thread: Thread,
    cards: StructuredChatCard[] | undefined,
    pendingConfirmations?: PendingConfirmation[],
  ): Promise<void> {
    for (const card of getSupplementalCards(cards, pendingConfirmations)) {
      const built = this.cardBuilder.buildSupplementalCard(thread.id, card);
      if (!built) continue;
      const sent = await thread.post({
        card: built,
        fallbackText: this.cardBuilder.formatStructuredCard(card),
      });
      this.threadRegistry.trackMessage(thread.id, sent);
    }
  }

  private registerPromptAction(
    threadId: string,
    action: { label: string; prompt: string },
  ): string {
    const token = createPrefixedId("action");
    this.promptActions.set(token, { threadId, ...action });
    return token;
  }

  private async clearDiscordMessageComponents(
    threadId: string,
    messageId: string,
  ): Promise<void> {
    const ids = this.getThreadIdParts(threadId);
    const channelId = ids.threadId ?? ids.channelId;
    if (!channelId || !this.config.adapters.discord) return;
    try {
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bot ${this.config.adapters.discord.botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ components: [] }),
        },
      );
      if (!response.ok) {
        this.logger.debug("Failed to clear Discord message components", {
          messageId,
          channelId,
          status: response.status,
        });
      }
    } catch (error) {
      this.logger.debug("Failed to clear Discord message components", {
        error,
        messageId,
        channelId,
      });
    }
  }

  private getPreferredDisplayBaseUrl(): string | undefined {
    if (this.context?.preferLocalUrls && this.context.localSiteUrl) {
      return this.context.localSiteUrl;
    }
    return this.context?.siteUrl ?? this.context?.localSiteUrl;
  }

  private syncPendingConfirmationsFromResponse(
    conversationId: string,
    response: AgentResponse,
    resolvedApprovalId: string,
  ): void {
    this.pendingApprovals.syncFromResponse(
      conversationId,
      response,
      resolvedApprovalId,
    );
  }

  private removePendingApproval(
    conversationId: string,
    approvalId: string,
  ): void {
    this.pendingApprovals.removeApproval(conversationId, approvalId);
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
    if (message.author.isMe) return;
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

  private async buildAgentInput(
    platform: string,
    thread: Thread,
    message: Message,
    userLevel: string,
  ): Promise<AgentInput> {
    const agentInput: AgentInput = {
      message: message.text.trim(),
      attachments: [],
      notices: [],
    };
    if (message.attachments.length === 0) return agentInput;
    if (!this.context) return agentInput;

    const canUpload = userLevel === "anchor" || userLevel === "trusted";
    if (!canUpload) return agentInput;

    const uploadStore = this.context.uploads.scoped(
      createDiscordChatUploadStoreScope(),
    );
    for (const attachment of message.attachments) {
      const attachmentName = attachment.name;
      if (!attachmentName) continue;
      const filename = sanitizeUploadFilename(attachmentName, "upload");
      const mediaType = normalizeMessageUploadMediaType(
        filename,
        attachment.mimeType,
      );
      const declaredSize = attachment.size ?? 0;
      const uploadKind = getMessageUploadKind(filename, mediaType);
      if (!uploadKind) {
        agentInput.notices.push(`Unsupported file upload type: ${filename}`);
        continue;
      }
      if (!isMessageUploadDeclaredSizeAllowed(uploadKind, declaredSize)) {
        agentInput.notices.push(`File upload too large: ${filename}`);
        continue;
      }

      try {
        const content = await this.readMessageAttachmentData(attachment);
        if (!content) continue;
        const validation = validateMessageUpload({
          filename,
          mediaType,
          content,
          fallbackFilename: "upload",
        });
        if (!validation.ok) {
          agentInput.notices.push(validation.message);
          continue;
        }
        const chatAttachment = await this.createChatAttachmentFromUpload({
          uploadStore,
          filename: validation.filename,
          mediaType: validation.mediaType,
          content,
          uploadKind: validation.kind,
          metadata: this.buildUploadMetadata(platform, thread, message),
        });
        agentInput.attachments.push(chatAttachment);
      } catch (error: unknown) {
        this.logger.error("Failed to read chat attachment", {
          error,
          filename,
        });
        agentInput.notices.push(`Could not read file upload: ${filename}`);
      }
    }

    return agentInput;
  }

  private async readMessageAttachmentData(
    attachment: Message["attachments"][number],
  ): Promise<Buffer | undefined> {
    if (attachment.fetchData) return attachment.fetchData();
    if (!attachment.url) return undefined;

    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(
        `Attachment download failed with status ${response.status}`,
      );
    }
    const data = await response.arrayBuffer();
    return Buffer.from(new Uint8Array(data));
  }

  private async createChatAttachmentFromUpload(input: {
    uploadStore: RuntimeUploadStore;
    filename: string;
    mediaType: string;
    content: Buffer;
    uploadKind: "text" | "file";
    metadata: Record<string, unknown>;
  }): Promise<ChatAttachment> {
    const record = await input.uploadStore.save({
      filename: input.filename,
      mediaType: input.mediaType,
      content: input.content,
      metadata: input.metadata,
    });
    const source = record.ref;
    if (input.uploadKind === "text") {
      return {
        kind: "text",
        filename: record.filename,
        mediaType: record.mediaType,
        content: input.content.toString("utf8").replace(/^\uFEFF/, ""),
        sizeBytes: input.content.byteLength,
        source,
      };
    }

    return {
      kind: "file",
      filename: record.filename,
      mediaType: record.mediaType,
      data: input.content,
      sizeBytes: input.content.byteLength,
      source,
    };
  }

  private buildUploadMetadata(
    platform: string,
    thread: Thread,
    message: Message,
  ): Record<string, unknown> {
    const ids = this.getThreadIdParts(thread.id);
    return {
      interfaceType: platform,
      channelId: thread.id,
      parentChannelId: thread.channelId,
      messageId: message.id,
      uploaderId: message.author.userId,
      uploaderUsername: message.author.userName,
      ...(ids.guildId ? { guildId: ids.guildId } : {}),
      ...(ids.threadId ? { threadId: ids.threadId } : {}),
    };
  }

  private async postUploadNotices(
    thread: Thread,
    notices: string[],
  ): Promise<void> {
    const uniqueNotices = [...new Set(notices)];
    if (uniqueNotices.length === 0) return;
    await thread.post(
      [
        "Some uploads were skipped:",
        ...uniqueNotices.map((notice) => `- ${notice}`),
      ].join("\n"),
    );
  }

  private async attachPriorUploads(
    conversationId: string,
    agentInput: AgentInput,
    userLevel: string,
  ): Promise<void> {
    agentInput.attachments = await this.uploadContinuity.selectPriorUploads({
      conversationId,
      currentAttachments: agentInput.attachments,
      canRestore: userLevel === "anchor" || userLevel === "trusted",
    });
  }

  private rememberUploadAttachments(
    conversationId: string,
    attachments: ChatAttachment[],
  ): void {
    this.uploadContinuity.remember(conversationId, attachments);
  }

  private createChatAttachmentFromStoredUpload(
    filename: string,
    mediaType: string,
    content: Buffer,
    source: { kind: string; id: string },
  ): ChatAttachment {
    if (isUploadableTextFile(filename, mediaType)) {
      return {
        kind: "text",
        filename,
        mediaType,
        content: content.toString("utf8").replace(/^\uFEFF/, ""),
        sizeBytes: content.byteLength,
        source,
      };
    }
    return {
      kind: "file",
      filename,
      mediaType,
      data: content,
      sizeBytes: content.byteLength,
      source,
    };
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

  private getChannelName(thread: Thread): string {
    return thread.isDM ? "DM" : thread.channelId;
  }

  private buildCoalescedAgentInput(
    message: string,
    context?: MessageContext,
  ): { message: string; metadata?: Record<string, unknown> } {
    const coalesced = buildCoalescedInput({
      message,
      skippedMessages: (context?.skipped ?? []).map((skippedMessage) => ({
        id: skippedMessage.id,
        text: skippedMessage.text,
        authorName:
          skippedMessage.author.fullName || skippedMessage.author.userName,
      })),
    });
    return coalesced.metadata
      ? { message: coalesced.message, metadata: { ...coalesced.metadata } }
      : { message: coalesced.message };
  }

  private buildUserMessageMetadata(
    platform: string,
    thread: Thread,
    message: Message,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      actor: this.buildActorMetadata(platform, {
        userId: message.author.userId,
        userName: message.author.userName,
        fullName: message.author.fullName,
        isBot: message.author.isBot,
      }),
      source: this.buildSourceMetadata(thread, {
        messageId: message.id,
        channelName: this.getChannelName(thread),
        ...(metadata ? { metadata } : {}),
      }),
    };
  }

  private buildActionEventMetadata(
    platform: string,
    thread: Thread,
    event: ActionEvent,
  ): Record<string, unknown> {
    return {
      actor: this.buildActorMetadata(platform, {
        userId: event.user.userId,
        userName: event.user.userName,
        fullName: event.user.fullName,
        isBot: event.user.isBot,
      }),
      source: this.buildSourceMetadata(thread, {
        messageId: event.messageId,
        channelName: this.getChannelName(thread),
        metadata: {
          actionId: event.actionId,
          ...(event.value ? { actionValue: event.value } : {}),
        },
      }),
    };
  }

  private buildActorMetadata(
    platform: string,
    actor: {
      userId: string;
      userName: string;
      fullName: string;
      isBot: boolean | string;
    },
  ): Record<string, unknown> {
    return buildMessageActorMetadata({
      actorId: `${platform}:${actor.userId}`,
      interfaceType: platform,
      displayName: actor.fullName || actor.userName,
      username: actor.userName,
      isBot: actor.isBot,
    });
  }

  private buildSourceMetadata(
    thread: Thread,
    input: {
      messageId: string;
      channelName: string;
      metadata?: Record<string, unknown>;
    },
  ): Record<string, unknown> {
    const ids = this.getThreadIdParts(thread.id);
    return buildMessageSourceMetadata({
      messageId: input.messageId,
      channelId: thread.id,
      channelName: input.channelName,
      ...(ids.threadId ? { threadId: ids.threadId } : {}),
      metadata: {
        ...(input.metadata ?? {}),
        ...(ids.guildId ? { guildId: ids.guildId } : {}),
      },
    });
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
    this.uploadContinuity.clear();
    this.toolStatusMessenger.clear();
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
