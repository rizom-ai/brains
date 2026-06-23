import { z } from "@brains/utils/zod-v4";

export type ConfirmationDecision = "approved" | "declined" | null;
export type ConfirmationResultVariant = "success" | "error" | "declined";

export interface ConfirmationResultInput {
  text: string;
  toolResults?: unknown[] | undefined;
  cards?: unknown[] | undefined;
}

export interface ConfirmationResultDisplay {
  label: string;
  variant: ConfirmationResultVariant;
}

const recordSchema = z.record(z.string(), z.unknown());

function parseRecord(data: unknown): Record<string, unknown> | null {
  const parsed = recordSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function getRecordValue(data: unknown, key: string): unknown {
  return parseRecord(data)?.[key];
}

function getStringValue(data: unknown, key: string): string | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "string" ? value : undefined;
}

function getBooleanValue(data: unknown, key: string): boolean | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "boolean" ? value : undefined;
}

function getFirstToolResult(result: ConfirmationResultInput): unknown {
  return Array.isArray(result.toolResults) ? result.toolResults[0] : undefined;
}

function getFirstApprovalCard(result: ConfirmationResultInput): unknown {
  if (!Array.isArray(result.cards)) return undefined;
  return result.cards.find(
    (card) => getStringValue(card, "kind") === "tool-approval",
  );
}

function getToolResultData(toolResult: unknown): unknown {
  return getRecordValue(toolResult, "data");
}

function parseResultJson(text: string): unknown {
  const marker = "\n\nResult:";
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return undefined;

  const json = text.slice(markerIndex + marker.length).trim();
  if (!json) return undefined;

  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function humanizeToolName(toolName: string | undefined): string | undefined {
  if (!toolName) return undefined;
  const words = toolName
    .replace(/^system[_-]/, "")
    .split(/[_-]+/)
    .filter(Boolean);
  if (words.length === 0) return undefined;
  const label = words.join(" ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function formatConfirmationResult(
  result: ConfirmationResultInput,
  decision: ConfirmationDecision,
): ConfirmationResultDisplay {
  if (decision === "declined") {
    return { label: "Declined", variant: "declined" };
  }

  const approvalCard = getFirstApprovalCard(result);
  const toolResult = getFirstToolResult(result);
  const toolLabel = humanizeToolName(
    getStringValue(approvalCard, "toolName") ??
      getStringValue(toolResult, "toolName"),
  );
  const resultData =
    getRecordValue(approvalCard, "output") ??
    getToolResultData(toolResult) ??
    parseResultJson(result.text);
  const cardState = getStringValue(approvalCard, "state");
  const success = getBooleanValue(resultData, "success");
  const errorMessage =
    getStringValue(approvalCard, "error") ??
    getStringValue(resultData, "error") ??
    getStringValue(resultData, "message");

  if (cardState === "output-error") {
    const label = `${toolLabel ? `${toolLabel} failed` : "Action failed"}${
      errorMessage ? ` · ${errorMessage}` : ""
    }`;
    return { label, variant: "error" };
  }

  if (cardState === "output-available") {
    return {
      label: toolLabel ? `${toolLabel} completed` : "Action completed",
      variant: "success",
    };
  }

  if (cardState === "output-denied") {
    return {
      label: toolLabel ? `${toolLabel} denied` : "Action denied",
      variant: "declined",
    };
  }

  if (success === false) {
    const label = `${toolLabel ? `${toolLabel} failed` : "Action failed"}${
      errorMessage ? ` · ${errorMessage}` : ""
    }`;
    return { label, variant: "error" };
  }

  if (result.text.startsWith("Error:")) {
    return {
      label: `Action failed · ${result.text.replace(/^Error:\s*/, "")}`,
      variant: "error",
    };
  }

  if (result.text.startsWith("Failed:")) {
    const label = `${toolLabel ? `${toolLabel} failed` : "Action failed"}${
      errorMessage ? ` · ${errorMessage}` : ""
    }`;
    return { label, variant: "error" };
  }

  if (success === true) {
    return {
      label: toolLabel ? `${toolLabel} completed` : "Action completed",
      variant: "success",
    };
  }

  if (result.text.startsWith("Completed:")) {
    return {
      label: toolLabel ? `${toolLabel} completed` : "Action completed",
      variant: "success",
    };
  }

  return {
    label: result.text ? `Approved · ${result.text}` : "Approved",
    variant: "success",
  };
}

export function formatStructuredOutputSummary(
  output: unknown,
): string | undefined {
  if (typeof output === "string") return output;
  if (typeof output === "number" || typeof output === "boolean") {
    return String(output);
  }
  const parsedOutput = parseRecord(output);
  if (!parsedOutput) return undefined;
  const errorMessage =
    getStringValue(parsedOutput, "error") ??
    getStringValue(parsedOutput, "message");
  if (getBooleanValue(parsedOutput, "success") === false) {
    return errorMessage ? `Failed · ${errorMessage}` : "Failed";
  }
  return undefined;
}
