import {
  MessageInterfacePlugin,
  collectPendingApprovalIdsFromStoredMessages,
  collectUploadIdsFromStoredMessages,
  formatArtifactDisplay,
  formatConfirmationResult,
  getArtifactEntityFilename,
  parseArtifactDataUrl,
  permissionToVisibilityScope,
  resolveArtifactEntityRefFromCard,
  formatContentDispositionHeader,
  formatStructuredOutputSummary,
  getMessageUploadKind,
  isMessageUploadDeclaredSizeAllowed,
  isUploadableTextFile,
  normalizeMessageUploadMediaType,
  parseConfirmationResponse,
  sanitizeUploadFilename,
  selectReferencedAttachments,
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
  type FileUpload,
  type Message,
  type SentMessage,
  type Thread,
} from "chat";
import { z } from "zod";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { chunkMessage } from "@brains/utils";
import {
  chatConfigSchema,
  type ChatConfig,
  type DiscordChatAdapterConfig,
} from "./config";
import { ThreadRegistry } from "./thread-registry";
import {
  createDiscordSubscriptionStateAdapter,
  createDiscordThreadSubscriptionStore,
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
const DISCORD_NATIVE_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const APPROVAL_CONFIRM_ACTION = "approval.confirm";
const APPROVAL_CANCEL_ACTION = "approval.cancel";

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
  onAction(
    actionIds: string[] | string,
    handler: (event: ActionEvent) => Promise<void>,
  ): void;
}

export class ChatInterface extends MessageInterfacePlugin<ChatConfig> {
  declare protected config: ChatConfig;

  private app: ChatSdkApp | undefined;
  private readonly threadRegistry = new ThreadRegistry();
  private readonly pendingConfirmations = new Map<string, Set<string>>();
  private readonly approvalCardMessages = new Map<
    string,
    { message: SentMessage; summary: string; threadId: string }
  >();
  private readonly recentUploads = new Map<string, ChatAttachment[]>();
  private readonly toolStatusMessages = new Map<
    string,
    { channelId: string; message: SentMessage }
  >();
  private discordGatewayAdapter: DiscordChatAdapter | undefined;
  private discordSubscriptions: DiscordThreadSubscriptionStore | undefined;
  private gatewayAbortController: AbortController | undefined;
  private gatewayLoopPromise: Promise<void> | undefined;

  constructor(config: Partial<ChatConfig> = {}) {
    super("chat", packageJson, config, chatConfigSchema);
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
    const label = this.formatProgressLabel(event);
    const children: CardChild[] = [{ type: "text", content: label }];
    const progress = this.formatProgressAmount(event);
    if (progress) {
      children.push({ type: "text", content: progress });
    }
    if (event.message) {
      children.push({ type: "text", content: event.message });
    }

    return {
      card: {
        type: "card",
        title: this.getProgressTitle(event.status),
        children,
      },
      fallbackText: this.formatProgressFallback(event, label, progress),
    };
  }

  private formatProgressLabel(event: JobProgressEvent): string {
    const operationType = event.metadata.operationType.replace(/_/g, " ");
    return event.metadata.operationTarget
      ? `${operationType}: ${event.metadata.operationTarget}`
      : operationType;
  }

  private formatProgressAmount(event: JobProgressEvent): string | undefined {
    if (!event.progress || event.progress.total <= 0) return undefined;
    return `${event.progress.current}/${event.progress.total} (${event.progress.percentage}%)`;
  }

  private formatProgressFallback(
    event: JobProgressEvent,
    label: string,
    progress?: string,
  ): string {
    const firstLine = progress
      ? `${this.getProgressTitle(event.status)}: ${label} ${progress}`
      : `${this.getProgressTitle(event.status)}: ${label}`;
    return event.message ? `${firstLine}\n${event.message}` : firstLine;
  }

  private getProgressTitle(status: JobProgressEvent["status"]): string {
    switch (status) {
      case "pending":
        return "Job queued";
      case "processing":
        return "Job processing";
      case "completed":
        return "Job completed";
      case "failed":
        return "Job failed";
    }
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

    const key = this.getToolStatusKey(update);
    if (update.state === "running") {
      await this.sendToolStatusMessage(key, update);
      return;
    }

    await this.updateToolStatusMessage(key, update);
  }

  private async sendToolStatusMessage(
    key: string,
    update: ToolStatusUpdate,
  ): Promise<void> {
    const channelId = update.channelId;
    if (!channelId) return;
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;

    const sent = await thread.post(this.formatToolStatusPayload(update));
    this.threadRegistry.trackMessage(channelId, sent);
    this.toolStatusMessages.set(key, { channelId, message: sent });
  }

