import type { StructuredChatCard, ToolApprovalCard } from "../contracts/agent";

/**
 * Shared approval-card structure for message interfaces.
 *
 * Interfaces render approvals differently (Discord embeds and buttons,
 * terminal text), but the underlying structure — which cards are pending,
 * which card resolved, the base request text, and the result outcome — is
 * interface-neutral and lives here.
 */

/**
 * Filter the pending (approval-requested) tool-approval cards from a
 * structured agent response.
 */
export function getPendingApprovalCards(
  cards: StructuredChatCard[] | undefined,
): ToolApprovalCard[] {
  return (
    cards?.filter(
      (card): card is ToolApprovalCard =>
        card.kind === "tool-approval" && card.state === "approval-requested",
    ) ?? []
  );
}

/**
 * Find the resolved tool-approval card (completed, failed, or denied) in a
 * structured agent response.
 */
export function getResolvedApprovalCard(
  cards: StructuredChatCard[] | undefined,
): ToolApprovalCard | undefined {
  return cards?.find(
    (card): card is ToolApprovalCard =>
      card.kind === "tool-approval" &&
      (card.state === "output-available" ||
        card.state === "output-error" ||
        card.state === "output-denied"),
  );
}

/**
 * Base text for an approval-request message: keeps the agent text when
 * present, otherwise falls back to the card summary (single approval) or a
 * generic prompt (multiple approvals). Interfaces append their own
 * platform-specific instructions.
 */
export function formatApprovalRequestText(
  text: string,
  approvalCards: ToolApprovalCard[],
): string {
  if (approvalCards.length === 0) return text;
  if (text.trim().length > 0) return text;
  if (approvalCards.length === 1) return approvalCards[0]?.summary ?? text;
  return "Multiple approvals required.";
}

export type ApprovalResolution = "completed" | "declined" | "failed";

/**
 * Platform-neutral view of a resolved approval card; interfaces map the
 * resolution to their own presentation (embed titles and colors, glyphs).
 */
export interface ApprovalResultView {
  resolution: ApprovalResolution;
  summary: string;
  toolName: string;
  error: string | undefined;
}

export function buildApprovalResultView(
  card: ToolApprovalCard,
): ApprovalResultView {
  const resolution: ApprovalResolution =
    card.state === "output-error"
      ? "failed"
      : card.state === "output-denied"
        ? "declined"
        : "completed";
  return {
    resolution,
    summary: card.summary,
    toolName: card.toolName,
    error: resolution === "failed" ? card.error : undefined,
  };
}
