import { toolSuccessSchema } from "@brains/mcp-service";
import type {
  PendingConfirmation,
  StructuredChatCard,
  ToolResultData,
} from "./agent-types";
import {
  buildAttachmentCardFromToolData,
  buildEntityMemoryNote,
} from "./agent-results";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function isFailedToolOutput(value: unknown): boolean {
  return isRecord(value) && value["success"] === false;
}

function statementFromConfirmationSummary(summary: string): string {
  return summary.trim().replace(/[?？]+$/u, "");
}

const INTERNAL_CONFIRMATION_FIELDS = new Set([
  "confirmed",
  "confirmationToken",
  "contentHash",
]);

function toApprovalCardInput(
  args: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(args)) return undefined;
  return Object.fromEntries(
    Object.entries(args).filter(
      ([key]) => !INTERNAL_CONFIRMATION_FIELDS.has(key),
    ),
  );
}

export interface ConfirmedActionResult {
  resultText: string;
  toolResult: ToolResultData;
  cards: StructuredChatCard[];
  entityMemoryNote: string;
}

/**
 * Assemble the user-facing outcome of a confirmed tool execution:
 * the completion/failure text, the tool result, the approval card (plus an
 * attachment card when the tool produced one), and the entity memory note.
 */
export function buildConfirmedActionResult(
  pendingConfirmation: PendingConfirmation,
  result: unknown,
): ConfirmedActionResult {
  const failed = isFailedToolOutput(result);
  const prefix = failed ? "Failed" : "Completed";
  const errorMessage = failed
    ? (getStringField(result, "error") ?? getStringField(result, "message"))
    : undefined;
  const actionLabel = statementFromConfirmationSummary(
    failed
      ? pendingConfirmation.summary
      : (pendingConfirmation.completionSummary ?? pendingConfirmation.summary),
  );
  const resultText = errorMessage
    ? `${prefix}: ${actionLabel}\n\n${errorMessage}`
    : `${prefix}: ${actionLabel}`;
  const toolResult: ToolResultData = {
    toolName: pendingConfirmation.toolName,
    data: result,
    ...(isRecord(pendingConfirmation.args)
      ? { args: pendingConfirmation.args }
      : {}),
  };
  const approvalInput = toApprovalCardInput(pendingConfirmation.args);
  const approvalCard: StructuredChatCard = {
    kind: "tool-approval",
    id: pendingConfirmation.id,
    ...(pendingConfirmation.toolCallId
      ? { toolCallId: pendingConfirmation.toolCallId }
      : {}),
    toolName: pendingConfirmation.toolName,
    ...(approvalInput ? { input: approvalInput } : {}),
    summary: pendingConfirmation.summary,
    ...(pendingConfirmation.completionSummary !== undefined
      ? { completionSummary: pendingConfirmation.completionSummary }
      : {}),
    state: failed ? "output-error" : "output-available",
    output: result,
    ...(failed
      ? { error: getStringField(result, "error") ?? "Action failed" }
      : {}),
  };
  const successResult = toolSuccessSchema.safeParse(result);
  const attachmentCard = successResult.success
    ? buildAttachmentCardFromToolData(successResult.data.data)
    : undefined;
  const cards: StructuredChatCard[] = [
    approvalCard,
    ...(attachmentCard ? [attachmentCard] : []),
  ];
  const entityMemoryNote = successResult.success
    ? buildEntityMemoryNote([
        {
          ...toolResult,
          data: successResult.data.data,
        },
      ])
    : "";

  return { resultText, toolResult, cards, entityMemoryNote };
}
