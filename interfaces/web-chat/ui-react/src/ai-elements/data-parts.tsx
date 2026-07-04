/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { ActionsCardSchema, type EventChatAction } from "@brains/contracts";
import { z } from "@brains/utils";
import {
  artifactStatusLabel as attachmentStatusLabel,
  formatArtifactDisplay as formatAttachmentDisplay,
  getArtifactCardState as getAttachmentCardState,
  narrowArtifactJobStatus as narrowAttachmentJobStatus,
  type ArtifactCardState as AttachmentCardState,
  type ArtifactDisplay as AttachmentDisplay,
  type ArtifactJobStatus as AttachmentJobStatus,
} from "@brains/plugins/message-interface/artifact-display";
import {
  formatConfirmationResult as formatSharedConfirmationResult,
  type ConfirmationResultDisplay,
} from "@brains/plugins/message-interface/confirmation-result";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
  type ToolPart,
} from "./tool";

export {
  attachmentStatusLabel,
  formatAttachmentDisplay,
  formatSharedConfirmationResult as formatConfirmationResult,
  getAttachmentCardState,
};
export type {
  AttachmentCardState,
  AttachmentDisplay,
  AttachmentJobStatus,
  ConfirmationResultDisplay,
};

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

  return formatSharedConfirmationResult(
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
    ? formatSharedConfirmationResult({ text: "" }, decision)
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

const actionsCardSchema = ActionsCardSchema;

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

export function ActionsPart({
  data,
  onPromptAction,
  onEventAction,
}: {
  data: unknown;
  onPromptAction: (prompt: string) => void;
  onEventAction: (action: EventChatAction) => void;
}): React.ReactElement {
  const parsed = actionsCardSchema.safeParse(data);
  if (!parsed.success) {
    return <GenericDataPart type="data-actions" data={data} />;
  }

  const card = parsed.data;
  return (
    <details
      className="web-chat-actions-card"
      aria-label="Suggested actions"
      open={card.defaultOpen}
    >
      <summary className="web-chat-actions-summary">
        <span className="web-chat-actions-kicker">actions</span>
        <span className="web-chat-actions-count">
          {`${card.actions.length} available`}
        </span>
        <span className="web-chat-data-part-chevron" aria-hidden="true" />
      </summary>
      <div className="web-chat-actions-body">
        {card.title ? <h4>{card.title}</h4> : null}
        <div className="web-chat-actions-list">
          {card.actions.map((action) => (
            <div className="web-chat-action-item" key={action.id}>
              <button
                type="button"
                aria-disabled={false}
                onClick={() => {
                  if (action.type === "prompt") onPromptAction(action.prompt);
                  else onEventAction(action);
                }}
              >
                {action.label}
              </button>
              {action.description ? <p>{action.description}</p> : null}
            </div>
          ))}
        </div>
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
