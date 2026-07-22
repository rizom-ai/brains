import type {
  InterfacePluginContext,
  PermissionLookupContext,
} from "@brains/plugins";
import type { ActionEvent, Message, MessageContext } from "chat";
import type {
  ChatConfig,
  DiscordChatAdapterConfig,
  SlackChatAdapterConfig,
} from "./config";
import type { ChatInputBuilder } from "./chat-input-builder";
import {
  APPROVAL_CANCEL_ACTION,
  APPROVAL_CONFIRM_ACTION,
  PROMPT_ACTION,
} from "./chat-cards";
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
} from "./chat-output";
import { chunkForChannel, ownsChatPlatform } from "./chat-platform";
import type { ChatResponseCoordinator } from "./chat-response-coordinator";
import type { ChatSdkApp } from "./chat-sdk-app";
import type { ChatUploadCoordinator } from "./chat-upload-coordinator";
import {
  getChannelName,
  getPermissionContext,
  isAllowedChannel,
  shouldHandleChatAction,
  shouldRouteChatMessage,
} from "./discord-routing";
import type { PromptActionStore } from "./prompt-action-store";
import type { SubscriptionRouter } from "./subscription-router";
import type { ThreadRegistry } from "./thread-registry";
import type { ChatPlatform, ChatThread } from "./types";

const URL_PATTERN = /https?:\/\/\S+/i;
const ANY_MESSAGE_PATTERN = /[\s\S]+/;

interface ChatTurnHost {
  getContext: () => InterfacePluginContext | undefined;
  startProcessingInput: (channelId: string) => void;
  endProcessingInput: () => void;
  extractCaptureableUrls: (
    content: string,
    blockedDomains: string[],
  ) => string[];
  captureUrlViaAgent: (
    url: string,
    channelId: string,
    authorId: string,
    interfaceType: string,
    permissionContext?: PermissionLookupContext,
  ) => Promise<void>;
}

interface ChatTurnControllerDeps {
  config: ChatConfig;
  host: ChatTurnHost;
  promptActions: PromptActionStore;
  threadRegistry: ThreadRegistry;
  subscriptionRouter: SubscriptionRouter;
  chatInputBuilder: ChatInputBuilder;
  uploadCoordinator: ChatUploadCoordinator;
  responseCoordinator: ChatResponseCoordinator;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Owns inbound Chat SDK handler registration and agent-turn routing. Daemon,
 * outbound-message, progress, and tool-status lifecycle stays in ChatInterface.
 */
export class ChatTurnController {
  private readonly deps: ChatTurnControllerDeps;

  constructor(deps: ChatTurnControllerDeps) {
    this.deps = deps;
  }

