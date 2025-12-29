/**
 * Confirmation Handler - Shared utility for parsing confirmation responses
 *
 * Provides consistent confirmation parsing across all message-based interfaces
 * (CLI, Matrix, etc.) with support for various affirmative and negative responses.
 */

import type { PendingConfirmation } from "@brains/agent-service";

/**
 * Positive confirmation responses (case-insensitive)
 */
const POSITIVE_RESPONSES = new Set([
  "yes",
  "y",
  "ok",
  "sure",
  "proceed",
  "confirm",
  "go",
]);

/**
 * Negative confirmation responses (case-insensitive)
 */
const NEGATIVE_RESPONSES = new Set([
  "no",
  "n",
  "cancel",
  "abort",
  "stop",
  "nope",
]);

/**
 * Parse a user's response to a confirmation prompt
 *
 * @param input - The user's input string
 * @returns `{ confirmed: true }` for positive responses,
 *          `{ confirmed: false }` for negative responses,
 *          or `undefined` if the response is not recognized
 */
export function parseConfirmationResponse(
  input: string,
): { confirmed: boolean } | undefined {
  const normalized = input.toLowerCase().trim();

  if (normalized === "") {
    return undefined;
  }

  if (POSITIVE_RESPONSES.has(normalized)) {
    return { confirmed: true };
  }

  if (NEGATIVE_RESPONSES.has(normalized)) {
    return { confirmed: false };
  }

  return undefined;
}

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