  private async updateToolStatusMessage(
    key: string,
    update: ToolStatusUpdate,
  ): Promise<void> {
    const payload = this.formatToolStatusPayload(update);
    const tracked = this.toolStatusMessages.get(key);
    if (tracked) {
      const edited = await tracked.message.edit(payload);
      this.threadRegistry.trackMessage(tracked.channelId, edited);
      this.toolStatusMessages.delete(key);
      return;
    }

    const channelId = update.channelId;
    if (!channelId) return;
    const thread = this.threadRegistry.get(channelId);
    if (!thread) return;
    const sent = await thread.post(payload);
    this.threadRegistry.trackMessage(channelId, sent);
  }

  private formatToolStatusPayload(update: ToolStatusUpdate): {
    card: CardElement;
    fallbackText: string;
  } {
    const label = this.formatToolName(update.toolName);
    return {
      card: this.buildToolStatusCard(update, label),
      fallbackText: this.formatToolStatusFallback(update, label),
    };
  }

  private buildToolStatusCard(
    update: ToolStatusUpdate,
    label: string,
  ): CardElement {
    const children: CardChild[] = [{ type: "text", content: label }];
    if (update.error) {
      children.push({ type: "text", content: update.error });
    }
    return {
      type: "card",
      title: this.getToolStatusTitle(update.state),
      children,
    };
  }

  private formatToolStatusFallback(
    update: ToolStatusUpdate,
    label: string,
  ): string {
    const base = `${this.getToolStatusFallbackPrefix(update.state)}: ${label}`;
    return update.error ? `${base}: ${update.error}` : base;
  }

  private getToolStatusTitle(state: ToolStatusUpdate["state"]): string {
    switch (state) {
      case "running":
        return "Tool running";
      case "completed":
        return "Tool completed";
      case "awaiting-approval":
        return "Approval required";
      case "failed":
        return "Tool failed";
    }
  }

  private getToolStatusFallbackPrefix(
    state: ToolStatusUpdate["state"],
  ): string {
    switch (state) {
      case "running":
        return "Tool running";
      case "completed":
        return "Tool completed";
      case "awaiting-approval":
        return "Tool awaiting approval";
      case "failed":
        return "Tool failed";
    }
  }

  private getToolStatusKey(update: ToolStatusUpdate): string {
    return `${update.conversationId}:${update.toolName}`;
  }

