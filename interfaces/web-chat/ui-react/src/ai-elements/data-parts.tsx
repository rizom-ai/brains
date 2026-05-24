/** @jsxImportSource react */

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
  data,
}: {
  data: unknown;
}): React.ReactElement {
  const title = getStringValue(data, "title") ?? "Confirmation required";
  const description = getStringValue(data, "description");

  return (
    <section className="web-chat-confirmation" role="group" aria-label={title}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      <JsonDetails title="Confirmation details" data={data} />
      <p className="web-chat-confirmation-note">
        Confirmation actions are not wired in the browser UI yet.
      </p>
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
