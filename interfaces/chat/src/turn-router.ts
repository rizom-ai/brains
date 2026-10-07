import {
  buildCoalescedInput,
  extractCaptureableUrls,
  matchSpaceSelector,
  type AuthenticatedCaller,
  type InboundMessageAttachment,
  type MessageReceiver,
  type PermissionLookupContext,
} from "@brains/sdk/interfaces";
import type { ActionEvent, Message, MessageContext } from "chat";
import type { ChatAttachment } from "@brains/sdk/interfaces";
import {
  APPROVAL_CANCEL_ACTION,
  APPROVAL_CONFIRM_ACTION,
  PROMPT_ACTION,
} from "./chat-cards";
import {
  resolveChatIdentity,
  type ChatIdentityResolution,
} from "./chat-identity";
import {
  buildChatSpaceMessageMetadata,
  getChatConversationId,
} from "./chat-metadata";
import {
  formatChatErrorPayload,
  formatChatNoticePayload,
  toPlatformPostOutput,
} from "./chat-output";
import { chunkForChannel } from "./chat-platform";
import type { ChatSdkApp } from "./chat-sdk";
import {
  getChannelName,
  getPermissionContext,
  getSpaceId,
  getSpaceThreadId,
  isAllowedChannel,
  isBotCreatedDiscordThread,
  shouldHandleChatAction,
  shouldRouteChatMessage,
} from "./discord-routing";
import type { ChatPlatformState } from "./platform-state";
import { SubscriptionRouter } from "./subscription-router";
import type { ChatThreadSubscriptionStore } from "./subscription-state";
import type { ChatThread } from "./types";

const URL_PATTERN = /https?:\/\/\S+/i;
const ANY_MESSAGE_PATTERN = /[\s\S]+/;

/**
 * Where a Chat SDK event becomes a turn.
 *
 * Everything the runtime does with a turn — tracking what is pending, routing
 * a reply that resolves an approval, deciding what the answer is made of — it
 * does once the message is handed over. What stays here is the platform's
 * part: whether this message is for the brain at all, who is speaking and at
 * what level, which uploads came with it, and which room it came from.
 */
export class ChatTurnRouter {
  private readonly state: ChatPlatformState;
  private readonly messages: MessageReceiver;
  private readonly subscriptions: SubscriptionRouter;

  constructor(state: ChatPlatformState, messages: MessageReceiver) {
    this.state = state;
    this.messages = messages;
    this.subscriptions = new SubscriptionRouter({
      getSubscriptions: (): ChatThreadSubscriptionStore => state.subscriptions,
      getPlatform: (): string => state.platform,
      isBotCreatedThread: isBotCreatedDiscordThread,
      logger: state.logger,
    });
  }

