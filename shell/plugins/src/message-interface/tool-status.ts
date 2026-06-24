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

export interface ToolStatusDisplay {
  key: string;
  label: string;
  title: string;
  fallbackPrefix: string;
  fallback: string;
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

export function getToolStatusKey(update: ToolStatusUpdate): string {
  return `${update.conversationId}:${update.toolName}`;
}

export function formatToolStatusLabel(toolName: string): string {
  return toolName.replace(/[_-]+/g, " ");
}

export function getToolStatusTitle(state: ToolStatusState): string {
  switch (state) {
    case "running":
      return "Tool running";
    case "completed":
      return "Tool completed";
    case "awaiting-approval":
      return "Approval required";
    case "failed":
      return "Tool failed";
  }
}

export function getToolStatusFallbackPrefix(state: ToolStatusState): string {
  switch (state) {
    case "running":
      return "Tool running";
    case "completed":
      return "Tool completed";
    case "awaiting-approval":
      return "Tool awaiting approval";
    case "failed":
      return "Tool failed";
  }
}

export function getToolStatusDisplay(
  update: ToolStatusUpdate,
): ToolStatusDisplay {
  const key = getToolStatusKey(update);
  const label = formatToolStatusLabel(update.toolName);
  const title = getToolStatusTitle(update.state);
  const fallbackPrefix = getToolStatusFallbackPrefix(update.state);
  const baseFallback = `${fallbackPrefix}: ${label}`;
  return {
    key,
    label,
    title,
    fallbackPrefix,
    fallback: update.error ? `${baseFallback}: ${update.error}` : baseFallback,
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
