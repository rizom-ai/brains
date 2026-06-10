/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { z } from "@brains/utils";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
  type ToolPart,
} from "./tool";

const TOOL_STATES: readonly ToolPart["state"][] = [
  "approval-requested",
  "approval-responded",
  "input-streaming",
  "input-available",
  "output-available",
  "output-denied",
  "output-error",
];

function narrowToolState(value: string | undefined): ToolPart["state"] {
  if (value && (TOOL_STATES as readonly string[]).includes(value)) {
    return value as ToolPart["state"];
  }
  return "input-available";
}

interface ConfirmationResult {
  text: string;
  toolResults?: unknown[];
  cards?: unknown[];
}

type ConfirmationResultVariant = "success" | "error" | "declined";

export interface ConfirmationResultDisplay {
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

export function formatNativeToolDisplay(
  data: unknown,
): ConfirmationResultDisplay | null {
  const state = narrowToolState(getStringValue(data, "state"));
  if (
    state !== "output-available" &&
    state !== "output-error" &&
    state !== "output-denied"
  ) {
    return null;
  }

  const toolName = getStringValue(data, "toolName") ?? "tool";
  if (state === "output-denied") {
    const toolLabel = humanizeToolName(toolName);
    return {
      label: toolLabel ? `${toolLabel} denied` : "Action denied",
      variant: "declined",
    };
  }

  return formatConfirmationResult(
    {
      text: getStringValue(data, "title") ?? "",
      cards: [
        {
          kind: "tool-approval",
          toolName,
          state,
          output: getRecordValue(data, "output"),
          error: getStringValue(data, "errorText"),
        },
      ],
    },
    null,
  );
}

export interface AttachmentDisplay {
  jobId?: string;
  title: string;
  description?: string;
  mediaType?: string;
  filename?: string;
  sizeLabel?: string;
  url?: string;
  downloadUrl?: string;
  previewUrl?: string;
}

function formatByteSize(sizeBytes: number | undefined): string | undefined {
  if (sizeBytes === undefined) return undefined;
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return undefined;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = sizeBytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === "GB") {
      return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
    }
    value /= 1024;
  }
  return undefined;
}

function getNumberValue(data: unknown, key: string): number | undefined {
  const value = getRecordValue(data, key);
  return typeof value === "number" ? value : undefined;
}

export function formatAttachmentDisplay(
  data: unknown,
): AttachmentDisplay | null {
  const attachment = getRecordValue(data, "attachment");
  if (!isRecord(attachment)) return null;

  const jobId = getStringValue(data, "jobId");
  const description = getStringValue(data, "description");
  const mediaType = getStringValue(attachment, "mediaType");
  const filename = getStringValue(attachment, "filename");
  const sizeLabel = formatByteSize(getNumberValue(attachment, "sizeBytes"));
  const url = getStringValue(attachment, "url");
  const downloadUrl = getStringValue(attachment, "downloadUrl");
  const previewUrl = getStringValue(attachment, "previewUrl");

  return {
    ...(jobId !== undefined ? { jobId } : {}),
    title: getStringValue(data, "title") ?? "Generated artifact",
    ...(description !== undefined ? { description } : {}),
    ...(mediaType !== undefined ? { mediaType } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(sizeLabel !== undefined ? { sizeLabel } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(downloadUrl !== undefined ? { downloadUrl } : {}),
    ...(previewUrl !== undefined ? { previewUrl } : {}),
  };
}

export type AttachmentJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "unknown";

export interface AttachmentCardState {
  status: AttachmentJobStatus | "ready";
  label: string;
  isPending: boolean;
}

function useAttachmentJobStatus(
  jobId: string | undefined,
): AttachmentJobStatus | null {
  const [status, setStatus] = useState<AttachmentJobStatus | null>(
    jobId ? "pending" : null,
  );

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      return;
    }

    const pollingJobId = jobId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The job row can lag behind the card (enqueue → row visible), and the
    // status endpoint can blip, so transient failures retry with backoff
    // rather than stranding the card at "unknown" forever.
    let transientFailures = 0;
    const MAX_TRANSIENT_FAILURES = 5;

    const scheduleNextPoll = (delayMs: number): void => {
      if (cancelled) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const handleTransientFailure = (): void => {
      transientFailures += 1;
      if (transientFailures >= MAX_TRANSIENT_FAILURES) {
        if (!cancelled) setStatus("unknown");
        return;
      }
      scheduleNextPoll(Math.min(2000 * transientFailures, 8000));
    };

    async function poll(): Promise<void> {
      try {
        const response = await fetch(
          `/api/chat/jobs/status?id=${encodeURIComponent(pollingJobId)}`,
          { credentials: "same-origin" },
        );
        if (!response.ok) {
          handleTransientFailure();
          return;
        }
        transientFailures = 0;
        const body = (await response.json()) as { status?: string };
        const nextStatus = narrowAttachmentJobStatus(body.status);
        if (!cancelled) setStatus(nextStatus);
        if (nextStatus !== "completed" && nextStatus !== "failed") {
          scheduleNextPoll(2000);
        }
      } catch {
        handleTransientFailure();
      }
    }

    void poll();
    const cleanup = (): void => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    return cleanup;
  }, [jobId]);

  return status;
}

