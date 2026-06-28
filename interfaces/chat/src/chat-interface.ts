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
  formatPendingConfirmationHelp,
  PendingApprovalTracker,
  MessageUploadContinuity,
  routeConfirmationResponse,
  type AgentResponse,
  type ChatAttachment,
  type InterfacePluginContext,
  type MessageInterfaceOutput,
  type PendingConfirmation,
  type StructuredChatCard,
  type PermissionLookupContext,
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
  type ActionEvent,
  type CardElement,
  type FileUpload,
  type Message,
  type MessageContext,
  type SentMessage,
  type Thread,
} from "chat";
import { z } from "zod";
import { createPrefixedId } from "@brains/utils";
import {
  chatConfigSchema,
  type ChatConfig,
  type DiscordChatAdapterConfig,
} from "./config";
import { ThreadRegistry } from "./thread-registry";
import { ToolStatusMessenger } from "./tool-status-messenger";
import {
  ChatCardBuilder,
  buildProgressCard,
  APPROVAL_CONFIRM_ACTION,
  APPROVAL_CANCEL_ACTION,
  PROMPT_ACTION,
} from "./chat-cards";
import { chunkForChannel, ownsChatPlatform } from "./chat-platform";
import { ArtifactDeliveryResolver } from "./artifact-delivery";
import { ApprovalCardTracker } from "./approval-card-tracker";
import { DiscordGatewayLoop } from "./discord-gateway-loop";
import { DiscordChatApp, type ChatSdkApp } from "./discord-chat-app";
import { createDiscordChatSdkApp } from "./discord-chat-sdk";
import { SubscriptionRouter } from "./subscription-router";
import {
  ChatInputBuilder,
  chatAttachmentFromStoredUpload,
  type AgentInput,
} from "./chat-input-builder";
import {
  createDiscordThreadSubscriptionStore,
  type DiscordThreadSubscriptionStore,
} from "./subscription-state";
import { createDiscordChatUploadStoreScope } from "./upload-store";
import packageJson from "../package.json";

const URL_PATTERN = /https?:\/\/\S+/i;
const ANY_MESSAGE_PATTERN = /[\s\S]+/;
const DISCORD_API_BASE = "https://discord.com/api/v10";

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

export class ChatInterface extends MessageInterfacePlugin<ChatConfig> {
  declare protected config: ChatConfig;

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
  private readonly subscriptionRouter = new SubscriptionRouter({
    getSubscriptions: () => this.discordSubscriptions,
    getPlatform: (thread) => this.getPlatform(thread),
    isBotCreatedThread: (thread, message) =>
      this.isBotCreatedDiscordThread(thread, message),
    logger: this.logger,
  });
  private readonly chatInputBuilder = new ChatInputBuilder({
    getUploadStore: () =>
      this.context?.uploads.scoped(createDiscordChatUploadStoreScope()),
    getThreadIdParts: (threadId) => this.getThreadIdParts(threadId),
    logger: this.logger,
  });
  private readonly gatewayLoop: DiscordGatewayLoop;
  private readonly discordApp: DiscordChatApp;
  private discordSubscriptions: DiscordThreadSubscriptionStore | undefined;

