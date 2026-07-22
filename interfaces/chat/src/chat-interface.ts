import {
  MessageInterfacePlugin,
  getToolStatusKey,
  type AgentResponse,
  type InterfacePluginContext,
  type MessageInterfaceOutput,
  type RuntimeUploadStore,
  type ToolActivityEvent,
  type ToolStatusUpdate,
} from "@brains/plugins";
import type {
  Daemon,
  DaemonHealth,
  JobContext,
  JobProgressEvent,
  WebRouteDefinition,
} from "@brains/plugins";
import type { ActionEvent, Message, MessageContext, SentMessage } from "chat";
import type { ChatPlatform, ChatThread } from "./types";
import {
  chatConfigSchema,
  type ChatConfig,
  type ChatConfigInput,
  type DiscordChatAdapterConfig,
  type SlackChatAdapterConfig,
} from "./config";
import { PromptActionStore } from "./prompt-action-store";
import { ThreadRegistry } from "./thread-registry";
import { ToolStatusMessenger } from "./tool-status-messenger";
import {
  buildProgressCard,
  APPROVAL_CONFIRM_ACTION,
  APPROVAL_CANCEL_ACTION,
  PROMPT_ACTION,
} from "./chat-cards";
import {
  chunkForChannel,
  ownsChatPlatform,
  parseChatPlatform,
} from "./chat-platform";
import { ChatResponseCoordinator } from "./chat-response-coordinator";
import { ChatUploadCoordinator } from "./chat-upload-coordinator";
import {
  buildChatActionEventMetadata,
  buildChatCoalescedAgentInput,
  buildChatUserMessageMetadata,
  getChatConversationId,
} from "./chat-metadata";
import {
  formatChatErrorPayload,
  formatChatNoticePayload,
  toPlatformPostOutput,
  type ChatCardOutput,
} from "./chat-output";
import { DiscordGatewayLoop } from "./discord-gateway-loop";
import { SlackSocketLoop } from "./slack-socket-loop";
import { ChatSdkAppHost, type ChatSdkApp } from "./chat-sdk-app";
import { createChatSdkApp } from "./chat-sdk";
import { SubscriptionRouter } from "./subscription-router";
import { ChatInputBuilder } from "./chat-input-builder";
import {
  createDiscordThreadSubscriptionStore,
  createSlackThreadSubscriptionStore,
  type ChatThreadSubscriptionStore,
} from "./subscription-state";
import {
  getChannelName,
  getPermissionContext,
  getThreadIdParts,
  isAllowedChannel,
  isBotCreatedDiscordThread,
  shouldHandleChatAction,
  shouldRouteChatMessage,
} from "./discord-routing";
import { clearDiscordMessageComponents } from "./discord-message-components";
import packageJson from "../package.json";

const URL_PATTERN = /https?:\/\/\S+/i;
const ANY_MESSAGE_PATTERN = /[\s\S]+/;
/** Cap on retained prompt-action tokens; oldest never-clicked ones evict. */
const MAX_PROMPT_ACTIONS = 1000;

export class ChatInterface extends MessageInterfacePlugin<
  ChatConfig,
  ChatConfigInput