function narrowAttachmentJobStatus(
  status: string | undefined,
): AttachmentJobStatus {
  switch (status) {
    case "pending":
    case "processing":
    case "completed":
    case "failed":
      return status;
    default:
      return "unknown";
  }
}

export function attachmentStatusLabel(
  status: AttachmentJobStatus | null,
): string {
  switch (status) {
    case "pending":
      return "queued";
    case "processing":
      return "generating";
    case "completed":
      return "ready";
    case "failed":
      return "failed";
    case "unknown":
      return "status unknown";
    default:
      return "ready";
  }
}

export function getAttachmentCardState(
  jobStatus: AttachmentJobStatus | null,
): AttachmentCardState {
  return {
    status: jobStatus ?? "ready",
    label: attachmentStatusLabel(jobStatus),
    isPending: jobStatus === "pending" || jobStatus === "processing",
  };
}

export function AttachmentPart({
  data,
}: {
  data: unknown;
}): React.ReactElement {
  const display = formatAttachmentDisplay(data);
  const jobStatus = useAttachmentJobStatus(display?.jobId);
  if (!display) return <GenericDataPart type="data-attachment" data={data} />;
  const href = display.downloadUrl ?? display.url;
  const previewUrl = display.previewUrl ?? display.url;
  const isImage = display.mediaType?.startsWith("image/") ?? false;
  const cardState = getAttachmentCardState(jobStatus);
  const meta = [
    display.filename,
    display.mediaType,
    display.sizeLabel,
    jobStatus ? cardState.label : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className="web-chat-attachment-card"
      data-status={cardState.status}
      aria-label={display.title}
    >
      {isImage && previewUrl && !cardState.isPending ? (
        <img
          className="web-chat-attachment-preview"
          data-fit="contain"
          src={previewUrl}
          alt=""
          loading="lazy"
        />
      ) : null}
      <div className="web-chat-attachment-body">
        <span className="web-chat-attachment-kicker">{cardState.label}</span>
        <h4>{display.title}</h4>
        {display.description ? <p>{display.description}</p> : null}
        {meta ? <span className="web-chat-attachment-meta">{meta}</span> : null}
        {href ? (
          <div className="web-chat-attachment-actions">
            {display.url ? (
              <a
                aria-disabled={cardState.isPending}
                href={cardState.isPending ? undefined : display.url}
              >
                Open
              </a>
            ) : null}
            <a
              aria-disabled={cardState.isPending}
              href={cardState.isPending ? undefined : href}
              download={display.filename ?? undefined}
            >
              Download
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function NativeToolPart({
  data,
}: {
  data: unknown;
}): React.ReactElement {
  const toolName = getStringValue(data, "toolName") ?? "tool";
  const state = narrowToolState(getStringValue(data, "state"));
  const title = getStringValue(data, "title") ?? `tool · ${toolName}`;
  const output =
    getRecordValue(data, "output") ?? getRecordValue(data, "input");
  const errorText = getStringValue(data, "errorText");
  const display = formatNativeToolDisplay(data);

  return (
    <Tool data-kind="tool-result">
      <ToolHeader
        type="dynamic-tool"
        state={state}
        toolName={toolName}
        title={title}
      />
      <ToolContent>
        {display ? (
          <span
            className="web-chat-confirmation-result"
            data-variant={display.variant}
          >
            {display.label}
          </span>
        ) : (
          <ToolOutput output={output} errorText={errorText} />
        )}
      </ToolContent>
    </Tool>
  );
}

export function ConfirmationPart({
  data,
  addToolApprovalResponse,
}: {
  data: unknown;
  addToolApprovalResponse: (input: {
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
  const [decision, setDecision] = useState<"approved" | "declined" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function submitConfirmation(confirmed: boolean): Promise<void> {
    setIsSubmitting(true);
    setError(null);
    try {
      if (!approvalId) {
        throw new Error("Missing approval id");
      }
      await addToolApprovalResponse({ id: approvalId, approved: confirmed });
      setDecision(confirmed ? "approved" : "declined");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Confirmation failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const resolved = decision !== null;
  const display = decision
    ? formatConfirmationResult({ text: "" }, decision)
    : null;
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

const sourceCitationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  source: z.string().min(1),
  url: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
  provenance: z.record(z.unknown()).optional(),
});

const sourcesCardSchema = z.object({
  kind: z.literal("sources"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sources: z.array(sourceCitationSchema).min(1),
});

function getSourceLabel(source: z.infer<typeof sourceCitationSchema>): string {
  return source.title ?? source.entityId ?? source.id;
}

function getSourceMeta(source: z.infer<typeof sourceCitationSchema>): string {
  const parts = [source.entityType ?? source.source];
  if (source.entityId) parts.push(source.entityId);
  return parts.join(" · ");
}

function getSourceScore(
  source: z.infer<typeof sourceCitationSchema>,
): number | undefined {
  const parsed = z
    .object({ score: z.number().finite() })
    .passthrough()
    .safeParse(source.provenance);
  return parsed.success ? parsed.data.score : undefined;
}

export function SourcesPart({ data }: { data: unknown }): React.ReactElement {
  const parsed = sourcesCardSchema.safeParse(data);
  if (!parsed.success) {
    return <GenericDataPart type="data-sources" data={data} />;
  }

  const card = parsed.data;
  const sourceCount = card.sources.length;
  return (
    <details className="web-chat-sources-card" aria-label="Retrieved sources">
      <summary className="web-chat-sources-summary">
        <span className="web-chat-sources-kicker">sources</span>
        <span className="web-chat-sources-count">
          {`${sourceCount} retrieved`}
        </span>
        <span className="web-chat-data-part-chevron" aria-hidden="true" />
      </summary>
      <div className="web-chat-sources-body">
        <header className="web-chat-sources-header">
          <h4>{card.title ?? "Retrieved sources"}</h4>
        </header>
        <ol className="web-chat-sources-list">
          {card.sources.map((source) => {
            const label = getSourceLabel(source);
            const score = getSourceScore(source);
            const title = source.url ? (
              <a href={source.url}>{label}</a>
            ) : (
              <span>{label}</span>
            );
            return (
              <li className="web-chat-source-item" key={source.id}>
                <div className="web-chat-source-title">{title}</div>
                <div className="web-chat-source-meta">
                  <span>{getSourceMeta(source)}</span>
                  {score !== undefined ? (
                    <span>{`score ${score.toFixed(2)}`}</span>
                  ) : null}
                </div>
                {source.excerpt ? (
                  <p className="web-chat-source-excerpt">{source.excerpt}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
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