  registerHandlers(app: ChatSdkApp): void {
    app.onDirectMessage(async (thread, message, _channel, context) => {
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onNewMention(async (thread, message, context) => {
      const platformConfig = this.getPlatformConfig(thread);
      const platform = this.getPlatform(thread);
      if (
        platform === "discord" &&
        this.deps.config.adapters.discord &&
        platformConfig &&
        shouldRouteChatMessage(thread, message, platformConfig) &&
        !thread.isDM &&
        this.deps.config.adapters.discord.useThreads
      ) {
        await this.deps.subscriptionRouter.subscribeOwnedThread(
          thread,
          message,
        );
      } else if (
        platform === "slack" &&
        platformConfig &&
        shouldRouteChatMessage(thread, message, platformConfig) &&
        !thread.isDM
      ) {
        await this.deps.subscriptionRouter.subscribeThread(thread);
      }
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onSubscribedMessage(async (thread, message, context) => {
      if (
        !(await this.deps.subscriptionRouter.shouldRouteSubscribedMessage(
          thread,
          message,
        ))
      )
        return;
      await this.handleRoutedMessage(thread, message, context);
    });

    if (
      (this.deps.config.adapters.discord &&
        !this.deps.config.adapters.discord.requireMention) ||
      (this.deps.config.adapters.slack &&
        !this.deps.config.adapters.slack.requireMention)
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
    const context = this.deps.host.getContext();
    if (!context || !event.thread || !event.value) return;
    const platform = event.adapter.name;
    if (!isEnabledChatPlatform(this.deps.config, platform)) return;
    if (platform !== "discord" && platform !== "slack") return;

    const thread = event.thread;
    if (!shouldHandleChatAction(thread, this.getPlatformConfig(thread))) return;

    const action = this.deps.promptActions.get(event.value);
    if (action?.threadId !== thread.id) {
      await thread.post(
        formatChatNoticePayload(
          "That suggested action is no longer available.",
          "Action unavailable",
        ),
      );
      return;
    }
    this.deps.promptActions.consume(event.value);

    const userPermissionLevel = context.permissions.getUserLevel(
      platform,
      event.user.userId,
      getPermissionContext(thread, {
        author: {
          isMe: event.user.isMe,
          isBot: event.user.isBot,
        },
      }),
    );
    const isAnchor = context.permissions.isAnchor(platform, event.user.userId);
    const conversationId = getChatConversationId(platform, thread.id);
    const channelId = thread.id;

    await this.runAgentTurn({
      thread,
      channelId,
      logLabel: "Error handling chat prompt action",
      body: async () => {
        const currentContext = this.deps.host.getContext();
        if (!currentContext) return;
        const attachments =
          await this.deps.uploadCoordinator.selectPriorUploads({
            platform,
            conversationId,
            currentAttachments: [],
            canRestore:
              userPermissionLevel === "admin" ||
              userPermissionLevel === "trusted",
          });
        const response = await currentContext.agent.chat(
          action.prompt,
          conversationId,
          {
            userPermissionLevel,
            isAnchor,
            interfaceType: platform,
            channelId,
            channelName: getChannelName(thread),
            ...buildChatActionEventMetadata(platform, thread, event),
            ...(attachments.length > 0 ? { attachments } : {}),
          },
        );
        await this.deps.responseCoordinator.renderAgentResponse({
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
    const context = this.deps.host.getContext();
    if (!context || !event.thread || !event.value) return;
    const platform = event.adapter.name;
    if (!isEnabledChatPlatform(this.deps.config, platform)) return;
    if (platform !== "discord" && platform !== "slack") return;

    const thread = event.thread;
    if (!shouldHandleChatAction(thread, this.getPlatformConfig(thread))) return;

    const conversationId = getChatConversationId(platform, thread.id);
    const approvalIds =
      await this.deps.responseCoordinator.getPendingApprovalIds(conversationId);
    if (!approvalIds.has(event.value)) {
      await thread.post(
        formatChatNoticePayload("That approval is no longer pending."),
      );
      return;
    }

    const userPermissionLevel = context.permissions.getUserLevel(
      platform,
      event.user.userId,
      getPermissionContext(thread, {
        author: {
          isMe: event.user.isMe,
          isBot: event.user.isBot,
        },
      }),
    );

    await this.deps.responseCoordinator.confirmApproval({
      thread,
      conversationId,
      approvalId: event.value,
      confirmed: event.actionId === APPROVAL_CONFIRM_ACTION,
      userPermissionLevel,
      isAnchor: context.permissions.isAnchor(platform, event.user.userId),
      metadata: buildChatActionEventMetadata(platform, thread, event),
    });
  }

  private async handleRoutedMessage(
    thread: ChatThread,
    message: Message,
    context?: MessageContext,
  ): Promise<void> {
    if (!this.deps.host.getContext()) return;
    const platform = this.getPlatform(thread);
    if (!isEnabledChatPlatform(this.deps.config, platform)) return;
    if (platform !== "discord" && platform !== "slack") return;

    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig) return;
    if (!shouldRouteChatMessage(thread, message, platformConfig)) return;

    await this.routeToAgent(platform, thread, message, context);
  }

  private async runAgentTurn(input: {
    thread: ChatThread;
    channelId: string;
    logLabel: string;
    body: () => Promise<void>;
  }): Promise<void> {
    this.deps.host.startProcessingInput(input.channelId);
    try {
      if (this.getPlatformConfig(input.thread)?.showTypingIndicator) {
        await input.thread.startTyping().catch((error: unknown) =>
          this.deps.logger.debug("Typing indicator failed", {
            error,
            channelId: input.channelId,
          }),
        );
      }
      await input.body();
    } catch (error: unknown) {
      this.deps.logger.error(input.logLabel, {
        error,
        channelId: input.channelId,
      });
      await this.postTurnError(input.thread, input.channelId, error);
    } finally {
      this.deps.host.endProcessingInput();
    }
  }

  private async postTurnError(
    thread: ChatThread,
    channelId: string,
    error: unknown,
  ): Promise<void> {
    const payload = formatChatErrorPayload(error);
    const postOutput = toPlatformPostOutput(channelId, payload);
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
    const pluginContext = this.deps.host.getContext();
    if (!pluginContext) return;

    this.deps.threadRegistry.set(thread);
    const conversationId = getChatConversationId(platform, thread.id);
    const channelId = thread.id;
    const permissionContext = getPermissionContext(thread, message);
    const userPermissionLevel = pluginContext.permissions.getUserLevel(
      platform,
      message.author.userId,
      permissionContext,
    );
    const isAnchor = pluginContext.permissions.isAnchor(
      platform,
      message.author.userId,
    );
    const agentInput = await this.deps.chatInputBuilder.build(
      platform,
      thread,
      message,
      userPermissionLevel,
    );
    const sameTurnUploads = [...agentInput.attachments];
    await this.deps.uploadCoordinator.attachPriorUploads(
      platform,
      conversationId,
      agentInput,
      userPermissionLevel,
    );
    await this.postUploadNotices(thread, agentInput.notices);
    if (!agentInput.message && agentInput.attachments.length === 0) return;
    this.deps.uploadCoordinator.remember(
      platform,
      conversationId,
      sameTurnUploads,
    );

    await this.runAgentTurn({
      thread,
      channelId,
      logLabel: "Error handling chat message",
      body: async () => {
        const currentContext = this.deps.host.getContext();
        if (!currentContext) return;

        const pendingApprovalIds =
          await this.deps.responseCoordinator.getPendingApprovalIds(
            conversationId,
          );
        if (pendingApprovalIds.size > 0) {
          const handledConfirmation =
            await this.deps.responseCoordinator.handleConfirmationResponse({
              message: agentInput.message,
              conversationId,
              thread,
              approvalIds: pendingApprovalIds,
              userPermissionLevel,
              isAnchor,
              metadata: buildChatUserMessageMetadata(platform, thread, message),
            });
          if (handledConfirmation) return;
        }

        const coalescedInput = buildChatCoalescedAgentInput(
          agentInput.message,
          context,
        );
        const response = await currentContext.agent.chat(
          coalescedInput.message,
          conversationId,
          {
            userPermissionLevel,
            isAnchor,
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

        await this.deps.responseCoordinator.renderAgentResponse({
          thread,
          channelId,
          conversationId,
          response,
          userPermissionLevel,
        });
      },
    });
  }

  private async handlePassiveUrlCapture(
    thread: ChatThread,
    message: Message,
  ): Promise<void> {
    const platform = this.getPlatform(thread);
    if (!isEnabledChatPlatform(this.deps.config, platform)) return;
    const platformConfig = this.getPlatformConfig(thread);
    if (!platformConfig?.captureUrls) return;
    if (!platformConfig.requireMention) return;
    if (!isAllowedChannel(thread, platformConfig)) return;
    if (message.author.isMe) return;
    if (message.author.isBot) return;
    if (message.isMention) return;

    const urls = this.deps.host.extractCaptureableUrls(
      message.text,
      platformConfig.blockedUrlDomains,
    );
    if (urls.length === 0) return;

    this.deps.threadRegistry.set(thread);
    const permissionContext = getPermissionContext(thread, message);
    for (const url of urls) {
      await this.deps.host
        .captureUrlViaAgent(
          url,
          thread.id,
          message.author.userId,
          platform,
          permissionContext,
        )
        .catch((error: unknown) =>
          this.deps.logger.error("URL capture failed", { error, url }),
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
    if (platform === "discord") return this.deps.config.adapters.discord;
    if (platform === "slack") return this.deps.config.adapters.slack;
    return undefined;
  }
}

export function isEnabledChatPlatform(
  config: ChatConfig,
  interfaceType: string,
): boolean {
  const enabledPlatforms = new Set<ChatPlatform>();
  if (config.adapters.discord) enabledPlatforms.add("discord");
  if (config.adapters.slack) enabledPlatforms.add("slack");
  return ownsChatPlatform(interfaceType, enabledPlatforms);
}
