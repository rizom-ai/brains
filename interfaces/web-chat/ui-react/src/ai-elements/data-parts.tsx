/** @jsxImportSource react */
import { useState } from "react";
import { Tool, ToolContent, ToolHeader, ToolOutput } from "./tool";

interface ConfirmationResult {
  text: string;
  toolResults?: unknown[];
  cards?: unknown[];
}

type ConfirmationResultVariant = "success" | "error" | "declined";

interface ConfirmationResultDisplay {
  label: string;
  variant: ConfirmationResultVariant;
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function getRecordValue(data: unknown, key: string): unknown {
  if (!isRecord(data)) return undefined;
  return data[key];
}

function getStringValue(data: unknown, key: string): string | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "string" ? value : undefined;
}

function getBooleanValue(data: unknown, key: string): boolean | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "boolean" ? value : undefined;
}

function getFirstToolResult(result: ConfirmationResult): unknown {
  return Array.isArray(result.toolResults) ? result.toolResults[0] : undefined;
}

function getFirstApprovalCard(result: ConfirmationResult): unknown {
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
    return JSON.parse(json) as unknown;
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
  result: ConfirmationResult,
  decision: "approved" | "declined" | null,
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

export function ToolCallsGroup({
  tools,
}: {
  tools: unknown[];
}): React.ReactElement {
  return (
    <details className="web-chat-tool-group">
      <summary className="web-chat-tool-group-header">
        {tools.length} tool calls
        <span className="web-chat-data-part-chevron" aria-hidden="true" />
      </summary>
      <div className="web-chat-tool-group-body">
        {tools.map((data, index) => (
          <ToolResultPart key={index} data={data} />
        ))}
      </div>
    </details>
  );
}

export function ToolResultPart({
  data,
}: {
  data: unknown;
}): React.ReactElement {
  const toolName =
    getStringValue(data, "toolName") ??
    getStringValue(data, "name") ??
    getStringValue(data, "tool");
  const label = toolName ? `tool · ${toolName}` : "tool result";

  return (
    <Tool data-kind="tool-result">
      <ToolHeader
        type="dynamic-tool"
        state="output-available"
        toolName={toolName ?? "tool"}
        title={label}
      />
      <ToolContent>
        <ToolOutput output={data} errorText={undefined} />
      </ToolContent>
    </Tool>
  );
}

export function NativeToolPart({
  data,
}: {
  data: unknown;
}): React.ReactElement {
  const toolName = getStringValue(data, "toolName") ?? "tool";
  const state = getStringValue(data, "state") ?? "input-available";
  const title = getStringValue(data, "title") ?? `tool · ${toolName}`;
  const output =
    getRecordValue(data, "output") ?? getRecordValue(data, "input");
  const errorText = getStringValue(data, "errorText");

  return (
    <Tool data-kind="tool-result">
      <ToolHeader
        type="dynamic-tool"
        state={state as Parameters<typeof ToolHeader>[0]["state"]}
        toolName={toolName}
        title={title}
      />
      <ToolContent>
        <ToolOutput output={output} errorText={errorText} />
      </ToolContent>
    </Tool>
  );
}

export function ConfirmationPart({
  conversationId,
  data,
  addToolApprovalResponse,
}: {
  conversationId: string;
  data: unknown;
  addToolApprovalResponse?: (input: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void | PromiseLike<void>;
}): React.ReactElement {
  const title = getStringValue(data, "title") ?? "Confirmation required";
  const description =
    getStringValue(data, "description") ?? getStringValue(data, "title");
  const approval = getRecordValue(data, "approval");
  const approvalId =
    getStringValue(data, "id") ?? getStringValue(approval, "id");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [decision, setDecision] = useState<"approved" | "declined" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function submitConfirmation(confirmed: boolean): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    try {
      if (addToolApprovalResponse && approvalId) {
        await addToolApprovalResponse({ id: approvalId, approved: confirmed });
        setDecision(confirmed ? "approved" : "declined");
        return;
      }

      const response = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: conversationId, approvalId, confirmed }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setResult((await response.json()) as ConfirmationResult);
      setDecision(confirmed ? "approved" : "declined");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Confirmation failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const resolved = result !== null;
  const display = result ? formatConfirmationResult(result, decision) : null;
  const headerLabel = resolved
    ? display?.variant === "error"
      ? "confirmation failed"
      : "confirmation resolved"
    : "confirmation pending";

  return (
    <section
      className="web-chat-confirmation"
      data-state={
        display?.variant === "error"
          ? "error"
          : resolved
            ? "resolved"
            : "pending"
      }
      role="group"
      aria-label={title}
    >
      <header className="web-chat-confirmation-header">{headerLabel}</header>
      <div className="web-chat-confirmation-body">
        <p className="web-chat-confirmation-summary">{description ?? title}</p>
        {resolved && display ? (
          <span
            className="web-chat-confirmation-result"
            data-variant={display.variant}
          >
            {display.label}
          </span>
        ) : (
          <div className="web-chat-confirmation-actions">
            <button
              type="button"
              data-variant="primary"
              disabled={isSubmitting}
              onClick={() => void submitConfirmation(true)}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void submitConfirmation(false)}
            >
              Decline
            </button>
          </div>
        )}
        {error ? <p className="web-chat-error">{error}</p> : null}
      </div>
    </section>
  );
}

export function GenericDataPart({
  data,
  type,
}: {
  data: unknown;
  type: string;
}): React.ReactElement {
  return (
    <details className="web-chat-data-part">
      <summary className="web-chat-data-part-header">
        {type}
        <span className="web-chat-data-part-chevron" aria-hidden="true" />
      </summary>
      <div className="web-chat-data-part-body">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </details>
  );
}
