import type { AgentResponse, ToolApprovalCard } from "../contracts/agent";
import type { ToolActivityEvent } from "./tool-event-handler";

export type ToolStatusState =
  | "running"
  | "completed"
  | "awaiting-approval"
  | "failed";

export interface ToolStatusUpdate {
  state: ToolStatusState;
  toolName: string;
  conversationId: string;
  interfaceType: string;
  channelId?: string;
  channelName?: string;
  error?: string;
}

export function toToolStatusUpdate(
  event: ToolActivityEvent,
  state: ToolStatusState,
): ToolStatusUpdate {
  return {
    state,
    toolName: event.toolName,
    conversationId: event.conversationId,
    interfaceType: event.interfaceType,
    ...(event.channelId !== undefined && { channelId: event.channelId }),
    ...(event.channelName !== undefined && { channelName: event.channelName }),
    ...(event.error !== undefined && { error: event.error }),
  };
}

export function responseHasPendingConfirmationForTool(
  response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
  toolName: string,
): boolean {
  return (
    response.pendingConfirmations?.some(
      (confirmation) => confirmation.toolName === toolName,
    ) === true ||
    getPendingApprovalCards(response.cards).some(
      (card) => card.toolName === toolName,
    )
  );
}

function getPendingApprovalCards(
  cards: AgentResponse["cards"],
): ToolApprovalCard[] {
  return (
    cards?.filter(
      (card): card is ToolApprovalCard =>
        card.kind === "tool-approval" && card.state === "approval-requested",
    ) ?? []
  );
}
