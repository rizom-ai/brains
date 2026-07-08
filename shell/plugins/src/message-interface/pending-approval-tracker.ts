import type { AgentResponse } from "../contracts/agent";
import { collectPendingApprovalIdsFromStoredMessages } from "./stored-message-metadata";

export type PendingApprovalMessageLoader = (
  conversationId: string,
) => Promise<readonly unknown[]>;

export interface PendingApprovalTrackerOptions {
  loadMessages: PendingApprovalMessageLoader;
  onRestoreError?: (error: unknown, conversationId: string) => void;
}

export class PendingApprovalTracker {
  private readonly options: PendingApprovalTrackerOptions;
  private readonly pendingByConversation = new Map<string, Set<string>>();

  public constructor(options: PendingApprovalTrackerOptions) {
    this.options = options;
  }

  public rememberFromResponse(
    conversationId: string,
    response: Pick<AgentResponse, "pendingConfirmations">,
  ): void {
    if (
      !response.pendingConfirmations ||
      response.pendingConfirmations.length === 0
    ) {
      return;
    }

    this.pendingByConversation.set(
      conversationId,
      new Set(
        response.pendingConfirmations.map((confirmation) => confirmation.id),
      ),
    );
  }

  public async getApprovalIds(conversationId: string): Promise<Set<string>> {
    const existing = this.pendingByConversation.get(conversationId);
    if (existing && existing.size > 0) return new Set(existing);

    const restored = await this.restoreApprovalIds(conversationId);
    if (restored.size > 0) {
      this.pendingByConversation.set(conversationId, restored);
    }
    return new Set(restored);
  }

  public removeApproval(conversationId: string, approvalId: string): void {
    const approvalIds = this.pendingByConversation.get(conversationId);
    if (!approvalIds) return;

    approvalIds.delete(approvalId);
    if (approvalIds.size === 0) {
      this.pendingByConversation.delete(conversationId);
    }
  }

  public deleteConversation(conversationId: string): void {
    this.pendingByConversation.delete(conversationId);
  }

  public syncFromResponse(
    conversationId: string,
    response: Pick<AgentResponse, "pendingConfirmations">,
    resolvedApprovalId: string,
  ): void {
    if (response.pendingConfirmations === undefined) return;

    const pendingIds = new Set(
      response.pendingConfirmations
        .map((confirmation) => confirmation.id)
        .filter((approvalId) => approvalId !== resolvedApprovalId),
    );
    if (pendingIds.size === 0) {
      this.pendingByConversation.delete(conversationId);
      return;
    }

    this.pendingByConversation.set(conversationId, pendingIds);
  }

  public formatRemainingApprovalHelp(
    conversationId: string,
    response: Pick<AgentResponse, "pendingConfirmations">,
  ): string | undefined {
    if (response.pendingConfirmations !== undefined) return undefined;

    const remainingIds = this.pendingByConversation.get(conversationId);
    if (!remainingIds || remainingIds.size === 0) return undefined;

    return `Remaining pending approval ids: ${[...remainingIds]
      .map((approvalId) => `\`${approvalId}\``)
      .join(", ")}.`;
  }

  private async restoreApprovalIds(
    conversationId: string,
  ): Promise<Set<string>> {
    try {
      const messages = await this.options.loadMessages(conversationId);
      return collectPendingApprovalIdsFromStoredMessages(messages);
    } catch (error) {
      this.options.onRestoreError?.(error, conversationId);
      return new Set();
    }
  }
}
