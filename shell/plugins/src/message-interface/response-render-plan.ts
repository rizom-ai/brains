import type {
  AgentResponse,
  PendingConfirmation,
  StructuredChatCard,
} from "../contracts/agent";
import { formatConfirmationResult } from "./confirmation-result";

export interface AgentResponseTextPartsInput {
  text: string;
  cards: StructuredChatCard[] | undefined;
  pendingConfirmations: PendingConfirmation[] | undefined;
  deniedCardIds: ReadonlySet<string> | undefined;
  formatCard: (card: StructuredChatCard) => string;
}

export interface ConfirmationResponsePartsInput {
  response: AgentResponse;
  confirmed: boolean;
  remainingApprovalHelp: string | undefined;
  deniedCardIds: ReadonlySet<string> | undefined;
  formatCard: (card: StructuredChatCard) => string;
  formatPendingConfirmationHelp: (
    pendingConfirmations: PendingConfirmation[],
  ) => string | undefined;
}

export interface ConfirmationResponseParts {
  variant: ReturnType<typeof formatConfirmationResult>["variant"];
  parts: string[];
}

export function formatPendingConfirmationsFallback(
  pendingConfirmations: PendingConfirmation[],
): string {
  return [
    "Approvals pending:",
    ...pendingConfirmations.map(
      (confirmation) => `${confirmation.id}: ${confirmation.summary}`,
    ),
    "Reply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
  ].join("\n");
}

export function formatPendingConfirmationHelp(
  pendingConfirmations: PendingConfirmation[] | undefined,
): string | undefined {
  if (!pendingConfirmations || pendingConfirmations.length === 0) {
    return undefined;
  }
  if (pendingConfirmations.length === 1) {
    const confirmation = pendingConfirmations[0];
    if (!confirmation) return undefined;
    return [
      `Approval required: ${confirmation.summary}`,
      "Reply yes to confirm or no/cancel to abort.",
    ].join("\n");
  }

  return formatPendingConfirmationsFallback(pendingConfirmations);
}

export function buildAgentResponseTextParts({
  text,
  cards,
  pendingConfirmations,
  deniedCardIds,
  formatCard,
}: AgentResponseTextPartsInput): string[] {
  return [
    text,
    ...getMainResponseSummaryCards({
      cards,
      pendingConfirmations,
      deniedCardIds,
    }).map(formatCard),
  ].filter(isNonEmptyString);
}

export function buildConfirmationResponseParts({
  response,
  confirmed,
  remainingApprovalHelp,
  deniedCardIds,
  formatCard,
  formatPendingConfirmationHelp,
}: ConfirmationResponsePartsInput): ConfirmationResponseParts {
  const display = formatConfirmationResult(
    response,
    confirmed ? "approved" : "declined",
  );
  const pendingHelp =
    response.pendingConfirmations && response.pendingConfirmations.length > 1
      ? formatPendingConfirmationHelp(response.pendingConfirmations)
      : undefined;
  const parts = [
    display.label,
    ...getDeniedAttachmentCards(response.cards, deniedCardIds).map(formatCard),
    pendingHelp,
    remainingApprovalHelp,
  ].filter(isNonEmptyString);

  return {
    variant: display.variant,
    parts,
  };
}

export function getMainResponseSummaryCards(input: {
  cards: StructuredChatCard[] | undefined;
  pendingConfirmations: PendingConfirmation[] | undefined;
  deniedCardIds: ReadonlySet<string> | undefined;
}): StructuredChatCard[] {
  const suppressApprovalCards = Boolean(input.pendingConfirmations?.length);
  return (input.cards ?? []).filter((card) => {
    if (suppressApprovalCards && card.kind === "tool-approval") {
      return false;
    }
    return card.kind === "attachment" && input.deniedCardIds?.has(card.id);
  });
}

export function getDeniedAttachmentCards(
  cards: StructuredChatCard[] | undefined,
  deniedCardIds: ReadonlySet<string> | undefined,
): StructuredChatCard[] {
  return (cards ?? []).filter(
    (card) => card.kind === "attachment" && deniedCardIds?.has(card.id),
  );
}

export function getDeliverableArtifactCards(
  cards: StructuredChatCard[] | undefined,
  deniedCardIds: ReadonlySet<string> | undefined,
): Array<Extract<StructuredChatCard, { kind: "attachment" }>> {
  return (cards ?? []).filter(
    (card): card is Extract<StructuredChatCard, { kind: "attachment" }> =>
      card.kind === "attachment" && !deniedCardIds?.has(card.id),
  );
}

export function getSupplementalCards(
  cards: StructuredChatCard[] | undefined,
  pendingConfirmations: PendingConfirmation[] | undefined,
): Array<Exclude<StructuredChatCard, { kind: "attachment" }>> {
  const suppressRequestedApprovals = Boolean(pendingConfirmations?.length);
  return (cards ?? []).filter(
    (card): card is Exclude<StructuredChatCard, { kind: "attachment" }> => {
      if (card.kind === "attachment") return false;
      return !(
        suppressRequestedApprovals &&
        card.kind === "tool-approval" &&
        card.state === "approval-requested"
      );
    },
  );
}

export function getResponseJobIds(
  response: Pick<AgentResponse, "toolResults" | "cards">,
): string[] {
  const jobIds = new Set<string>();
  for (const toolResult of response.toolResults ?? []) {
    if (toolResult.jobId) jobIds.add(toolResult.jobId);
  }
  for (const card of response.cards ?? []) {
    if (card.kind === "attachment" && card.jobId) jobIds.add(card.jobId);
  }
  return [...jobIds];
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value?.trim());
}