  constructor(config: Partial<ChatConfig> = {}) {
    super("chat", packageJson, config, chatConfigSchema);
    this.gatewayLoop = new DiscordGatewayLoop({
      getApp: () => this.discordApp.instance,
      gatewayRunMs: this.config.gatewayRunMs,
      gatewayRestartDelayMs: this.config.gatewayRestartDelayMs,
      logger: this.logger,
    });
    this.discordApp = new DiscordChatApp({
      discord: this.config.adapters.discord,
      getUploadStore: () =>
        this.context?.uploads.scoped(createDiscordChatUploadStoreScope()),
      buildApp: (runtimeState) =>
        createDiscordChatSdkApp({
          userName: this.config.userName,
          discord: this.config.adapters.discord,
          gatewayLoop: this.gatewayLoop,
          runtimeState,
        }),
    });
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
        return chatAttachmentFromStoredUpload(
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
    this.registerChatHandlers(this.discordApp.build(context.runtimeState));
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.discordApp.getWebRoutes();
  }

  protected override createDaemon(): Daemon | undefined {
    if (!this.config.adapters.discord) return undefined;

    return {
      start: async (): Promise<void> => {
        await this.discordApp.initialize();
        this.gatewayLoop.start();
      },
      stop: async (): Promise<void> => {
        await this.gatewayLoop.stop();
        this.threadRegistry.clear();
        this.uploadContinuity.clear();
        this.toolStatusMessenger.clear();
        await this.discordApp.shutdown();
      },
      healthCheck: async (): Promise<DaemonHealth> => ({
        status: this.gatewayLoop.isRunning() ? "healthy" : "error",
        message: this.gatewayLoop.isRunning()
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
    for (const chunk of chunkForChannel(channelId, message)) {
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
    for (const chunk of chunkForChannel(channelId, message)) {
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
    return buildProgressCard(event);
  }

  protected override formatCompletionOutput(
    event: JobProgressEvent,
  ): MessageInterfaceOutput {
    return buildProgressCard(event);
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
    return ownsChatPlatform(
      interfaceType,
      Boolean(this.config.adapters.discord),
    );
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
        await this.subscriptionRouter.subscribeOwnedThread(thread, message);
      }
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onSubscribedMessage(async (thread, message, context) => {
      if (
        !(await this.subscriptionRouter.shouldRouteSubscribedMessage(
          thread,
          message,
        ))
      )
        return;
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

    await this.runAgentTurn({
      thread,
      channelId,
      logLabel: "Error handling chat prompt action",
      body: async () => {
        if (!this.context) return;
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
      },
    });
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

  /**
   * Shared turn wrapper for the message and prompt-action paths: marks input
   * processing (so job-completion messages buffer behind the reply), shows the
   * typing indicator, runs the path-specific body, and renders a consistent
   * error to the thread on failure. The confirmation path does not use this —
   * it is driven by a button press, not user input processing.
   */
  private async runAgentTurn(input: {
    thread: Thread;
    channelId: string;
    logLabel: string;
    body: () => Promise<void>;
  }): Promise<void> {
    this.startProcessingInput(input.channelId);
    try {
      if (this.getPlatformConfig(input.thread)?.showTypingIndicator) {
        await input.thread.startTyping().catch((error: unknown) =>
          this.logger.debug("Typing indicator failed", {
            error,
            channelId: input.channelId,
          }),
        );
      }
      await input.body();
    } catch (error: unknown) {
      this.logger.error(input.logLabel, { error, channelId: input.channelId });
      await this.postTurnError(input.thread, input.channelId, error);
    } finally {
      this.endProcessingInput();
    }
  }

  private async postTurnError(
    thread: Thread,
    channelId: string,
    error: unknown,
  ): Promise<void> {
    const payload = this.formatErrorPayload(error);
    const cardOutput = this.toDiscordCardOutput(payload);
    if (cardOutput) {
      await thread.post(cardOutput);
      return;
    }
    const text = typeof payload === "string" ? payload : "Message failed.";
    for (const chunk of chunkForChannel(channelId, text)) {
      await thread.post(chunk);
    }
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
    const agentInput = await this.chatInputBuilder.build(
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

    await this.runAgentTurn({
      thread,
      channelId,
      logLabel: "Error handling chat message",
      body: async () => {
        if (!this.context) return;

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
      },
    });
  }

  /**
   * Single render path for every agent response in chat. The optional
   * `confirmation` switches it to the approval-resolution variant: it syncs (not
   * remembers) pending confirmations against the resolved approval, edits the
   * approval card to its resolved state, and uses the confirmation-response text
   * formatting. Everything else — tool statuses, artifact delivery, card sends,
   * and async-job progress tracking — is identical for normal and confirmation
   * turns. (The previous confirmApproval path duplicated this and omitted job
   * tracking; routing it here fixes that.)
   */
  private async renderAgentResponse(input: {
    thread: Thread;
    channelId: string;
    conversationId: string;
    response: AgentResponse;
    userPermissionLevel: UserPermissionLevel;
    confirmation?: { approvalId: string; confirmed: boolean };
  }): Promise<void> {
    if (input.confirmation) {
      this.syncPendingConfirmationsFromResponse(
        input.conversationId,
        input.response,
        input.confirmation.approvalId,
      );
    } else {
      this.rememberPendingConfirmationsFromResponse(
        input.conversationId,
        input.response,
      );
    }
    await this.handleAgentResponseToolStatuses(
      input.response,
      input.conversationId,
    );
    const artifactDelivery = await this.artifactDelivery.resolve(
      input.response.cards,
      input.userPermissionLevel,
    );
    if (input.confirmation) {
      await this.approvalCards.resolve(
        input.conversationId,
        input.confirmation.approvalId,
        input.confirmation.confirmed,
      );
    }
    const message = input.confirmation
      ? this.formatConfirmationResponsePayload(
          input.response,
          input.confirmation.confirmed,
          this.getRemainingApprovalHelp(input.conversationId, input.response),
          artifactDelivery.deniedCardIds,
        )
      : this.formatAgentResponseText(
          input.response.text,
          input.response.cards,
          input.response.pendingConfirmations,
          artifactDelivery.deniedCardIds,
        );
    const messageId = await this.sendAgentResponseWithFiles({
      thread: input.thread,
      channelId: input.channelId,
      message,
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

    await this.renderAgentResponse({
      thread: input.thread,
      channelId: input.thread.id,
      conversationId: input.conversationId,
      response,
      userPermissionLevel: input.userPermissionLevel,
      confirmation: {
        approvalId: input.approvalId,
        confirmed: input.confirmed,
      },
    });
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
    const chunks = chunkForChannel(input.channelId, text);
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
}
