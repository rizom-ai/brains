/** @jsxImportSource react */
import { useState } from "react";
import { Tool, ToolContent, ToolHeader, ToolOutput } from "./tool";

interface ConfirmationResult {
  text: string;
}

function getRecordValue(data: unknown, key: string): unknown {
  if (typeof data !== "object" || data === null) return undefined;
  return (data as Record<string, unknown>)[key];
}

function getStringValue(data: unknown, key: string): string | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "string" ? value : undefined;
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
      <ToolHeader title={label} />
      <ToolContent>
        <ToolOutput output={data} />
      </ToolContent>
    </Tool>
  );
}

export function ConfirmationPart({
  conversationId,
  data,
}: {
  conversationId: string;
  data: unknown;
}): React.ReactElement {
  const title = getStringValue(data, "title") ?? "Confirmation required";
  const description = getStringValue(data, "description");
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
      const response = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: conversationId, confirmed }),
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
  const headerLabel = resolved
    ? "confirmation resolved"
    : "confirmation pending";

  return (
    <section
      className="web-chat-confirmation"
      data-state={resolved ? "resolved" : "pending"}
      role="group"
      aria-label={title}
    >
      <header className="web-chat-confirmation-header">{headerLabel}</header>
      <div className="web-chat-confirmation-body">
        <p className="web-chat-confirmation-summary">{description ?? title}</p>
        {resolved ? (
          <span className="web-chat-confirmation-result">
            {decision === "declined" ? "Declined" : "Approved"}
            {result.text ? ` · ${result.text}` : ""}
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
