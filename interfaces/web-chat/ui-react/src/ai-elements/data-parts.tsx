/** @jsxImportSource react */
import { useState } from "react";

interface ConfirmationResult {
  text: string;
}

function JsonDetails({
  data,
  title,
}: {
  data: unknown;
  title: string;
}): React.ReactElement {
  return (
    <details className="web-chat-data-part">
      <summary>{title}</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function getRecordValue(data: unknown, key: string): unknown {
  if (typeof data !== "object" || data === null) return undefined;
  return (data as Record<string, unknown>)[key];
}

function getStringValue(data: unknown, key: string): string | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "string" ? value : undefined;
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

  return (
    <JsonDetails
      title={toolName ? `Tool result: ${toolName}` : "Tool result"}
      data={data}
    />
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
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Confirmation failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="web-chat-confirmation" role="group" aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      <JsonDetails title="Confirmation details" data={data} />
      <div className="web-chat-confirmation-actions">
        <button
          type="button"
          disabled={isSubmitting || result !== null}
          onClick={() => void submitConfirmation(true)}
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={isSubmitting || result !== null}
          onClick={() => void submitConfirmation(false)}
        >
          Cancel
        </button>
      </div>
      {result ? (
        <p className="web-chat-confirmation-result">{result.text}</p>
      ) : null}
      {error ? <p className="web-chat-error">{error}</p> : null}
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
  return <JsonDetails title={type} data={data} />;
}
