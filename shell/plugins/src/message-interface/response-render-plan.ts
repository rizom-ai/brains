import type {
  AgentResponse,
  PendingConfirmation,
  StructuredChatCard,
} from "../contracts/agent";
import { formatConfirmationResult } from "./confirmation-result";

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

export function getDeniedAttachmentCards(
  cards: StructuredChatCard[] | undefined,
  deniedCardIds: ReadonlySet<string> | undefined,
): AttachmentChatCard[] {
  return (cards ?? []).filter(
    (card): card is AttachmentChatCard =>
      card.kind === "attachment" && Boolean(deniedCardIds?.has(card.id)),
  );
}

export function getDeliverableArtifactCards(
  cards: StructuredChatCard[] | undefined,
  deniedCardIds: ReadonlySet<string> | undefined,
): AttachmentChatCard[] {
  return (cards ?? []).filter(
    (card): card is AttachmentChatCard =>
      card.kind === "attachment" && !deniedCardIds?.has(card.id),
  );
}

export function getSupplementalCards(
  cards: StructuredChatCard[] | undefined,
  pendingConfirmations: PendingConfirmation[] | undefined,
): SupplementalChatCard[] {
  const suppressRequestedApprovals = Boolean(pendingConfirmations?.length);
  return (cards ?? []).filter((card): card is SupplementalChatCard => {
    if (card.kind === "attachment") return false;
    return !(
      suppressRequestedApprovals &&
      card.kind === "tool-approval" &&
      card.state === "approval-requested"
    );
  });
}

export type AttachmentChatCard = Extract<
  StructuredChatCard,
  { kind: "attachment" }
>;
export type SupplementalChatCard = Exclude<
  StructuredChatCard,
  { kind: "attachment" }
>;
export type ToolApprovalChatCard = Extract<
  StructuredChatCard,
  { kind: "tool-approval" }
>;

/**
 * One renderable unit of an agent response, in delivery order. Each
 * interface maps directives to its own mechanism (discrete card messages
 * vs stream events); selection and sequencing live here so they cannot
 * drift between interfaces.
 *
 * - `text` — the main response text (may be empty; renderers decide).
 * - `denied-artifact` — an artifact the user's permission level may not
 *   receive; render at most a mention, never the content.
 * - `artifact` — a deliverable artifact card.
 * - `supplemental` — a non-attachment card (sources, actions, resolved
 *   tool cards; also *requested* approvals when no confirmation flow is
 *   active).
 * - `approvals` — emitted only when the response carries pending
 *   confirmations; holds both the approval-requested cards and the
 *   confirmations so each interface renders its own approval UX.
 */
export type ResponseRenderDirective =
  | { kind: "text"; text: string }
  | { kind: "denied-artifact"; card: AttachmentChatCard }
  | { kind: "artifact"; card: AttachmentChatCard }
  | { kind: "supplemental"; card: SupplementalChatCard }
  | {
      kind: "approvals";
      cards: ToolApprovalChatCard[];
      confirmations: PendingConfirmation[];
    };

export interface ResponsePlan {
  directives: ResponseRenderDirective[];
  /** Async job ids referenced by the response, for progress tracking. */
  jobIds: string[];
}

export function buildResponsePlan(
  response: Pick<
    AgentResponse,
    "text" | "cards" | "pendingConfirmations" | "toolResults"
  >,
  access: { deniedCardIds?: ReadonlySet<string> | undefined },
): ResponsePlan {
  const confirmations = response.pendingConfirmations ?? [];
  const directives: ResponseRenderDirective[] = [
    { kind: "text", text: response.text },
    ...getDeniedAttachmentCards(response.cards, access.deniedCardIds).map(
      (card): ResponseRenderDirective => ({ kind: "denied-artifact", card }),
    ),
    ...getDeliverableArtifactCards(response.cards, access.deniedCardIds).map(
      (card): ResponseRenderDirective => ({ kind: "artifact", card }),
    ),
    ...getSupplementalCards(response.cards, response.pendingConfirmations).map(
      (card): ResponseRenderDirective => ({ kind: "supplemental", card }),
    ),
  ];
  if (confirmations.length > 0) {
    directives.push({
      kind: "approvals",
      cards: (response.cards ?? []).filter(
        (card): card is ToolApprovalChatCard =>
          card.kind === "tool-approval" && card.state === "approval-requested",
      ),
      confirmations,
    });
  }
  return { directives, jobIds: getResponseJobIds(response) };
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