  private formatToolName(toolName: string): string {
    return toolName.replace(/[_-]+/g, " ");
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
      state: createDiscordSubscriptionStateAdapter(context.runtimeState),
    });
  }

  private registerChatHandlers(app: ChatSdkApp): void {
    app.onDirectMessage(async (thread, message) => {
      await this.handleRoutedMessage(thread, message);
    });

    app.onNewMention(async (thread, message) => {
      const platformConfig = this.getPlatformConfig(thread);
      if (
        platformConfig &&
        this.shouldRouteDiscordMessage(thread, message, platformConfig) &&
        !thread.isDM &&
        platformConfig.useThreads
      ) {
        await this.subscribeOwnedDiscordThread(thread, message);
      }
      await this.handleRoutedMessage(thread, message);
    });

    app.onSubscribedMessage(async (thread, message) => {
      if (!(await this.shouldRouteSubscribedMessage(thread))) return;
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

    app.onAction(
      [APPROVAL_CONFIRM_ACTION, APPROVAL_CANCEL_ACTION],
      async (event) => {
        await this.handleApprovalAction(event);
      },
    );
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

    const ids = this.getThreadIdParts(event.thread.id);
    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      event.user.userId,
      {
        channelId: ids.channelId ?? event.thread.channelId,
        isBot: Boolean(event.user.isBot),
      },
    );

    await this.confirmApproval({
      thread: event.thread as Thread,
      conversationId,
      approvalId: event.value,
      confirmed: event.actionId === APPROVAL_CONFIRM_ACTION,
      userPermissionLevel,
    });
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

  private async shouldRouteSubscribedMessage(thread: Thread): Promise<boolean> {
    if (this.getPlatform(thread) !== "discord") return false;
    if (thread.isDM) return true;
    return (await this.discordSubscriptions?.has(thread.id)) === true;
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
  ): Promise<void> {
    if (!this.context) return;
    const platform = this.getPlatform(thread);
    if (platform !== "discord") return;

    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig) return;
    if (!this.shouldRouteDiscordMessage(thread, message, platformConfig))
      return;

    await this.routeToAgent(platform, thread, message);
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
        );
        return;
      }

      const response = await this.context.agent.chat(
        agentInput.message,
        conversationId,
        {
          userPermissionLevel,
          interfaceType: platform,
          channelId,
          channelName: this.getChannelName(thread, message),
          ...this.buildUserMessageMetadata(platform, thread, message),
          ...(agentInput.attachments.length > 0
            ? { attachments: agentInput.attachments }
            : {}),
        },
      );

      this.rememberUploadAttachments(conversationId, sameTurnUploads);

      if (
        response.pendingConfirmations &&
        response.pendingConfirmations.length > 0
      ) {
        this.pendingConfirmations.set(
          conversationId,
          new Set(
            response.pendingConfirmations.map(
              (confirmation) => confirmation.id,
            ),
          ),
        );
      }

      await this.handleAgentResponseToolStatuses(response, conversationId);
      const artifactDelivery = await this.resolveArtifactDelivery(
        response.cards,
        userPermissionLevel,
      );
      const messageId = await this.sendAgentResponseWithFiles({
        thread,
        channelId,
        message: this.formatAgentResponseText(
          response.text,
          response.cards,
          response.pendingConfirmations,
          artifactDelivery.deniedCardIds,
        ),
        files: artifactDelivery.files,
      });
      const artifactMessageId = await this.sendArtifactCards(
        thread,
        response.cards,
        artifactDelivery.deniedCardIds,
      );
      await this.sendSupplementalCards(
        thread,
        response.cards,
        response.pendingConfirmations,
      );
      await this.sendPendingConfirmationCards(
        thread,
        response.pendingConfirmations,
      );

      const progressMessageId = artifactMessageId ?? messageId;
      if (progressMessageId) {
        for (const jobId of this.getResponseJobIds(response)) {
          this.trackAgentResponseForJob(jobId, progressMessageId, channelId);
        }
      }
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

  private async getPendingApprovalIds(
    conversationId: string,
  ): Promise<Set<string>> {
    const existing = this.pendingConfirmations.get(conversationId);
    if (existing && existing.size > 0) return existing;

    const restored =
      await this.loadPendingApprovalIdsFromConversation(conversationId);
    if (restored.size > 0)
      this.pendingConfirmations.set(conversationId, restored);
    return restored;
  }

  private async loadPendingApprovalIdsFromConversation(
    conversationId: string,
  ): Promise<Set<string>> {
    const messages = await this.context?.conversations
      .getMessages(conversationId, { limit: 50 })
      .catch((error: unknown) => {
        this.logger.debug("Failed to load pending chat approvals", {
          error,
          conversationId,
        });
        return [];
      });
    return collectPendingApprovalIdsFromStoredMessages(messages ?? []);
  }

  private async handleConfirmationResponse(
    message: string,
    conversationId: string,
    thread: Thread,
    approvalIds: Set<string>,
    userPermissionLevel: UserPermissionLevel,
  ): Promise<void> {
    const parsed = this.parseConfirmationIntent(message, approvalIds);
    if (!parsed) {
      await thread.post(
        this.formatNoticePayload(
          "Please reply with yes to confirm or no/cancel to abort.",
        ),
      );
      return;
    }

    if (!parsed.approvalId && this.hasExplicitApprovalReference(message)) {
      await thread.post(
        this.formatNoticePayload(
          `No matching pending approval id. Pending approval ids: ${[
            ...approvalIds,
          ].join(", ")}.`,
        ),
      );
      return;
    }

    if (approvalIds.size > 1 && !parsed.approvalId) {
      await thread.post(
        this.formatNoticePayload(
          `Multiple approvals are pending; include one approval id with yes or no/cancel: ${[
            ...approvalIds,
          ].join(", ")}.`,
        ),
      );
      return;
    }

    const approvalId = parsed.approvalId ?? [...approvalIds][0];
    if (!approvalId) {
      this.pendingConfirmations.delete(conversationId);
      await thread.post(
        this.formatNoticePayload("No pending approval to resolve."),
      );
      return;
    }

    await this.confirmApproval({
      thread,
      conversationId,
      approvalId,
      confirmed: parsed.confirmed,
      userPermissionLevel,
    });
  }

  private async confirmApproval(input: {
    thread: Thread;
    conversationId: string;
    approvalId: string;
    confirmed: boolean;
    userPermissionLevel: UserPermissionLevel;
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
    const artifactDelivery = await this.resolveArtifactDelivery(
      response.cards,
      input.userPermissionLevel,
    );
    await this.resolveApprovalCard(input.approvalId, input.confirmed);
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
    await this.sendPendingConfirmationCards(
      input.thread,
      response.pendingConfirmations,
    );
  }

  private parseConfirmationIntent(
    message: string,
    approvalIds: Set<string> | undefined,
  ): { confirmed: boolean; approvalId?: string | undefined } | undefined {
    const direct = parseConfirmationResponse(message);
    const approvalId = this.extractApprovalId(message, approvalIds);
    if (direct) return { ...direct, ...(approvalId ? { approvalId } : {}) };

    const tokenConfirmation = message
      .split(/\s+/)
      .map((token) => parseConfirmationResponse(token))
      .find((parsed) => parsed !== undefined);
    if (!tokenConfirmation) return undefined;
    return {
      ...tokenConfirmation,
      ...(approvalId ? { approvalId } : {}),
    };
  }

  private extractApprovalId(
    message: string,
    approvalIds: Set<string> | undefined,
  ): string | undefined {
    if (!approvalIds || approvalIds.size === 0) return undefined;
    const normalized = message.toLowerCase();
    return [...approvalIds]
      .sort((left, right) => right.length - left.length)
      .find((approvalId) =>
        this.containsApprovalIdToken(normalized, approvalId.toLowerCase()),
      );
  }

  private containsApprovalIdToken(
    message: string,
    approvalId: string,
  ): boolean {
    const escapedApprovalId = approvalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(^|[^a-z0-9_-])${escapedApprovalId}($|[^a-z0-9_-])`,
    ).test(message);
  }

  private hasExplicitApprovalReference(message: string): boolean {
    return /(^|[^a-z0-9_-])approval[:-][a-z0-9_-]+/i.test(message);
  }

  private formatNoticePayload(message: string): DiscordCardOutput {
    return {
      card: {
        type: "card",
        title: "Approval notice",
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
    const suppressApprovalCards = Boolean(pendingConfirmations?.length);
    const cardSummaries = (cards ?? [])
      .filter((card) => {
        if (suppressApprovalCards && card.kind === "tool-approval") {
          return false;
        }
        return card.kind === "attachment" && deniedCardIds?.has(card.id);
      })
      .map((card) => this.formatStructuredCard(card, deniedCardIds));
    return [text, ...cardSummaries]
      .filter((part): part is string => Boolean(part.trim()))
      .join("\n\n");
  }

  private formatConfirmationResponsePayload(
    response: AgentResponse,
    confirmed: boolean,
    remainingApprovalHelp?: string,
    deniedCardIds?: Set<string>,
  ): MessageInterfaceOutput {
    const display = formatConfirmationResult(
      response,
      confirmed ? "approved" : "declined",
    );
    const attachmentSummaries = (response.cards ?? [])
      .filter(
        (card) => card.kind === "attachment" && deniedCardIds?.has(card.id),
      )
      .map((card) => this.formatStructuredCard(card, deniedCardIds));
    const pendingHelp =
      response.pendingConfirmations && response.pendingConfirmations.length > 1
        ? this.formatPendingConfirmationHelp(response.pendingConfirmations)
        : undefined;
    const parts = [
      display.label,
      ...attachmentSummaries,
      pendingHelp,
      remainingApprovalHelp,
    ].filter((part): part is string => Boolean(part?.trim()));

    return {
      card: {
        type: "card",
        title: this.getConfirmationResultTitle(display.variant),
        children: parts.map((content) => ({ type: "text", content })),
      },
      fallbackText: parts.join("\n\n"),
    };
  }

  private getConfirmationResultTitle(
    variant: ReturnType<typeof formatConfirmationResult>["variant"],
  ): string {
    switch (variant) {
      case "success":
        return "Approval confirmed";
      case "declined":
        return "Approval declined";
      case "error":
        return "Action failed";
    }
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

  /**
   * Resolve which generated artifacts to deliver to a Discord caller: native
   * files for those visible to their permission level, plus the ids of cards
   * whose artifact exists but is out of scope. Denied cards have their link and
   * metadata suppressed so fallback links never expose restricted artifacts
   * outside the intended permission scope.
   */
  private async resolveArtifactDelivery(
    cards: StructuredChatCard[] | undefined,
    userLevel: UserPermissionLevel,
  ): Promise<{ files: FileUpload[]; deniedCardIds: Set<string> }> {
    const files: FileUpload[] = [];
    const deniedCardIds = new Set<string>();
    if (!cards || !this.context) return { files, deniedCardIds };

    const scope = permissionToVisibilityScope(userLevel);
    for (const card of cards) {
      if (card.kind !== "attachment") continue;
      const entityRef = resolveArtifactEntityRefFromCard(
        card,
        this.getPreferredDisplayBaseUrl(),
      );
      if (!entityRef) continue;

      const resolved = await this.resolveArtifactCard(
        card,
        entityRef,
        scope,
        userLevel,
      ).catch((error: unknown) => {
        this.logger.debug("Failed to resolve Discord artifact file", {
          error,
          cardId: card.id,
        });
        return undefined;
      });
      if (resolved?.denied) deniedCardIds.add(card.id);
      if (resolved?.file) files.push(resolved.file);
    }
    return { files, deniedCardIds };
  }

  private async resolveArtifactCard(
    card: Extract<StructuredChatCard, { kind: "attachment" }>,
    entityRef: NonNullable<ReturnType<typeof resolveArtifactEntityRefFromCard>>,
    scope: ReturnType<typeof permissionToVisibilityScope>,
    userLevel: UserPermissionLevel,
  ): Promise<{ file?: FileUpload; denied?: boolean }> {
    const context = this.context;
    if (!context) return {};

    const entity = await context.entityService.getEntity({
      ...entityRef,
      visibilityScope: scope,
    });
    if (!entity) {
      // Not visible at this scope. Suppress the link/metadata only when the
      // artifact actually exists (out of scope); leave genuinely-missing or
      // unresolved references untouched so their links still render.
      const exists = Boolean(await context.entityService.getEntity(entityRef));
      return exists ? { denied: true } : {};
    }
    if (typeof entity.content !== "string") return {};
    if (userLevel !== "anchor" && userLevel !== "trusted") return {};

    const parsed = parseArtifactDataUrl(entityRef.entityType, entity.content);
    if (!parsed) return {};
    if (parsed.data.byteLength > DISCORD_NATIVE_ARTIFACT_MAX_BYTES) {
      this.logger.debug("Skipping oversized Discord artifact upload", {
        cardId: card.id,
        sizeBytes: parsed.data.byteLength,
      });
      return {};
    }

    return {
      file: {
        data: parsed.data,
        filename:
          card.attachment.filename ??
          getArtifactEntityFilename(
            entity.metadata,
            entityRef.id,
            entityRef.entityType,
            parsed.mimeType,
          ),
        mimeType: parsed.mimeType,
      },
    };
  }

  private getResponseJobIds(response: AgentResponse): string[] {
    const jobIds = new Set<string>();
    for (const toolResult of response.toolResults ?? []) {
      if (toolResult.jobId) jobIds.add(toolResult.jobId);
    }
    for (const card of response.cards ?? []) {
      if (card.kind === "attachment" && card.jobId) jobIds.add(card.jobId);
    }
    return [...jobIds];
  }

  private getRemainingApprovalHelp(
    conversationId: string,
    response: AgentResponse,
  ): string | undefined {
    if (response.pendingConfirmations !== undefined) return undefined;
    const remainingIds = this.pendingConfirmations.get(conversationId);
    if (!remainingIds || remainingIds.size === 0) return undefined;
    return `Remaining pending approval ids: ${[...remainingIds]
      .map((approvalId) => `\`${approvalId}\``)
      .join(", ")}.`;
  }

  private async sendArtifactCards(
    thread: Thread,
    cards: StructuredChatCard[] | undefined,
    deniedCardIds?: Set<string>,
  ): Promise<string | undefined> {
    let lastMessageId: string | undefined;
    for (const card of cards ?? []) {
      if (card.kind !== "attachment" || deniedCardIds?.has(card.id)) continue;
      const display = formatArtifactDisplay(card);
      if (!display) continue;
      const sent = await thread.post({
        card: this.buildArtifactCard(display),
        fallbackText: this.formatArtifactFallback(display),
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
    const suppressRequestedApprovals = Boolean(pendingConfirmations?.length);
    for (const card of cards ?? []) {
      if (card.kind === "attachment") continue;
      if (
        suppressRequestedApprovals &&
        card.kind === "tool-approval" &&
        card.state === "approval-requested"
      ) {
        continue;
      }
      const built = this.buildSupplementalCard(card);
      if (!built) continue;
      const sent = await thread.post({
        card: built,
        fallbackText: this.formatStructuredCard(card),
      });
      this.threadRegistry.trackMessage(thread.id, sent);
    }
  }

  private buildSupplementalCard(
    card: StructuredChatCard,
  ): CardElement | undefined {
    switch (card.kind) {
      case "attachment":
        return undefined;
      case "tool-approval":
        return this.buildToolApprovalSummaryCard(card);
      case "sources":
        return this.buildSourcesSummaryCard(card);
      case "actions":
        return this.buildActionsSummaryCard(card);
    }
  }

  private buildToolApprovalSummaryCard(
    card: Extract<StructuredChatCard, { kind: "tool-approval" }>,
  ): CardElement {
    const children: CardChild[] = [
      {
        type: "text",
        content: card.summary || this.formatToolName(card.toolName),
      },
      { type: "text", content: `Status: ${card.state}` },
    ];
    if (card.preview) children.push({ type: "text", content: card.preview });
    const output = this.formatCardOutput(card.output);
    if (output) children.push({ type: "text", content: `Result: ${output}` });
    if (card.error)
      children.push({ type: "text", content: `Error: ${card.error}` });
    return {
      type: "card",
      title:
        card.state === "approval-requested"
          ? "Approval required"
          : "Approval status",
      children,
    };
  }

  private buildSourcesSummaryCard(
    card: Extract<StructuredChatCard, { kind: "sources" }>,
  ): CardElement {
    const children: CardChild[] = card.sources.map((source) => ({
      type: "text" as const,
      content: source.title ?? source.source,
    }));
    const linkButtons = card.sources
      .map((source, index) =>
        this.buildSourceLinkButton(
          card.sources.length === 1 ? "Open source" : `Open ${index + 1}`,
          source.url,
        ),
      )
      .filter(
        (
          button,
        ): button is { type: "link-button"; label: string; url: string } =>
          Boolean(button),
      );
    if (linkButtons.length > 0) {
      children.push({ type: "actions", children: linkButtons });
    }
    return {
      type: "card",
      title: card.title ?? "Sources",
      children,
    };
  }

  private buildSourceLinkButton(
    label: string,
    url: string | undefined,
  ): { type: "link-button"; label: string; url: string } | undefined {
    const resolvedUrl = this.resolveDisplayUrl(url);
    if (!resolvedUrl || this.isLocalDisplayUrl(resolvedUrl)) return undefined;
    return { type: "link-button", label, url: resolvedUrl };
  }

  private buildActionsSummaryCard(
    card: Extract<StructuredChatCard, { kind: "actions" }>,
  ): CardElement {
    return {
      type: "card",
      title: card.title ?? "Suggested actions",
      children: card.actions.map((action) => ({
        type: "text" as const,
        content: action.description
          ? `${action.label} — ${action.description}`
          : action.label,
      })),
    };
  }

  private buildArtifactCard(
    display: NonNullable<ReturnType<typeof formatArtifactDisplay>>,
  ): CardElement {
    const children: CardChild[] = [];
    if (display.description) {
      children.push({ type: "text", content: display.description });
    }

    const fields = [
      display.filename
        ? { type: "field" as const, label: "File", value: display.filename }
        : undefined,
      display.mediaType
        ? { type: "field" as const, label: "Type", value: display.mediaType }
        : undefined,
      display.sizeLabel
        ? { type: "field" as const, label: "Size", value: display.sizeLabel }
        : undefined,
    ].filter(
      (field): field is { type: "field"; label: string; value: string } =>
        Boolean(field),
    );
    if (fields.length > 0) children.push({ type: "fields", children: fields });

    const actions = [
      this.buildArtifactLinkButton("Preview", display.previewUrl),
      this.buildArtifactLinkButton("Open", display.url),
      this.buildArtifactLinkButton("Download", display.downloadUrl),
    ].filter(
      (button): button is { type: "link-button"; label: string; url: string } =>
        Boolean(button),
    );
    if (actions.length > 0)
      children.push({ type: "actions", children: actions });

    return {
      type: "card",
      title: display.title,
      children,
    };
  }

  private buildArtifactLinkButton(
    label: string,
    url: string | undefined,
  ): { type: "link-button"; label: string; url: string } | undefined {
    const resolvedUrl = this.resolveDisplayUrl(url);
    if (!resolvedUrl || this.isLocalDisplayUrl(resolvedUrl)) return undefined;
    return { type: "link-button", label, url: resolvedUrl };
  }

  private formatArtifactFallback(
    display: NonNullable<ReturnType<typeof formatArtifactDisplay>>,
  ): string {
    const lines = [`Artifact: ${display.title}`];
    if (display.description) lines.push(display.description);
    if (display.filename) lines.push(`File: ${display.filename}`);
    if (display.mediaType) lines.push(`Type: ${display.mediaType}`);
    if (display.sizeLabel) lines.push(`Size: ${display.sizeLabel}`);
    return lines.join("\n");
  }

  private async sendPendingConfirmationCards(
    thread: Thread,
    pendingConfirmations: PendingConfirmation[] | undefined,
  ): Promise<void> {
    if (!pendingConfirmations || pendingConfirmations.length === 0) return;

    if (pendingConfirmations.length > 1) {
      await thread.post({
        card: this.buildPendingConfirmationsCard(pendingConfirmations),
        fallbackText:
          this.formatPendingConfirmationsFallback(pendingConfirmations),
      });
      return;
    }

    const confirmation = pendingConfirmations[0];
    if (!confirmation) return;
    const fallbackText =
      this.formatPendingConfirmationHelp(pendingConfirmations);
    const sent = await thread.post(
      fallbackText
        ? {
            card: this.buildPendingConfirmationCard(confirmation),
            fallbackText,
          }
        : this.buildPendingConfirmationCard(confirmation),
    );
    this.approvalCardMessages.set(confirmation.id, {
      message: sent,
      summary: confirmation.summary,
      threadId: thread.id,
    });
  }

  private buildPendingConfirmationsCard(
    pendingConfirmations: PendingConfirmation[],
  ): CardElement {
    return {
      type: "card",
      title: "Approvals pending",
      children: [
        ...pendingConfirmations.map((confirmation) => ({
          type: "text" as const,
          content: `${confirmation.id}: ${confirmation.summary}`,
        })),
        {
          type: "text",
          content:
            "Reply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
        },
      ],
    };
  }

  private formatPendingConfirmationsFallback(
    pendingConfirmations: PendingConfirmation[],
  ): string {
    return [
      "Approvals pending:",
      ...pendingConfirmations.map(
        (confirmation) => `${confirmation.id}: ${confirmation.summary}`,
      ),
      "Reply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
    ].join("\n");
  }

  private buildPendingConfirmationCard(
    confirmation: PendingConfirmation,
  ): CardElement {
    const children: CardChild[] = [
      { type: "text", content: confirmation.summary },
      {
        type: "text",
        content:
          "Confirm this action, or cancel it. You can also reply yes/no.",
      },
      {
        type: "actions",
        children: [
          {
            type: "button",
            id: APPROVAL_CONFIRM_ACTION,
            label: "Confirm",
            style: "primary",
            value: confirmation.id,
          },
          {
            type: "button",
            id: APPROVAL_CANCEL_ACTION,
            label: "Cancel",
            style: "danger",
            value: confirmation.id,
          },
        ],
      },
    ];
    return { type: "card", title: "Approval required", children };
  }

  private async resolveApprovalCard(
    approvalId: string,
    confirmed: boolean,
  ): Promise<void> {
    const tracked = this.approvalCardMessages.get(approvalId);
    if (!tracked) return;
    this.approvalCardMessages.delete(approvalId);
    const label = confirmed ? "confirmed" : "cancelled";
    await tracked.message.edit({
      card: this.buildResolvedApprovalCard(tracked.summary, confirmed),
      fallbackText: `Approval ${label}: ${tracked.summary}`,
    });
    await this.clearDiscordMessageComponents(
      tracked.threadId,
      tracked.message.id,
    );
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

  private buildResolvedApprovalCard(
    summary: string,
    confirmed: boolean,
  ): CardElement {
    return {
      type: "card",
      title: confirmed ? "Approval confirmed" : "Approval cancelled",
      children: [
        { type: "text", content: summary },
        {
          type: "text",
          content: confirmed
            ? "This action was confirmed."
            : "This action was cancelled.",
        },
      ],
    };
  }

  private formatPendingConfirmationHelp(
    pendingConfirmations: PendingConfirmation[] | undefined,
  ): string | undefined {
    if (!pendingConfirmations || pendingConfirmations.length === 0) {
      return undefined;
    }
    if (pendingConfirmations.length === 1) {
      const confirmation = pendingConfirmations[0];
      if (!confirmation) return undefined;
      return [
        `Approval required: ${confirmation.summary}`,
        "Reply yes to confirm or no/cancel to abort.",
      ].join("\n");
    }

    return this.formatPendingConfirmationsFallback(pendingConfirmations);
  }

  private formatStructuredCard(
    card: StructuredChatCard,
    deniedCardIds?: Set<string>,
  ): string {
    if (card.kind === "attachment") {
      if (deniedCardIds?.has(card.id)) {
        return "Artifact: Not available at your access level.";
      }
      const display = formatArtifactDisplay(card);
      if (!display) return "Artifact: Generated artifact";
      const lines = [`Artifact: ${display.title}`];
      if (display.description) lines.push(display.description);
      if (display.filename) lines.push(`File: ${display.filename}`);
      if (display.mediaType) lines.push(`Type: ${display.mediaType}`);
      if (display.sizeLabel) lines.push(`Size: ${display.sizeLabel}`);
      const previewUrl = this.resolveDisplayUrl(display.previewUrl);
      const openUrl = this.resolveDisplayUrl(display.url);
      const downloadUrl = this.resolveDisplayUrl(display.downloadUrl);
      if (previewUrl && !this.isLocalDisplayUrl(previewUrl)) {
        lines.push(`Preview: ${previewUrl}`);
      }
      if (openUrl && !this.isLocalDisplayUrl(openUrl)) {
        lines.push(`Open: ${openUrl}`);
      }
      if (downloadUrl && !this.isLocalDisplayUrl(downloadUrl)) {
        lines.push(`Download: ${downloadUrl}`);
      }
      return lines.join("\n");
    }

    if (card.kind === "tool-approval") {
      const lines = [`Approval: ${card.summary || card.toolName}`];
      lines.push(`Status: ${card.state}`);
      if (card.preview) lines.push(card.preview);
      const output = this.formatCardOutput(card.output);
      if (output) lines.push(`Result: ${output}`);
      if (card.error) lines.push(`Error: ${card.error}`);
      return lines.join("\n");
    }

    if (card.kind === "sources") {
      const lines = [`Sources: ${card.title ?? "Retrieved context"}`];
      for (const source of card.sources) {
        const resolvedUrl = this.resolveDisplayUrl(source.url);
        const displayUrl =
          resolvedUrl && !this.isLocalDisplayUrl(resolvedUrl)
            ? ` — ${resolvedUrl}`
            : "";
        lines.push(`- ${source.title ?? source.source}${displayUrl}`);
      }
      return lines.join("\n");
    }

    const lines = [`Actions: ${card.title ?? "Suggested actions"}`];
    for (const action of card.actions) {
      lines.push(`- ${action.label}`);
    }
    return lines.join("\n");
  }

  private formatCardOutput(output: unknown): string | undefined {
    return formatStructuredOutputSummary(output);
  }

  private getPreferredDisplayBaseUrl(): string | undefined {
    if (this.context?.preferLocalUrls && this.context.localSiteUrl) {
      return this.context.localSiteUrl;
    }
    return this.context?.siteUrl ?? this.context?.localSiteUrl;
  }

  private resolveDisplayUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).toString();
    } catch {
      if (!url.startsWith("/")) return url;
      const baseUrl = this.getPreferredDisplayBaseUrl();
      if (!baseUrl) return url;
      return new URL(url, baseUrl).toString();
    }
  }

  private isLocalDisplayUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    } catch {
      return url.startsWith("/");
    }
  }

  private syncPendingConfirmationsFromResponse(
    conversationId: string,
    response: AgentResponse,
    resolvedApprovalId: string,
  ): void {
    if (response.pendingConfirmations === undefined) return;
    const pendingIds = new Set(
      response.pendingConfirmations
        .map((confirmation) => confirmation.id)
        .filter((approvalId) => approvalId !== resolvedApprovalId),
    );
    if (pendingIds.size === 0) {
      this.pendingConfirmations.delete(conversationId);
      return;
    }
    this.pendingConfirmations.set(conversationId, pendingIds);
  }

  private removePendingApproval(
    conversationId: string,
    approvalId: string,
  ): void {
    const approvalIds = this.pendingConfirmations.get(conversationId);
    if (!approvalIds) return;
    approvalIds.delete(approvalId);
    if (approvalIds.size === 0) {
      this.pendingConfirmations.delete(conversationId);
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
    if (agentInput.attachments.length > 0) return;
    if (userLevel !== "anchor" && userLevel !== "trusted") return;
    const uploads = await this.getRecentUploads(conversationId);
    if (uploads.length === 0) return;
    agentInput.attachments = selectReferencedAttachments(
      agentInput.message,
      uploads,
    );
  }

  private rememberUploadAttachments(
    conversationId: string,
    attachments: ChatAttachment[],
  ): void {
    if (attachments.length === 0) return;
    const existing = this.recentUploads.get(conversationId) ?? [];
    this.recentUploads.set(
      conversationId,
      [...existing, ...attachments].slice(-20),
    );
  }

  private async getRecentUploads(
    conversationId: string,
  ): Promise<ChatAttachment[]> {
    const existing = this.recentUploads.get(conversationId) ?? [];
    if (existing.length > 0) return existing;
    if (!this.context) return [];

    const uploadStore = this.context.uploads.scoped(
      createDiscordChatUploadStoreScope(),
    );
    const restored = await this.loadRecentUploadsFromConversation(
      conversationId,
      uploadStore,
    );
    if (restored.length > 0) {
      this.recentUploads.set(conversationId, restored.slice(-20));
    }
    return restored;
  }

  private async loadRecentUploadsFromConversation(
    conversationId: string,
    uploadStore: RuntimeUploadStore,
  ): Promise<ChatAttachment[]> {
    const messages = await this.context?.conversations
      .getMessages(conversationId, { limit: 50 })
      .catch((error: unknown) => {
        this.logger.debug("Failed to load prior chat uploads", {
          error,
          conversationId,
        });
        return [];
      });
    const uploadIds = collectUploadIdsFromStoredMessages(messages ?? [], {
      sourceKind: "discord-chat-upload",
      role: "user",
    });
    const uploads: ChatAttachment[] = [];
    for (const uploadId of uploadIds) {
      try {
        const resolved = await uploadStore.read(uploadId);
        uploads.push(
          this.createChatAttachmentFromStoredUpload(
            resolved.record.filename,
            resolved.record.mediaType,
            resolved.content,
            resolved.record.ref,
          ),
        );
      } catch (error: unknown) {
        this.logger.debug("Failed to restore prior chat upload", {
          error,
          uploadId,
        });
      }
    }
    return uploads;
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
    this.recentUploads.clear();
    this.toolStatusMessages.clear();
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
