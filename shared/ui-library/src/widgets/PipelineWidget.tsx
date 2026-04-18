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

const STATUSES = ["draft", "queued", "published", "failed"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_META: Record<
  Status,
  {
    label: string;
    dotColor: string;
    badgeClass: string;
  }
> = {
  draft: {
    label: "drafts",
    dotColor: "var(--color-text-muted)",
    badgeClass: "bg-status-neutral text-status-neutral",
  },
  queued: {
    label: "queued",
    dotColor: "#f59e0b",
    badgeClass: "bg-status-warning text-status-warning",
  },
  published: {
    label: "published",
    dotColor: "#10b981",
    badgeClass: "bg-status-success text-status-success",
  },
  failed: {
    label: "failed",
    dotColor: "#ef4444",
    badgeClass: "bg-status-danger text-status-danger",
  },
};

function getDefaultStatus(summary: Record<Status, number>): Status {
  return STATUSES.find((status) => summary[status] > 0) ?? "draft";
}

function StatusDot({
  status,
  size = 7,
}: {
  status: Status;
  size?: number;
}): VNode {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        backgroundColor: STATUS_META[status].dotColor,
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
}

function PipelineItemRow({ item }: { item: PipelineItem }): VNode {
  const timeText = item.retryInfo ?? item.scheduledFor;
  const isFailure = item.status === "failed";

  return (
    <div className="rounded-md border border-theme bg-theme px-3 py-2 text-sm transition-colors hover:bg-theme-subtle">
      <div className="flex items-center gap-2.5">
        <StatusDot status={item.status} />
        <span className="min-w-0 flex-1 truncate font-medium text-theme">
          {item.title}
        </span>
        <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-theme-muted opacity-75">
          {item.type}
        </span>
        {timeText && (
          <span
            className={`shrink-0 font-mono text-[0.6rem] uppercase tracking-[0.08em] ${
              isFailure ? "text-status-danger" : "text-theme-muted"
            }`}
          >
            {timeText}
          </span>
        )}
      </div>
    </div>
  );
}

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
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-theme text-theme border-theme"
          : "text-theme-muted border-theme hover:bg-theme hover:text-theme"
      }`}
    >
      <StatusDot status={status} size={6} />
      <span className="tabular-nums">{count}</span>
      <span>{STATUS_META[status].label}</span>
    </button>
  );
}

export function PipelineWidget({ title, data }: PipelineWidgetProps): VNode {
  const parsed = pipelineDataSchema.safeParse(data);
  const defaultStatus = parsed.success
    ? getDefaultStatus(parsed.data.summary)
    : "draft";
  const [activeStatus, setActiveStatus] = useState<Status>(defaultStatus);

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
  const totalItems = STATUSES.reduce((sum, status) => sum + summary[status], 0);

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          {title}
        </span>
        <span className="font-mono text-[0.625rem] px-2 py-0.5 rounded-full bg-theme text-theme-muted border border-theme font-medium">
          {totalItems} total
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
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

      <div className="mb-3 text-xs text-theme-muted">
        Showing {STATUS_META[activeStatus].label} · {filtered.length}{" "}
        {filtered.length === 1 ? "item" : "items"}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-4 text-theme-muted text-sm italic">
          No {STATUS_META[activeStatus].label} items
        </p>
      ) : (
        <div className="max-h-[300px] overflow-y-auto flex flex-col gap-1.5">
          {filtered.map((item) => (
            <PipelineItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
