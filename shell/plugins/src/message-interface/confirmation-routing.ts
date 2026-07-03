import { parseConfirmationResponse } from "./confirmation-handler";

export type ConfirmationRouteResult =
  | { kind: "not-confirmation" }
  | { kind: "confirm"; approvalId: string; confirmed: boolean }
  | { kind: "notice"; message: string };

export interface ConfirmationRouteInput {
  message: string;
  approvalIds: ReadonlySet<string>;
}

interface ParsedConfirmationIntent {
  confirmed: boolean;
  approvalId?: string;
}

export function routeConfirmationResponse({
  message,
  approvalIds,
}: ConfirmationRouteInput): ConfirmationRouteResult {
  if (approvalIds.size === 0) {
    return { kind: "not-confirmation" };
  }

  const parsed = parseConfirmationIntent(message, approvalIds);
  if (!parsed) {
    return {
      kind: "notice",
      message: "Please reply with yes to confirm or no/cancel to abort.",
    };
  }

  if (!parsed.approvalId && hasExplicitApprovalReference(message)) {
    return {
      kind: "notice",
      message: `No matching pending approval id. Pending approval ids: ${formatApprovalIds(
        approvalIds,
      )}.`,
    };
  }

  if (approvalIds.size > 1 && !parsed.approvalId) {
    return {
      kind: "notice",
      message: `Multiple approvals are pending; include one approval id with yes or no/cancel: ${formatApprovalIds(
        approvalIds,
      )}.`,
    };
  }

  const approvalId = parsed.approvalId ?? firstApprovalId(approvalIds);
  if (!approvalId) {
    return { kind: "notice", message: "No pending approval to resolve." };
  }

  return {
    kind: "confirm",
    approvalId,
    confirmed: parsed.confirmed,
  };
}

export function parseConfirmationIntent(
  message: string,
  approvalIds?: ReadonlySet<string>,
): ParsedConfirmationIntent | undefined {
  const direct = parseConfirmationResponse(message);
  const approvalId = extractApprovalId(message, approvalIds);
  if (direct) return { ...direct, ...(approvalId ? { approvalId } : {}) };

  const tokenConfirmation = message
    .split(/\s+/)
    .map((token) => parseConfirmationResponse(token))
    .find((parsed) => parsed !== undefined);
  if (!tokenConfirmation) return undefined;
  return {
    ...tokenConfirmation,
    ...(approvalId ? { approvalId } : {}),
  };
}

export function extractApprovalId(
  message: string,
  approvalIds: ReadonlySet<string> | undefined,
): string | undefined {
  if (!approvalIds || approvalIds.size === 0) return undefined;
  const normalized = message.toLowerCase();
  return [...approvalIds]
    .sort((left, right) => right.length - left.length)
    .find((approvalId) =>
      containsApprovalIdToken(normalized, approvalId.toLowerCase()),
    );
}

export function containsApprovalIdToken(
  message: string,
  approvalId: string,
): boolean {
  const escapedApprovalId = approvalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9_-])${escapedApprovalId}($|[^a-z0-9_-])`).test(
    message,
  );
}

export function hasExplicitApprovalReference(message: string): boolean {
  return /(^|[^a-z0-9_-])approval[:-][a-z0-9_-]+/i.test(message);
}

function firstApprovalId(approvalIds: ReadonlySet<string>): string | undefined {
  for (const approvalId of approvalIds) return approvalId;
  return undefined;
}

function formatApprovalIds(approvalIds: ReadonlySet<string>): string {
  return [...approvalIds].join(", ");
}
