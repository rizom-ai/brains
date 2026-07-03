/**
 * Confirmation Handler - Shared utility for parsing confirmation responses
 *
 * Provides consistent confirmation parsing across all message-based interfaces
 * (CLI, Matrix, etc.) with support for various affirmative and negative responses.
 */

import { parseConfirmationResponse } from "@brains/utils";
import type { PendingConfirmation } from "@brains/ai-service";

export { parseConfirmationResponse };

/**
 * Format a confirmation prompt with help text
 *
 * @param description - The action being confirmed
 * @returns Formatted markdown string with the prompt and help text
 */
export function formatConfirmationPrompt(description: string): string {
  return `${description}\n\n_Reply with **yes** to confirm or **no/cancel** to abort._`;
}

/**
 * Track pending confirmations per conversation
 *
 * Provides state management for confirmation flows, allowing each
 * conversation to have at most one pending confirmation at a time.
 */
export class ConfirmationTracker {
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  /**
   * Set a pending confirmation for a conversation
   */
  public setPending(
    conversationId: string,
    confirmation: PendingConfirmation,
  ): void {
    this.pendingConfirmations.set(conversationId, confirmation);
  }

  /**
   * Get the pending confirmation for a conversation
   */
  public getPending(conversationId: string): PendingConfirmation | undefined {
    return this.pendingConfirmations.get(conversationId);
  }

  /**
   * Clear the pending confirmation for a conversation
   */
  public clearPending(conversationId: string): void {
    this.pendingConfirmations.delete(conversationId);
  }

  /**
   * Check if a confirmation is pending for a conversation
   */
  public isPending(conversationId: string): boolean {
    return this.pendingConfirmations.has(conversationId);
  }
}
