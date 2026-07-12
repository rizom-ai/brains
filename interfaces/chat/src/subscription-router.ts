import type { Message } from "chat";
import type { ChatThread } from "./types";
import type {
  ChatThreadSubscriptionState,
  ChatThreadSubscriptionStore,
} from "./subscription-state";

const MENTION_REQUIRED_NOTICE =
  "I’ll stop auto-replying now that more people joined. Mention me if you need me.";

interface SubscriptionRouterDeps {
  getSubscriptions: (
    platform: string,
  ) => ChatThreadSubscriptionStore | undefined;
  getPlatform: (thread: ChatThread) => string;
  /** Platform-specific: did the bot create this thread? Discord supplies this today. */
  isBotCreatedThread: (thread: ChatThread, message: Message) => boolean;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}

/** Shared subscription and mention-required routing policy for chat adapters. */
export class SubscriptionRouter {
  private readonly deps: SubscriptionRouterDeps;

  constructor(deps: SubscriptionRouterDeps) {
    this.deps = deps;
  }

  async subscribeOwnedThread(
    thread: ChatThread,
    message: Message,
  ): Promise<void> {
    if (!this.deps.isBotCreatedThread(thread, message)) return;
    await this.subscribeThread(thread);
  }

  async subscribeThread(thread: ChatThread): Promise<void> {
    try {
      await thread.subscribe();
      await this.getSubscriptions(thread)?.set(thread.id, {
        subscribedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.deps.logger.debug("Chat thread subscription failed", {
        error,
        threadId: thread.id,
      });
    }
  }

  async shouldRouteSubscribedMessage(
    thread: ChatThread,
    message: Message,
  ): Promise<boolean> {
    const subscriptions = this.getSubscriptions(thread);
    if (!subscriptions) return false;
    if (thread.isDM) return true;

    const subscription = await subscriptions.get(thread.id);
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

    const nextSubscription: ChatThreadSubscriptionState = {
      ...subscription,
      routingMode: "mention-required",
    };

    if (!message.isMention && !subscription.mentionRequiredNoticeSent) {
      await this.postMentionRequiredNotice(thread, nextSubscription);
    } else {
      await subscriptions.set(thread.id, nextSubscription);
    }

    return Boolean(message.isMention);
  }

  private async postMentionRequiredNotice(
    thread: ChatThread,
    subscription: ChatThreadSubscriptionState,
  ): Promise<void> {
    await thread.post(MENTION_REQUIRED_NOTICE);
    await this.getSubscriptions(thread)?.set(thread.id, {
      ...subscription,
      routingMode: "mention-required",
      mentionRequiredNoticeSent: true,
    });
  }

  private async shouldRequireMentionInSubscribedThread(
    thread: ChatThread,
  ): Promise<boolean> {
    try {
      const participants = await thread.getParticipants();
      const humanParticipants = participants.filter(
        (participant) => !participant.isBot && !participant.isMe,
      );
      return humanParticipants.length > 1;
    } catch (error) {
      this.deps.logger.debug("Failed to inspect chat thread participants", {
        error,
        threadId: thread.id,
      });
      return false;
    }
  }

  private getSubscriptions(
    thread: ChatThread,
  ): ChatThreadSubscriptionStore | undefined {
    return this.deps.getSubscriptions(this.deps.getPlatform(thread));
  }
}
