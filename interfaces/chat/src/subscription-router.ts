import type { Message } from "chat";
import type { ChatThread } from "./types";
import type {
  DiscordThreadSubscriptionState,
  DiscordThreadSubscriptionStore,
} from "./subscription-state";

const MENTION_REQUIRED_NOTICE =
  "I’ll stop auto-replying now that more people joined. Mention me if you need me.";

interface SubscriptionRouterDeps {
  getSubscriptions: () => DiscordThreadSubscriptionStore | undefined;
  getPlatform: (thread: ChatThread) => string;
  /** Platform-specific: did the bot create this thread? Discord supplies this today. */
  isBotCreatedThread: (thread: ChatThread, message: Message) => boolean;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Platform-agnostic subscription/mention routing policy: subscribe to threads
 * the bot created, and once a subscribed thread has more than one human, require
 * an explicit @mention before auto-replying (announcing the switch once).
 *
 * The only platform-specific input — detecting a bot-created thread — is
 * injected, so a future Slack adapter reuses this policy with its own detection.
 * (Naming/state still say "Discord" until that second adapter lands and shows
 * what actually varies.)
 */
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

    try {
      await thread.subscribe();
      await this.deps.getSubscriptions()?.set(thread.id, {
        subscribedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.deps.logger.debug("Discord thread subscription failed", {
        error,
        threadId: thread.id,
      });
    }
  }

  async shouldRouteSubscribedMessage(
    thread: ChatThread,
    message: Message,
  ): Promise<boolean> {
    if (this.deps.getPlatform(thread) !== "discord") return false;
    if (thread.isDM) return true;

    const subscription = await this.deps.getSubscriptions()?.get(thread.id);
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
      await this.deps.getSubscriptions()?.set(thread.id, nextSubscription);
    }

    return Boolean(message.isMention);
  }

  private async postMentionRequiredNotice(
    thread: ChatThread,
    subscription: DiscordThreadSubscriptionState,
  ): Promise<void> {
    await thread.post(MENTION_REQUIRED_NOTICE);
    await this.deps.getSubscriptions()?.set(thread.id, {
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
      this.deps.logger.debug("Failed to inspect Discord thread participants", {
        error,
        threadId: thread.id,
      });
      return false;
    }
  }
}
