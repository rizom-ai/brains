// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

const pipelineItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.enum(["draft", "queued", "published", "failed"]),
  scheduledFor: z.string().optional(),
  retryInfo: z.string().optional(),
});

const pipelineDataSchema = z.object({
  summary: z.object({
    draft: z.number(),
    queued: z.number(),
    published: z.number(),
    failed: z.number(),
  }),
  items: z.array(pipelineItemSchema),
});

type PipelineItem = z.infer<typeof pipelineItemSchema>;

export type PipelineWidgetProps = BaseWidgetProps;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-theme-muted",
  queued: "bg-status-warning-text",
  published: "bg-status-success-text",
  failed: "bg-status-danger-text",
};

function StatusDot({ status }: { status: string }): VNode {
  const color = STATUS_COLORS[status] ?? "bg-theme-muted";
  return (
    <span
      className={`inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 ${color}`}
    />
  );
}

function PipelineItemRow({ item }: { item: PipelineItem }): VNode {
  const timeText = item.retryInfo ?? item.scheduledFor;
  const isFailure = item.status === "failed";

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 bg-theme rounded-md border border-theme text-sm">
      <StatusDot status={item.status} />
      <span className="flex-1 font-medium text-theme truncate">
        {item.title}
      </span>
      <span className="font-mono text-[0.65rem] text-theme-muted">
        {item.type}
      </span>
      {timeText && (
        <span
          className={`font-mono text-[0.6rem] ${isFailure ? "text-status-danger-text" : "text-theme-muted"}`}
        >
          {timeText}
        </span>
      )}
    </div>
  );
}

export function PipelineWidget({ title, data }: PipelineWidgetProps): VNode {
  const parsed = pipelineDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
            {title}
          </span>
        </div>
        <p className="text-sm text-theme-muted">No pipeline data</p>
      </div>
    );
  }

  const { summary, items } = parsed.data;
  const totalQueued = summary.queued;

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          {title}
        </span>
        {totalQueued > 0 && (
          <span className="font-mono text-[0.625rem] px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning-text font-medium">
            {totalQueued} queued
          </span>
        )}
      </div>

      {/* Summary counts */}
      <div className="flex gap-4 mb-3 pb-2.5 border-b border-theme">
        <div className="flex items-center gap-1.5 text-xs text-theme-muted">
          <StatusDot status="draft" />
          <strong className="text-theme tabular-nums">
            {summary.draft}
          </strong>{" "}
          drafts
        </div>
        <div className="flex items-center gap-1.5 text-xs text-theme-muted">
          <StatusDot status="queued" />
          <strong className="text-theme tabular-nums">
            {summary.queued}
          </strong>{" "}
          queued
        </div>
        <div className="flex items-center gap-1.5 text-xs text-theme-muted">
          <StatusDot status="published" />
          <strong className="text-theme tabular-nums">
            {summary.published}
          </strong>{" "}
          published
        </div>
        <div className="flex items-center gap-1.5 text-xs text-theme-muted">
          <StatusDot status="failed" />
          <strong className="text-theme tabular-nums">
            {summary.failed}
          </strong>{" "}
          failed
        </div>
      </div>

      {/* Item list */}
      {items.length === 0 ? (
        <p className="text-center py-4 text-theme-muted text-sm italic">
          No items in pipeline
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <PipelineItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
