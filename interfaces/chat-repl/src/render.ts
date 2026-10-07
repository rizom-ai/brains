import {
  buildApprovalResultView,
  formatApprovalRequestText,
  formatStructuredCardFallback,
  getResolvedApprovalCard,
  type ApprovalResolution,
  type ResponseRenderDirective,
  type StructuredChatCard,
  type ToolApprovalCard,
} from "@brains/sdk/interfaces";

const APPROVAL_RESULT_MARKERS: Record<ApprovalResolution, string> = {
  completed: "✓",
  declined: "○",
  failed: "✗",
};

/**
 * The terminal shows URLs as-is and hides nothing; permission filtering
 * happened upstream (the CLI runs as the local administrator).
 */
const CARD_FALLBACK_OPTIONS = {
  deniedCardIds: undefined,
  resolveUrl: (url: string | undefined): string | undefined => url,
  isHiddenUrl: (): boolean => false,
  eventActionUnavailableLabel: undefined,
};

/**
 * Format CLI response text for structured approval cards: the shared base
 * text plus terminal-specific previews and reply instructions.
 */
export function formatAgentResponseText(
  text: string,
  approvalCards: ToolApprovalCard[],
): string {
  if (approvalCards.length === 0) return text;
  const baseText = formatApprovalRequestText(text, approvalCards);

  if (approvalCards.length === 1) {
    const approvalCard = approvalCards[0];
    if (!approvalCard) return text;
    const preview = approvalCard.preview ? `\n\n${approvalCard.preview}` : "";
    return `${baseText}${preview}\n\n_Please reply with **yes** to confirm or **no/cancel** to abort._`;
  }

  // Numbered, which is what makes "yes 2" mean anything: `interpret` lowers
  // the ordinal back to an approval id using the same order.
  const approvalList = approvalCards
    .map((card, index) => {
      const preview = card.preview ? `\n   ${card.preview}` : "";
      return `${index + 1}. ${card.summary}${preview}`;
    })
    .join("\n");
  return `${baseText}\n\n${approvalList}\n\n_Please reply with **yes 1** / **no 1** for the matching action._`;
}

export function formatApprovalResultText(
  text: string,
  cards: StructuredChatCard[] | undefined,
): string {
  const resultCard = getResolvedApprovalCard(cards);
  if (!resultCard) return text;

  const result = buildApprovalResultView(resultCard);
  const marker = APPROVAL_RESULT_MARKERS[result.resolution];
  return result.error
    ? `${marker} ${result.summary}\n\n${result.error}`
    : `${marker} ${result.summary}`;
}

/**
 * One terminal block for a whole answer.
 *
 * Approval-requested cards are gathered from both the approvals directive
 * and the supplemental stream — the runtime only emits the approvals
 * directive when the response carries pending confirmations, and the
 * terminal also treats a bare approval-requested card as one. Every other
 * card renders through the shared text fallback, so sources, actions and
 * artifacts reach the terminal instead of being dropped.
 */
export function renderTerminalAnswer(
  directives: readonly ResponseRenderDirective[],
): string {
  const approvalCards: ToolApprovalCard[] = [];
  const cardBlocks: string[] = [];
  let text = "";

  for (const directive of directives) {
    switch (directive.kind) {
      case "text":
        text = directive.text;
        break;
      case "approvals":
        approvalCards.push(...directive.cards);
        break;
      case "tool-result":
        // A terminal prints the answer, not the machinery behind it: the text
        // already says what the tool did, and a raw result block would repeat
        // it in a shape nobody reads.
        break;
      default:
        if (
          directive.card.kind === "tool-approval" &&
          directive.card.state === "approval-requested"
        ) {
          approvalCards.push(directive.card);
          break;
        }
        cardBlocks.push(
          formatStructuredCardFallback(directive.card, CARD_FALLBACK_OPTIONS),
        );
    }
  }

  return [formatAgentResponseText(text, approvalCards), ...cardBlocks]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}

/**
 * Terminal sugar: `yes 2` / `no #1` selects the nth pending approval, in the
 * order this terminal printed them. Lowering the index to an approval id
 * here keeps every other confirmation semantic — ambiguity notices,
 * unknown-id handling, single-approval fallback — in the runtime, shared
 * across interfaces.
 */
export function resolveApprovalIndexSugar(
  message: string,
  approvalIds: readonly string[],
): string {
  const match = /^(.*?)\s+#?(\d+)$/u.exec(message.trim());
  if (!match?.[1] || !match[2]) return message;
  const approvalId = approvalIds[Number(match[2]) - 1];
  return approvalId ? `${match[1]} ${approvalId}` : message;
}