> {
  declare protected config: ChatConfig;

  private readonly threadRegistry = new ThreadRegistry();
  private readonly promptActions = new PromptActionStore(MAX_PROMPT_ACTIONS);
  private readonly toolStatusMessenger = new ToolStatusMessenger(
    this.threadRegistry,
  );
  private readonly compactingSlackApprovalToolStatuses = new Set<string>();
  private readonly uploadCoordinator = new ChatUploadCoordinator({
    getContext: (): InterfacePluginContext | undefined => this.context,
    logger: this.logger,
  });
  private readonly responseCoordinator = new ChatResponseCoordinator({
    getContext: (): InterfacePluginContext | undefined => this.context,
    getDisplayBaseUrl: (): string | undefined =>
      this.getPreferredDisplayBaseUrl(),
    registerPromptAction: (threadId, action): string =>
      this.registerPromptAction(threadId, action),
    clearMessageComponents: async (threadId, messageId): Promise<void> => {
      const botToken = this.config.adapters.discord?.botToken;
      if (!botToken) return;
      await clearDiscordMessageComponents({
        threadId,
        messageId,
        botToken,
        logger: this.logger,
      });
    },
    sendMessageWithId: (input): Promise<string | undefined> =>
      this.sendMessageWithId(input),
    handleAgentResponseToolStatuses: (
      response,
      conversationId,
    ): Promise<void> =>
      this.handleAgentResponseToolStatuses(response, conversationId),
    trackAgentResponseForJob: (jobId, messageId, channelId): void =>
      this.trackAgentResponseForJob(jobId, messageId, channelId),
    threadRegistry: this.threadRegistry,
    logger: this.logger,
  });
  private readonly subscriptionRouter = new SubscriptionRouter({
    getSubscriptions: (
      platform: string,
    ): ChatThreadSubscriptionStore | undefined =>
      platform === "discord"
        ? this.discordSubscriptions
        : platform === "slack"
          ? this.slackSubscriptions
          : undefined,
    getPlatform: (thread): string => this.getPlatform(thread),
    isBotCreatedThread: isBotCreatedDiscordThread,
    logger: this.logger,
  });
  private readonly chatInputBuilder = new ChatInputBuilder({
    getUploadStore: (platform: string): RuntimeUploadStore | undefined =>
      platform === "discord" || platform === "slack"
        ? this.uploadCoordinator.getCanonicalStore()
        : undefined,
    getThreadIdParts,
    logger: this.logger,
  });
  private readonly gatewayLoop: DiscordGatewayLoop;
  private readonly slackSocketLoop: SlackSocketLoop;
  private readonly chatApp: ChatSdkAppHost;
  private discordSubscriptions: ChatThreadSubscriptionStore | undefined;
  private slackSubscriptions: ChatThreadSubscriptionStore | undefined;
  private chatAppRunning = false;

  constructor(config: ChatConfigInput = {}) {
    super("chat", packageJson, config, chatConfigSchema);
    this.gatewayLoop = new DiscordGatewayLoop({
      getApp: (): ChatSdkApp | undefined => this.chatApp.instance,
      gatewayRunMs: this.config.gatewayRunMs,
      gatewayRestartDelayMs: this.config.gatewayRestartDelayMs,
      logger: this.logger,
    });
    this.slackSocketLoop = new SlackSocketLoop({
      listenerRunMs: this.config.gatewayRunMs,
      restartDelayMs: this.config.gatewayRestartDelayMs,
      logger: this.logger,
    });
    this.chatApp = new ChatSdkAppHost({
      discord: this.config.adapters.discord,
      slack: this.config.adapters.slack,
      getUploadStore: (platform): RuntimeUploadStore | undefined =>
        this.uploadCoordinator.getPlatformStore(platform),
      buildApp: (runtimeState): ChatSdkApp =>
        createChatSdkApp({
          userName: this.config.userName,
          discord: this.config.adapters.discord,
          slack: this.config.adapters.slack,
          gatewayLoop: this.gatewayLoop,
          slackSocketLoop: this.slackSocketLoop,
          runtimeState,
        }),
    });
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (this.config.adapters.discord) {
      this.discordSubscriptions = createDiscordThreadSubscriptionStore(
        context.runtimeState,
      );
    }
    if (this.config.adapters.slack) {
      this.slackSubscriptions = createSlackThreadSubscriptionStore(
        context.runtimeState,
      );
    }
    this.registerChatHandlers(this.chatApp.build(context.runtimeState));
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.chatApp.getWebRoutes();
  }

  protected override createDaemon(): Daemon | undefined {
    const discordEnabled = Boolean(this.config.adapters.discord);
    const slackSocketEnabled = this.config.adapters.slack?.mode === "socket";
    if (!discordEnabled && !this.config.adapters.slack) return undefined;

    return {
      start: async (): Promise<void> => {
        await this.chatApp.initialize();
        this.chatAppRunning = true;
        if (discordEnabled) this.gatewayLoop.start();
        if (slackSocketEnabled) this.slackSocketLoop.start();
      },
      stop: async (): Promise<void> => {
        await this.gatewayLoop.stop();
        await this.slackSocketLoop.stop();
        this.threadRegistry.clear();
        this.uploadCoordinator.clear();
        this.responseCoordinator.clear();
        this.toolStatusMessenger.clear();
        await this.chatApp.shutdown();
        this.chatAppRunning = false;
      },
      healthCheck: async (): Promise<DaemonHealth> => {
        const healthy =
          this.chatAppRunning &&
          (!discordEnabled || this.gatewayLoop.isRunning()) &&
          (!slackSocketEnabled || this.slackSocketLoop.isRunning());
        return {
          status: healthy ? "healthy" : "error",
          message: healthy ? "Chat SDK app running" : "Chat SDK app stopped",
          lastCheck: new Date(),
        };
      },
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
    const postOutput = this.toPlatformPostOutput(channelId, message);
    if (postOutput !== undefined) {
      thread.post(postOutput).catch((error: unknown) =>
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
    const postOutput = this.toPlatformPostOutput(channelId, message);
    if (postOutput !== undefined) {
      const sent = await thread.post(postOutput);
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
        this.toPlatformPostOutput(channelId, newMessage) ??
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

  private toPlatformPostOutput(
    channelId: string | null,
    output: MessageInterfaceOutput,
  ): ChatCardOutput | string | undefined {
    return toPlatformPostOutput(channelId, output);
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
    let routedEvent = event;
    let routedContext = context;
    if (interfaceType && interfaceType !== this.id) {
      if (!this.isEnabledPlatform(interfaceType)) return;
      routedEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          interfaceType: this.id,
        },
      };
      routedContext = routedEvent.metadata;
    }

    await super.handleProgressEvent(routedEvent, routedContext);
    await this.responseCoordinator.deliverCompletedJobArtifacts(routedEvent);
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
    const isSlack = parseChatPlatform(update.channelId) === "slack";
    const isActiveSlackConfirmation =
      isSlack &&
      this.responseCoordinator.isActiveSlackConfirmation(update.conversationId);
    const isCompactedApprovalStatus =
      isSlack &&
      this.compactingSlackApprovalToolStatuses.has(getToolStatusKey(update));
    if (
      isCompactedApprovalStatus ||
      isActiveSlackConfirmation ||
      (isSlack && update.state === "completed")
    ) {
      await this.toolStatusMessenger.dismiss(update);
      return;
    }
    await this.toolStatusMessenger.handle(update);
  }

  protected override async handleAgentResponseToolStatuses(
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ): Promise<void> {
    const toolNames = new Set([
      ...(response.pendingConfirmations ?? []).map(
        (confirmation) => confirmation.toolName,
      ),
      ...(response.cards ?? [])
        .filter((card) => card.kind === "tool-approval")
        .map((card) => card.toolName),
    ]);
    const compactedKeys = conversationId.startsWith("slack-")
      ? [...toolNames].map((toolName) => `${conversationId}:${toolName}`)
      : [];
    for (const key of compactedKeys) {
      this.compactingSlackApprovalToolStatuses.add(key);
    }
    try {
      await super.handleAgentResponseToolStatuses(response, conversationId);
    } finally {
      for (const key of compactedKeys) {
        this.compactingSlackApprovalToolStatuses.delete(key);
      }
    }
  }

  private isEnabledPlatform(interfaceType: string): boolean {
    const enabledPlatforms = new Set<ChatPlatform>();
    if (this.config.adapters.discord) enabledPlatforms.add("discord");
    if (this.config.adapters.slack) enabledPlatforms.add("slack");
    return ownsChatPlatform(interfaceType, enabledPlatforms);
  }

  private registerChatHandlers(app: ChatSdkApp): void {
    app.onDirectMessage(async (thread, message, _channel, context) => {
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onNewMention(async (thread, message, context) => {
      const platformConfig = this.getPlatformConfig(thread);
      const platform = this.getPlatform(thread);
      if (
        platform === "discord" &&
        this.config.adapters.discord &&
        platformConfig &&
        shouldRouteChatMessage(thread, message, platformConfig) &&
        !thread.isDM &&
        this.config.adapters.discord.useThreads
      ) {
        await this.subscriptionRouter.subscribeOwnedThread(thread, message);
      } else if (
        platform === "slack" &&
        platformConfig &&
        shouldRouteChatMessage(thread, message, platformConfig) &&
        !thread.isDM
      ) {
        await this.subscriptionRouter.subscribeThread(thread);
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
      (this.config.adapters.discord &&
        !this.config.adapters.discord.requireMention) ||
      (this.config.adapters.slack && !this.config.adapters.slack.requireMention)
    ) {
      app.onNewMessage(
        ANY_MESSAGE_PATTERN,
        async (thread, message, context) => {
          const platformConfig = this.getPlatformConfig(thread);
          if (!platformConfig || platformConfig.requireMention) return;
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

    app.onAction(async (event) => {
      if (!event.actionId.startsWith(`${PROMPT_ACTION}:`)) return;
      await this.handlePromptAction(event);
    });
  }

  private async handlePromptAction(event: ActionEvent): Promise<void> {
    if (!this.context || !event.thread || !event.value) return;
    const platform = event.adapter.name;
    if (!this.isEnabledPlatform(platform)) return;
    if (platform !== "discord" && platform !== "slack") return;

    const thread = event.thread;
    if (!shouldHandleChatAction(thread, this.getPlatformConfig(thread))) return;

    const action = this.promptActions.get(event.value);
    if (action?.threadId !== thread.id) {
      await thread.post(
        formatChatNoticePayload(
          "That suggested action is no longer available.",
          "Action unavailable",
        ),
      );
      return;
    }
    this.promptActions.consume(event.value);

    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      event.user.userId,
      getPermissionContext(thread, {
        author: {
          isMe: event.user.isMe,
          isBot: event.user.isBot,
        },
      }),
    );
    const conversationId = getChatConversationId(platform, thread.id);
    const channelId = thread.id;

    await this.runAgentTurn({
      thread,
      channelId,
      logLabel: "Error handling chat prompt action",
      body: async () => {
        if (!this.context) return;
        const attachments = await this.uploadCoordinator.selectPriorUploads({
          platform,
          conversationId,
          currentAttachments: [],
          canRestore:
            userPermissionLevel === "anchor" ||
            userPermissionLevel === "trusted",
        });
        const response = await this.context.agent.chat(
          action.prompt,
          conversationId,
          {
            userPermissionLevel,
            interfaceType: platform,
            channelId,
            channelName: getChannelName(thread),
            ...buildChatActionEventMetadata(platform, thread, event),
            ...(attachments.length > 0 ? { attachments } : {}),
          },
        );
        await this.responseCoordinator.renderAgentResponse({
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
    if (platform !== "discord" && platform !== "slack") return;

    const thread = event.thread;
    if (!shouldHandleChatAction(thread, this.getPlatformConfig(thread))) return;

    const conversationId = getChatConversationId(platform, thread.id);
    const approvalIds =
      await this.responseCoordinator.getPendingApprovalIds(conversationId);
    if (!approvalIds.has(event.value)) {
      await thread.post(
        formatChatNoticePayload("That approval is no longer pending."),
      );
      return;
    }

    const userPermissionLevel = this.context.permissions.getUserLevel(
      platform,
      event.user.userId,
      getPermissionContext(thread, {
        author: {
          isMe: event.user.isMe,
          isBot: event.user.isBot,
        },
      }),
    );

    await this.responseCoordinator.confirmApproval({
      thread,
      conversationId,
      approvalId: event.value,
      confirmed: event.actionId === APPROVAL_CONFIRM_ACTION,
      userPermissionLevel,
      metadata: buildChatActionEventMetadata(platform, thread, event),
    });
  }

  private async handleRoutedMessage(
    thread: ChatThread,
    message: Message,
    context?: MessageContext,
  ): Promise<void> {
    if (!this.context) return;
    const platform = this.getPlatform(thread);
    if (!this.isEnabledPlatform(platform)) return;
    if (platform !== "discord" && platform !== "slack") return;

    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig) return;
    if (!shouldRouteChatMessage(thread, message, platformConfig)) return;

    await this.routeToAgent(platform, thread, message, context);
  }

  /**
   * Shared turn wrapper for the message and prompt-action paths: marks input
   * processing (so job-completion messages buffer behind the reply), shows the
   * typing indicator, runs the path-specific body, and renders a consistent
   * error to the thread on failure. The confirmation path does not use this —
   * it is driven by a button press, not user input processing.
   */
  private async runAgentTurn(input: {
    thread: ChatThread;
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
    thread: ChatThread,
    channelId: string,
    error: unknown,
  ): Promise<void> {
    const payload = formatChatErrorPayload(error);
    const postOutput = this.toPlatformPostOutput(channelId, payload);
    if (postOutput !== undefined) {
      await thread.post(postOutput);
      return;
    }
    const text = typeof payload === "string" ? payload : "Message failed.";
    for (const chunk of chunkForChannel(channelId, text)) {
      await thread.post(chunk);
    }
  }

  private async routeToAgent(
    platform: ChatPlatform,
    thread: ChatThread,
    message: Message,
    context?: MessageContext,
  ): Promise<void> {
    if (!this.context) return;

    this.threadRegistry.set(thread);
    const conversationId = getChatConversationId(platform, thread.id);
    const channelId = thread.id;
    const permissionContext = getPermissionContext(thread, message);
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
    await this.uploadCoordinator.attachPriorUploads(
      platform,
      conversationId,
      agentInput,
      userPermissionLevel,
    );
    await this.postUploadNotices(thread, agentInput.notices);
    if (!agentInput.message && agentInput.attachments.length === 0) return;
    this.uploadCoordinator.remember(platform, conversationId, sameTurnUploads);

    await this.runAgentTurn({
      thread,
      channelId,
      logLabel: "Error handling chat message",
      body: async () => {
        if (!this.context) return;

        const pendingApprovalIds =
          await this.responseCoordinator.getPendingApprovalIds(conversationId);
        if (pendingApprovalIds.size > 0) {
          const handledConfirmation =
            await this.responseCoordinator.handleConfirmationResponse({
              message: agentInput.message,
              conversationId,
              thread,
              approvalIds: pendingApprovalIds,
              userPermissionLevel,
              metadata: buildChatUserMessageMetadata(platform, thread, message),
            });
          if (handledConfirmation) return;
        }

        const coalescedInput = buildChatCoalescedAgentInput(
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
            channelName: getChannelName(thread),
            ...buildChatUserMessageMetadata(
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

        await this.responseCoordinator.renderAgentResponse({
          thread,
          channelId,
          conversationId,
          response,
          userPermissionLevel,
        });
      },
    });
  }

  private registerPromptAction(
    threadId: string,
    action: { label: string; prompt: string },
  ): string {
    return this.promptActions.register(threadId, action);
  }

  private getPreferredDisplayBaseUrl(): string | undefined {
    if (this.context?.preferLocalUrls && this.context.localSiteUrl) {
      return this.context.localSiteUrl;
    }
    return this.context?.siteUrl ?? this.context?.localSiteUrl;
  }

  private async handlePassiveUrlCapture(
    thread: ChatThread,
    message: Message,
  ): Promise<void> {
    const platform = this.getPlatform(thread);
    if (!this.isEnabledPlatform(platform)) return;
    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig?.captureUrls) return;
    if (!platformConfig.requireMention) return;
    if (!isAllowedChannel(thread, platformConfig)) return;
    if (message.author.isMe) return;
    if (message.author.isBot) return;
    if (message.isMention) return;

    const urls = this.extractCaptureableUrls(
      message.text,
      platformConfig.blockedUrlDomains,
    );
    if (urls.length === 0) return;

    this.threadRegistry.set(thread);
    const permissionContext = getPermissionContext(thread, message);
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
    thread: ChatThread,
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

  private getPlatform(thread: ChatThread): string {
    return thread.adapter.name;
  }

  private getPlatformConfig(
    thread: ChatThread,
  ): DiscordChatAdapterConfig | SlackChatAdapterConfig | undefined {
    const platform = this.getPlatform(thread);
    if (platform === "discord") return this.config.adapters.discord;
    if (platform === "slack") return this.config.adapters.slack;
    return undefined;
  }
}
