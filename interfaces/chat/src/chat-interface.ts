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
import type { SentMessage } from "chat";
import {
  chatConfigSchema,
  type ChatConfig,
  type ChatConfigInput,
} from "./config";
import { PromptActionStore } from "./prompt-action-store";
import { ThreadRegistry } from "./thread-registry";
import { ToolStatusMessenger } from "./tool-status-messenger";
import { buildProgressCard } from "./chat-cards";
import { chunkForChannel, parseChatPlatform } from "./chat-platform";
import { ChatResponseCoordinator } from "./chat-response-coordinator";
import { ChatUploadCoordinator } from "./chat-upload-coordinator";
import { toPlatformPostOutput, type ChatCardOutput } from "./chat-output";
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
import { getThreadIdParts, isBotCreatedDiscordThread } from "./discord-routing";
import {
  ChatTurnController,
  isEnabledChatPlatform,
} from "./chat-turn-controller";
import { clearDiscordMessageComponents } from "./discord-message-components";
import packageJson from "../package.json";

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
      this.promptActions.register(threadId, action),
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
    getPlatform: (thread): string => thread.adapter.name,
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
  private readonly turnController: ChatTurnController;
  private readonly gatewayLoop: DiscordGatewayLoop;
  private readonly slackSocketLoop: SlackSocketLoop;
  private readonly chatApp: ChatSdkAppHost;
  private discordSubscriptions: ChatThreadSubscriptionStore | undefined;
  private slackSubscriptions: ChatThreadSubscriptionStore | undefined;
  private chatAppRunning = false;

  constructor(config: ChatConfigInput = {}) {
    super("chat", packageJson, config, chatConfigSchema);
    this.turnController = new ChatTurnController({
      config: this.config,
      host: {
        getContext: (): InterfacePluginContext | undefined => this.context,
        startProcessingInput: (channelId): void =>
          this.startProcessingInput(channelId),
        endProcessingInput: (): void => this.endProcessingInput(),
        extractCaptureableUrls: (content, blockedDomains): string[] =>
          this.extractCaptureableUrls(content, blockedDomains),
        captureUrlViaAgent: (
          url,
          channelId,
          authorId,
          interfaceType,
          permissionContext,
        ): Promise<void> =>
          this.captureUrlViaAgent(
            url,
            channelId,
            authorId,
            interfaceType,
            permissionContext,
          ),
      },
      promptActions: this.promptActions,
      threadRegistry: this.threadRegistry,
      subscriptionRouter: this.subscriptionRouter,
      chatInputBuilder: this.chatInputBuilder,
      uploadCoordinator: this.uploadCoordinator,
      responseCoordinator: this.responseCoordinator,
      logger: {
        debug: (message, context): void => this.logger.debug(message, context),
        error: (message, context): void => this.logger.error(message, context),
      },
    });
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
    this.turnController.registerHandlers(
      this.chatApp.build(context.runtimeState),
    );
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
      if (!isEnabledChatPlatform(this.config, interfaceType)) return;
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
    if (!isEnabledChatPlatform(this.config, event.interfaceType)) return;

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

  private getPreferredDisplayBaseUrl(): string | undefined {
    if (this.context?.preferLocalUrls && this.context.localSiteUrl) {
      return this.context.localSiteUrl;
    }
    return this.context?.siteUrl ?? this.context?.localSiteUrl;
  }
}
