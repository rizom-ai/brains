import { toolSuccessSchema } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import type {
  PendingConfirmation,
  StructuredChatCard,
  ToolResultData,
} from "./agent-types";
import {
  buildAttachmentCardFromToolData,
  buildEntityMemoryRefs,
  savedItems,
  toolResultFrom,
  type EntityMemoryRef,
} from "./agent-results";
import { asRecord, readString } from "@brains/utils/record-fields";

const failedToolOutputSchema = z.looseObject({
  success: z.literal(false),
});

function isFailedToolOutput(value: unknown): boolean {
  return failedToolOutputSchema.safeParse(value).success;
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
  const parsedArgs = asRecord(args);
  if (!parsedArgs) return undefined;
  return Object.fromEntries(
    Object.entries(parsedArgs).filter(
      ([key]) => !INTERNAL_CONFIRMATION_FIELDS.has(key),
    ),
  );
}

export interface ConfirmedActionResult {
  resultText: string;
  toolResult: ToolResultData;
  cards: StructuredChatCard[];
  entityMemoryRefs: EntityMemoryRef[];
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
    ? (readString(result, "error") ?? readString(result, "message"))
    : undefined;
  const actionLabel = statementFromConfirmationSummary(
    failed
      ? pendingConfirmation.summary
      : (pendingConfirmation.completionSummary ?? pendingConfirmation.summary),
  );
  const successResult = toolSuccessSchema.safeParse(result);
  // What the action verified, such as what storage now holds after a write.
  const detail = errorMessage ?? successResult.data?.completionDetail;
  const resultText = detail
    ? `${prefix}: ${actionLabel}\n\n${detail}`
    : `${prefix}: ${actionLabel}`;
  const pendingArgs = asRecord(pendingConfirmation.args);
  // Recorded the way any turn records a tool's result, so a confirmed write
  // reads like one the agent made without asking.
  const toolResult: ToolResultData = toolResultFrom({
    toolResult: {
      toolCallId: pendingConfirmation.toolCallId ?? pendingConfirmation.id,
      toolName: pendingConfirmation.toolName,
      output: result,
    },
    args: pendingArgs,
    links: undefined,
  })?.result ?? { toolName: pendingConfirmation.toolName };
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
      ? { error: readString(result, "error") ?? "Action failed" }
      : {}),
  };
  // A save of several files shows each saved file's attachment.
  const attachmentCards = successResult.success
    ? [successResult.data.data, ...savedItems(successResult.data.data)].flatMap(
        (data) => buildAttachmentCardFromToolData(data) ?? [],
      )
    : [];
  const cards: StructuredChatCard[] = [approvalCard, ...attachmentCards];
  const entityMemoryRefs = successResult.success
    ? buildEntityMemoryRefs([toolResult])
    : [];

  return { resultText, toolResult, cards, entityMemoryRefs };
}
