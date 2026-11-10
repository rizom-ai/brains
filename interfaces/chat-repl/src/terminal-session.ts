import {
  PendingApprovalTracker,
  buildApprovalResultView,
  buildResponsePlan,
  formatApprovalRequestText,
  formatStructuredCardFallback,
  getPendingApprovalCards,
  getResolvedApprovalCard,
  parseConfirmationIntent,
  routeConfirmationResponse,
  type AgentResponse,
  type ApprovalResolution,
  type StructuredChatCard,
  type ToolApprovalCard,
} from "@brains/plugins";
import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";
import { createExternalActorId } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";

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

/** The CLI's one conversation: whoever runs the process. */
const CONVERSATION_ID = "cli";

/**
 * The operator at the terminal, the speaker of every turn. Without one the
 * turn's tool calls are the brain's own agent's, and work they queue, such
 * as a post's generation, runs at the agent's grant rather than the
 * terminal's admin permission.
 */
const TERMINAL_OPERATOR = {
  identity: {
    kind: "external",
    externalActorId: createExternalActorId("cli", "operator"),
  },
  interfaceType: "cli",
  role: "user",
} as const;

/**
 * What the terminal UI is wired to while it runs: the Ink app, the signal
 * handlers that stop it, and the callbacks the UI registered for replies and
 * for job progress and completion messages.
 */
export interface TerminalState {
  inkApp: { unmount(): void } | null;
  removeSignalHandlers: (() => void) | undefined;
  responseCallback: ((response: string) => void) | undefined;
  systemMessageCallback: ((message: string) => void) | undefined;
}

export function createTerminalState(): TerminalState {
  return {
    inkApp: null,
    removeSignalHandlers: undefined,
    responseCallback: undefined,
    systemMessageCallback: undefined,
  };
}

/** What the terminal UI calls to talk to the brain. */
export interface TerminalSession {
  processInput(input: string): Promise<void>;
}

/**
 * The CLI's conversation: every message goes to the agent as the local
 * administrator, in the one conversation `cli`; a yes or no answers the
 * approval it waits on, through the shared confirmation grammar.
 */
export function createTerminalSession(
  runtime: InterfaceRuntime,
  state: TerminalState,
): TerminalSession {
  const { logger } = runtime;
  // Tracks pending confirmation approval ids; restores them from stored
  // conversation messages so approvals survive a process restart.
  const approvalTracker = new PendingApprovalTracker({
    loadMessages: async (conversationId: string): Promise<readonly unknown[]> =>
      runtime.conversations.getMessages(conversationId, { limit: 50 }),
    onRestoreError: (error, conversationId): void => {
      logger.debug("Failed to restore pending CLI approvals", {
        error,
        conversationId,
      });
    },
  });

  const sendReply = (message: string): void => {
    state.responseCallback?.(message);
  };

  const isAnchor = (): boolean => runtime.permissions.isAnchor("cli", "local");

  /**
   * Handle confirmation responses (yes/no) through the shared grammar.
   * Returns false for non-confirmation input so topic changes fall through
   * to the agent, which owns the implicit-decline semantics.
   */
  const handleConfirmationResponse = async (
    message: string,
    pendingApprovalIds: string[],
  ): Promise<boolean> => {
    const approvalIds = new Set(pendingApprovalIds);
    if (!parseConfirmationIntent(message, approvalIds)) return false;

    const routed = routeConfirmationResponse({
      message: resolveApprovalIndexSugar(message, pendingApprovalIds),
      approvalIds,
    });
    if (routed.kind === "not-confirmation") return false;
    if (routed.kind === "notice") {
      sendReply(`_${routed.message}_`);
      return true;
    }

    // Clear selected pending confirmation before asking the agent.
    approvalTracker.removeApproval(CONVERSATION_ID, routed.approvalId);

    const response = await runtime.agent.confirmPendingAction(
      CONVERSATION_ID,
      routed.confirmed,
      routed.approvalId,
      {
        userPermissionLevel: "admin",
        isAnchor: isAnchor(),
        interfaceType: "cli",
        actor: TERMINAL_OPERATOR,
      },
    );
    approvalTracker.syncFromResponse(
      CONVERSATION_ID,
      response,
      routed.approvalId,
    );

    sendReply(formatApprovalResultText(response.text, response.cards));
    return true;
  };

  return {
    /**
     * Routes all input to the agent for natural language processing.
     */
    async processInput(input: string): Promise<void> {
      // Start processing - buffers completion messages until the agent responds
      runtime.messages.startProcessingInput();

      try {
        // Check for explicit confirmation responses. Other messages fall
        // through to the agent; it applies the authoritative implicit-decline
        // semantics for mid-confirmation topic changes.
        const pendingApprovalIds = [
          ...(await approvalTracker.getApprovalIds(CONVERSATION_ID)),
        ];
        if (pendingApprovalIds.length > 0) {
          const handledConfirmation = await handleConfirmationResponse(
            input,
            pendingApprovalIds,
          );
          if (handledConfirmation) return;
        }

        // Route message to the agent with administrator permissions (CLI is local).
        const response = await runtime.agent.chat(input, CONVERSATION_ID, {
          userPermissionLevel: "admin",
          isAnchor: isAnchor(),
          interfaceType: "cli",
          channelId: "cli",
          channelName: "CLI Terminal",
          actor: TERMINAL_OPERATOR,
        });

        // Track pending confirmations if returned
        const approvalCards = getPendingApprovalCards(response.cards);
        const nextApprovalIds =
          approvalCards.length > 0
            ? approvalCards.map((card) => card.id)
            : (response.pendingConfirmations?.map(
                (confirmation) => confirmation.id,
              ) ?? []);
        approvalTracker.replaceApprovals(CONVERSATION_ID, nextApprovalIds);

        // Render the full response plan: text, approval prompts, and the
        // sources/actions/artifact cards other interfaces already show.
        const responseText = renderAgentResponse(response);

        logger.debug("Agent response received", {
          textLength: response.text.length,
          toolResultsCount: response.toolResults?.length ?? 0,
          toolResults: response.toolResults?.map((tr) => ({
            toolName: tr.toolName,
            hasData: tr.data !== undefined,
          })),
        });

        // Tool formatted outputs are available to the agent but not
        // auto-appended; the agent summarizes tool results in its response.
        sendReply(responseText);
      } catch (error) {
        logger.error("Error processing input", { error, input });
        const errorMessage = getErrorMessage(
          error,
          "An unknown error occurred",
        );
        sendReply(`**Error:** ${errorMessage}`);
      } finally {
        // End processing - flushes any buffered completion messages
        runtime.messages.endProcessingInput();
      }
    },
  };
}