  register(app: ChatSdkApp): void {
    const { platform, platformConfig } = this.state;

    app.onDirectMessage(async (thread, message, _channel, context) => {
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onNewMention(async (thread, message, context) => {
      if (
        platform === "discord" &&
        "useThreads" in platformConfig &&
        platformConfig.useThreads &&
        shouldRouteChatMessage(thread, message, platformConfig) &&
        !thread.isDM
      ) {
        await this.subscriptions.subscribeOwnedThread(thread, message);
      } else if (
        platform === "slack" &&
        shouldRouteChatMessage(thread, message, platformConfig) &&
        !thread.isDM
      ) {
        await this.subscriptions.subscribeThread(thread);
      }
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onSubscribedMessage(async (thread, message, context) => {
      if (
        !(await this.subscriptions.shouldRouteSubscribedMessage(
          thread,
          message,
        ))
      )
        return;
      await this.handleRoutedMessage(thread, message, context);
    });

    app.onNewMessage(URL_PATTERN, async (thread, message) => {
      await this.capturePassiveUrls(thread, message);
    });

    app.onNewMessage(ANY_MESSAGE_PATTERN, async (thread, message, context) => {
      if (!platformConfig.requireMention) {
        await this.handleRoutedMessage(thread, message, context);
      }
      await this.capturePassiveSpaceMessage(thread, message).catch(
        (error: unknown) =>
          this.state.logger.error("Passive space capture failed", {
            error,
            channelId: thread.channelId,
          }),
      );
    });

    app.onAction([APPROVAL_CONFIRM_ACTION, APPROVAL_CANCEL_ACTION], (event) =>
      this.handleApprovalAction(event),
    );
    app.onAction(PROMPT_ACTION, (event) => this.handlePromptAction(event));
    app.onAction(async (event) => {
      if (!event.actionId.startsWith(`${PROMPT_ACTION}:`)) return;
      await this.handlePromptAction(event);
    });
  }

  private ownsThread(thread: ChatThread): boolean {
    return thread.adapter.name === this.state.platform;
  }

  private async handleRoutedMessage(
    thread: ChatThread,
    message: Message,
    context?: MessageContext,
  ): Promise<void> {
    if (!this.ownsThread(thread)) return;
    if (!shouldRouteChatMessage(thread, message, this.state.platformConfig))
      return;
    await this.routeToAgent(thread, message, context);
  }

  private async routeToAgent(
    thread: ChatThread,
    message: Message,
    context?: MessageContext,
  ): Promise<void> {
    const { platform, threads, inputBuilder, uploads } = this.state;
    threads.set(thread);
    const conversationId = getChatConversationId(platform, thread.id);
    const identity = await this.resolveIdentity(
      message.author.userId,
      getPermissionContext(thread, message),
    );
    const agentInput = await inputBuilder.build(
      platform,
      thread,
      message,
      identity.permissionLevel,
    );
    const sameTurnUploads = [...agentInput.attachments];
    await uploads.attachPriorUploads(
      conversationId,
      agentInput,
      identity.permissionLevel,
    );
    await this.postUploadNotices(thread, agentInput.notices);
    if (!agentInput.message && agentInput.attachments.length === 0) return;
    uploads.remember(conversationId, sameTurnUploads);

    // Messages the SDK queued while an earlier turn ran arrive folded into
    // this one; the runtime is handed the text as the person would read it.
    const coalesced = buildCoalescedInput({
      message: agentInput.message,
      skippedMessages: (context?.skipped ?? []).map((skipped) => ({
        id: skipped.id,
        text: skipped.text,
        authorName: skipped.author.fullName || skipped.author.userName,
      })),
    });
    const attachments = agentInput.attachments;

    await this.runTurn(thread, "Error handling chat message", () =>
      this.messages.receiveAuthenticated({
        sender: sender(message.author, identity),
        channel: { id: thread.id, name: getChannelName(thread) },
        text: coalesced.message,
        messageId: message.id,
        caller: callerFrom(identity),
        ...(attachments.length > 0
          ? {
              attachments: async (): Promise<InboundMessageAttachment[]> =>
                attachments.map(inboundAttachment),
            }
          : {}),
      }),
    );
  }

  private async handlePromptAction(event: ActionEvent): Promise<void> {
    const thread = event.thread;
    if (!thread || !event.value || !this.ownsThread(thread)) return;
    if (!shouldHandleChatAction(thread, this.state.platformConfig)) return;

    const { platform, promptActions, uploads } = this.state;
    const action = promptActions.get(event.value);
    if (action?.threadId !== thread.id) {
      await thread.post(
        formatChatNoticePayload(
          "That suggested action is no longer available.",
          "Action unavailable",
        ),
      );
      return;
    }
    promptActions.consume(event.value);

    const identity = await this.resolveIdentity(
      event.user.userId,
      getPermissionContext(thread, {
        author: { isMe: event.user.isMe, isBot: event.user.isBot },
      }),
    );
    const conversationId = getChatConversationId(platform, thread.id);
    const prior = await uploads.selectPriorUploads({
      conversationId,
      currentAttachments: [],
      canRestore: canRestoreUploads(identity.permissionLevel),
    });

    await this.runTurn(thread, "Error handling chat prompt action", () =>
      this.messages.receiveAuthenticated({
        sender: sender(event.user, identity),
        channel: { id: thread.id, name: getChannelName(thread) },
        text: action.prompt,
        messageId: event.messageId,
        caller: callerFrom(identity),
        ...(prior.length > 0
          ? {
              attachments: async (): Promise<InboundMessageAttachment[]> =>
                prior.map(inboundAttachment),
            }
          : {}),
      }),
    );
  }

  private async handleApprovalAction(event: ActionEvent): Promise<void> {
    const thread = event.thread;
    if (!thread || !event.value || !this.ownsThread(thread)) return;
    if (!shouldHandleChatAction(thread, this.state.platformConfig)) return;

    const { platform, presenter, threads } = this.state;
    threads.set(thread);
    const conversationId = getChatConversationId(platform, thread.id);
    // A button outlives the approval it was drawn for; a click on a stale one
    // is told so at once rather than spending a turn on it.
    const room = { id: thread.id, name: getChannelName(thread) };
    const pending = await this.messages.pendingApprovals(room);
    if (!pending.includes(event.value)) {
      await thread.post(
        formatChatNoticePayload("That approval is no longer pending."),
      );
      return;
    }
    const identity = await this.resolveIdentity(
      event.user.userId,
      getPermissionContext(thread, {
        author: { isMe: event.user.isMe, isBot: event.user.isBot },
      }),
    );

    presenter.beginConfirmation(conversationId);
    try {
      // The outcome is not read: the answer itself was presented, and a
      // stale click was turned away above before it got here.
      await this.messages.resolveApproval({
        sender: sender(event.user, identity),
        channel: room,
        approvalId: event.value,
        approved: event.actionId === APPROVAL_CONFIRM_ACTION,
        caller: callerFrom(identity),
      });
    } catch (error: unknown) {
      this.state.logger.error("Error handling chat approval action", {
        error,
        channelId: thread.id,
      });
      await this.postTurnError(thread, error);
    } finally {
      presenter.endConfirmation(conversationId);
    }
  }

  private async runTurn(
    thread: ChatThread,
    logLabel: string,
    body: () => Promise<void>,
  ): Promise<void> {
    try {
      if (this.state.platformConfig.showTypingIndicator) {
        await thread.startTyping().catch((error: unknown) =>
          this.state.logger.debug("Typing indicator failed", {
            error,
            channelId: thread.id,
          }),
        );
      }
      await body();
    } catch (error: unknown) {
      this.state.logger.error(logLabel, { error, channelId: thread.id });
      await this.postTurnError(thread, error);
    }
  }

  private async postTurnError(
    thread: ChatThread,
    error: unknown,
  ): Promise<void> {
    const payload = formatChatErrorPayload(error);
    const postOutput = toPlatformPostOutput(thread.id, payload);
    if (postOutput !== undefined) {
      await thread.post(postOutput);
      return;
    }
    for (const chunk of chunkForChannel(thread.id, payload.fallbackText)) {
      await thread.post(chunk);
    }
  }

  /**
   * Record a channel's traffic into its space conversation without spending
   * an agent turn on it. Only messages the agent turn will not already write
   * are captured: a reply that stays in the channel uses the space
   * conversation itself, so capturing there would duplicate every message.
   */
  private async capturePassiveSpaceMessage(
    thread: ChatThread,
    message: Message,
  ): Promise<void> {
    const { platform, platformConfig, spaces, conversations } = this.state;
    if (!this.ownsThread(thread) || thread.isDM) return;
    if (message.author.isMe || message.author.isBot) return;
    if (!isAllowedChannel(thread, platformConfig)) return;

    const spaceId = getSpaceId(platform, thread);
    if (!spaces.some((selector) => matchSpaceSelector(selector, spaceId)))
      return;

    const spaceThreadId = getSpaceThreadId(thread);
    const routesToAgent =
      shouldRouteChatMessage(thread, message, platformConfig) &&
      (!platformConfig.requireMention || message.isMention);
    if (spaceThreadId === thread.id && routesToAgent) return;

    const content = message.text.trim();
    if (!content) return;

    const conversationId = getChatConversationId(platform, spaceThreadId);
    const identity = await this.resolveIdentity(
      message.author.userId,
      getPermissionContext(thread, message),
    );
    const channelName = getChannelName(thread);
    await conversations.start({
      sessionId: conversationId,
      interfaceType: platform,
      channelId: spaceThreadId,
      metadata: {
        channelName,
        interfaceType: platform,
        channelId: spaceThreadId,
      },
    });
    await conversations.addMessage({
      conversationId,
      role: "user",
      content,
      metadata: buildChatSpaceMessageMetadata(
        platform,
        thread,
        spaceThreadId,
        message,
        identity.principal,
      ),
    });
  }

  /**
   * Save the links people drop in a channel the brain listens in, without
   * replying. A dedicated conversation per channel keeps the saves out of
   * anyone's chat history.
   */
  private async capturePassiveUrls(
    thread: ChatThread,
    message: Message,
  ): Promise<void> {
    const { platform, platformConfig, permissions, agent, threads } =
      this.state;
    if (!this.ownsThread(thread)) return;
    if (!platformConfig.captureUrls || !platformConfig.requireMention) return;
    if (!isAllowedChannel(thread, platformConfig)) return;
    if (message.author.isMe || message.author.isBot || message.isMention)
      return;

    const urls = extractCaptureableUrls(
      message.text,
      platformConfig.blockedUrlDomains,
    );
    if (urls.length === 0) return;

    threads.set(thread);
    const permissionContext = getPermissionContext(thread, message);
    const userPermissionLevel = permissions.getUserLevel(
      platform,
      message.author.userId,
      permissionContext,
    );
    for (const url of urls) {
      await agent
        .chat(`Save this link: ${url}`, `links-${thread.id}`, {
          userPermissionLevel,
          interfaceType: platform,
          channelId: thread.id,
        })
        .catch((error: unknown) =>
          this.state.logger.error("URL capture failed", { error, url }),
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

  private resolveIdentity(
    userId: string,
    permissionContext: PermissionLookupContext,
  ): Promise<ChatIdentityResolution> {
    return resolveChatIdentity(
      this.state.permissions,
      this.state.platform,
      userId,
      permissionContext,
      this.state.identity(),
    );
  }
}

interface SpeakingUser {
  userId: string;
  userName: string;
  fullName: string;
}

/** A linked account is shown under its own name; anyone else under the platform's. */
function sender(
  user: SpeakingUser,
  identity: ChatIdentityResolution,
): { id: string; displayName: string } {
  return {
    id: user.userId,
    displayName:
      identity.principal?.displayName ?? (user.fullName || user.userName),
  };
}

/**
 * Who is asking, as the runtime records it.
 *
 * A linked account names the person and is attributed as them; an unbound
 * speaker is attributed to their platform id. Either way the level and the
 * anchor flag are this interface's to resolve, because only it knows the
 * channel the message came from.
 */
function callerFrom(identity: ChatIdentityResolution): AuthenticatedCaller {
  return {
    permissionLevel: identity.permissionLevel,
    isAnchor: identity.isAnchor,
    ...(identity.principal
      ? {
          userId: identity.principal.userId,
          ...(identity.principal.canonicalId
            ? { canonicalId: identity.principal.canonicalId }
            : {}),
        }
      : {}),
  };
}

function canRestoreUploads(level: string): boolean {
  return level === "admin" || level === "trusted";
}

/** An attachment this interface already holds the bytes of, as the runtime takes it. */
function inboundAttachment(
  attachment: ChatAttachment,
): InboundMessageAttachment {
  const source = attachment.source ? { source: attachment.source } : {};
  if (attachment.kind === "text") {
    return {
      name: attachment.filename,
      mediaType: attachment.mediaType,
      text: attachment.content,
      ...source,
    };
  }
  return {
    name: attachment.filename,
    mediaType: attachment.mediaType,
    data: new Uint8Array(attachment.data),
    ...source,
  };
}
