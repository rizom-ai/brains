import { capitalize } from "@brains/utils/string-utils";
import {
  asRecord,
  readBoolean,
  readString,
  readValue,
} from "@brains/utils/record-fields";

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

function getFirstToolResult(result: ConfirmationResultInput): unknown {
  return Array.isArray(result.toolResults) ? result.toolResults[0] : undefined;
}

function getFirstApprovalCard(result: ConfirmationResultInput): unknown {
  if (!Array.isArray(result.cards)) return undefined;
  return result.cards.find(
    (card) => readString(card, "kind") === "tool-approval",
  );
}

function getToolResultData(toolResult: unknown): unknown {
  return readValue(toolResult, "data");
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
  return capitalize(label);
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
    readString(approvalCard, "toolName") ?? readString(toolResult, "toolName"),
  );
  const resultData =
    readValue(approvalCard, "output") ??
    getToolResultData(toolResult) ??
    parseResultJson(result.text);
  const cardState = readString(approvalCard, "state");
  const success = readBoolean(resultData, "success");
  const errorMessage =
    readString(approvalCard, "error") ??
    readString(resultData, "error") ??
    readString(resultData, "message");

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

export function getConfirmationResultTitle(
  variant: ConfirmationResultVariant,
): string {
  switch (variant) {
    case "success":
      return "Approval confirmed";
    case "declined":
      return "Approval declined";
    case "error":
      return "Action failed";
  }
}

export function formatStructuredOutputSummary(
  output: unknown,
): string | undefined {
  if (typeof output === "string") return output;
  if (typeof output === "number" || typeof output === "boolean") {
    return String(output);
  }
  const parsedOutput = asRecord(output);
  if (!parsedOutput) return undefined;
  const errorMessage =
    readString(parsedOutput, "error") ?? readString(parsedOutput, "message");
  if (readBoolean(parsedOutput, "success") === false) {
    return errorMessage ? `Failed · ${errorMessage}` : "Failed";
  }
  return undefined;
}