/**
 * Render an agent response for the terminal from the shared response plan.
 *
 * Approval-requested cards are gathered from both the plan's approvals
 * directive and the supplemental stream (the plan only emits the approvals
 * directive when the response carries pending confirmations; the CLI also
 * treats bare approval-requested cards as confirmations), then rendered
 * with the terminal's reply instructions. Every other card renders through
 * the shared text fallback, so sources, actions, and artifacts reach the
 * terminal instead of being dropped.
 */
function renderAgentResponse(
  response: Pick<
    AgentResponse,
    "text" | "cards" | "pendingConfirmations" | "toolResults"
  >,
): string {
  const plan = buildResponsePlan(response, { deniedCardIds: undefined });
  const approvalCards: ToolApprovalCard[] = [];
  const cardBlocks: string[] = [];
  let text = "";

  for (const directive of plan.directives) {
    switch (directive.kind) {
      case "text":
        text = directive.text;
        break;
      case "approvals":
        approvalCards.push(...directive.cards);
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
 * Format CLI response text for structured approval cards: the shared base
 * text plus terminal-specific previews and reply instructions.
 */
function formatAgentResponseText(
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

  const approvalList = approvalCards
    .map((card, index) => {
      const preview = card.preview ? `\n   ${card.preview}` : "";
      return `${index + 1}. ${card.summary}${preview}`;
    })
    .join("\n");
  return `${baseText}\n\n${approvalList}\n\n_Please reply with **yes 1** / **no 1** for the matching action._`;
}

function formatApprovalResultText(
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
 * Terminal sugar: `yes 2` / `no #1` selects the nth pending approval. The
 * index lowers into the approval id before the shared grammar routes the
 * message, so all confirmation semantics — ambiguity notices, unknown-id
 * handling, single-approval fallback — live in one place across interfaces.
 */
function resolveApprovalIndexSugar(
  message: string,
  pendingApprovalIds: string[],
): string {
  const match = /^(.*?)\s+#?(\d+)$/.exec(message.trim());
  if (!match?.[1] || !match[2]) return message;
  const approvalId = pendingApprovalIds[Number(match[2]) - 1];
  return approvalId ? `${match[1]} ${approvalId}` : message;
}
