import {
  formatPendingConfirmationHelp,
  formatPendingConfirmationsFallback,
  type PendingConfirmation,
} from "@brains/plugins";
import type { SentMessage } from "chat";
import type { ChatCardBuilder } from "./chat-cards";
import type { ChatThread } from "./types";

interface ApprovalCardTrackerDeps {
  cardBuilder: ChatCardBuilder;
  /** Strip transport components when an adapter needs explicit cleanup. */
  clearMessageComponents: (
    threadId: string,
    messageId: string,
  ) => Promise<void>;
}

/**
 * Tracks the approval-request card posted for each pending confirmation so a
 * later confirm/cancel can edit it in place to its resolved state. Keyed by
 * conversation + approval id. Extracted from ChatInterface; adapter-specific
 * component cleanup is injected.
 */
export class ApprovalCardTracker {
  private readonly deps: ApprovalCardTrackerDeps;
  private readonly cards = new Map<
    string,
    { message: SentMessage; summary: string; threadId: string }
  >();

  constructor(deps: ApprovalCardTrackerDeps) {
    this.deps = deps;
  }

  async trackPendingConfirmations(
    thread: ChatThread,
    conversationId: string,
    pendingConfirmations: PendingConfirmation[] | undefined,
  ): Promise<void> {
    if (!pendingConfirmations || pendingConfirmations.length === 0) return;

    if (pendingConfirmations.length > 1) {
      await thread.post({
        card: this.deps.cardBuilder.buildPendingConfirmationsCard(
          pendingConfirmations,
        ),
        fallbackText: formatPendingConfirmationsFallback(pendingConfirmations),
      });
      return;
    }

    const confirmation = pendingConfirmations[0];
    if (!confirmation) return;
    const fallbackText = formatPendingConfirmationHelp(pendingConfirmations);
    const sent = await thread.post(
      fallbackText
        ? {
            card: this.deps.cardBuilder.buildPendingConfirmationCard(
              confirmation,
            ),
            fallbackText,
          }
        : this.deps.cardBuilder.buildPendingConfirmationCard(confirmation),
    );
    this.cards.set(this.key(conversationId, confirmation.id), {
      message: sent,
      summary: confirmation.summary,
      threadId: thread.id,
    });
  }

  async resolve(
    conversationId: string,
    approvalId: string,
    resolution: { title: string; detail: string },
  ): Promise<boolean> {
    const key = this.key(conversationId, approvalId);
    const tracked = this.cards.get(key);
    if (!tracked) return false;
    this.cards.delete(key);
    await tracked.message.edit({
      card: this.deps.cardBuilder.buildResolvedApprovalCard(
        tracked.summary,
        resolution,
      ),
      fallbackText: `${resolution.title}: ${tracked.summary}${
        resolution.title === "Action failed" ? `\n${resolution.detail}` : ""
      }`,
    });
    await this.deps.clearMessageComponents(
      tracked.threadId,
      tracked.message.id,
    );
    return true;
  }

  private key(conversationId: string, approvalId: string): string {
    return `${conversationId}:${approvalId}`;
  }
}
