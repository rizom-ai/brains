// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import { useState } from "preact/hooks";
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

const STATUS_DOT_COLORS: Record<string, string> = {
  draft: "var(--color-text-muted)",
  queued: "#f59e0b",
  published: "#10b981",
  failed: "#ef4444",
};

function StatusDot({ status }: { status: string }): VNode {
  const color = STATUS_DOT_COLORS[status] ?? "var(--color-text-muted)";
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function PipelineItemRow({ item }: { item: PipelineItem }): VNode {
  const timeText = item.retryInfo ?? item.scheduledFor;
  const isFailure = item.status === "failed";

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 bg-theme rounded-md border border-theme text-sm">
      <StatusDot status={item.status} />
      <span className="flex-1 min-w-0 font-medium text-theme truncate">
        {item.title}
      </span>
      <span className="font-mono text-[0.65rem] text-theme-muted">
        {item.type}
      </span>
      {timeText && (
        <span
          className={`font-mono text-[0.6rem] ${isFailure ? "text-status-danger" : "text-theme-muted"}`}
        >
          {timeText}
        </span>
      )}
    </div>
  );
}

const STATUSES = ["draft", "queued", "published", "failed"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  draft: "drafts",
  queued: "queued",
  published: "published",
  failed: "failed",
};

function StatusTab({
  status,
  count,
  active,
  onClick,
}: {
  status: Status;
  count: number;
  active: boolean;
  onClick: () => void;
}): VNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-md transition-colors ${
        active
          ? "bg-theme text-theme font-semibold"
          : "text-theme-muted hover:text-theme"
      }`}
    >
      <StatusDot status={status} />
      <strong className="tabular-nums">{count}</strong> {STATUS_LABELS[status]}
    </button>
  );
}

export function PipelineWidget({ title, data }: PipelineWidgetProps): VNode {
  const parsed = pipelineDataSchema.safeParse(data);
  const [activeStatus, setActiveStatus] = useState<Status>("draft");

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
  const filtered = items.filter((item) => item.status === activeStatus);

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          {title}
        </span>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 mb-3 pb-2.5 border-b border-theme">
        {STATUSES.map((status) => (
          <StatusTab
            key={status}
            status={status}
            count={summary[status]}
            active={activeStatus === status}
            onClick={() => setActiveStatus(status)}
          />
        ))}
      </div>

      {/* Filtered item list */}
      {filtered.length === 0 ? (
        <p className="text-center py-4 text-theme-muted text-sm italic">
          No {STATUS_LABELS[activeStatus]} items
        </p>
      ) : (
        <div className="max-h-[300px] overflow-y-auto flex flex-col gap-1">
          {filtered.map((item) => (
            <PipelineItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
