// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

const listItemSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  name: z.string().optional(),
  count: z.number().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
});

const listDataSchema = z.object({
  jobs: z.array(listItemSchema).optional(),
  batches: z.array(listItemSchema).optional(),
  items: z.array(listItemSchema).optional(),
});

type ListItem = z.infer<typeof listItemSchema>;

export type ListWidgetProps = BaseWidgetProps;

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-status-danger-bg text-status-danger-text",
  high: "bg-status-warning-bg text-status-warning-text",
  medium: "bg-status-info-bg text-status-info-text",
  low: "bg-status-neutral-bg text-status-neutral-text",
};

function PriorityBadge({ priority }: { priority: string }): VNode {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES["medium"];
  const label =
    priority === "medium" ? "med" : priority === "critical" ? "crit" : priority;
  return (
    <span
      className={`text-[0.6rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${style}`}
    >
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }): VNode {
  const isNew = status === "new";
  const style = isNew
    ? "bg-status-success-bg text-status-success-text"
    : "bg-status-neutral-bg text-status-neutral-text";
  return (
    <span
      className={`text-[0.6rem] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${style}`}
    >
      {status}
    </span>
  );
}

function ListItemRow({ item }: { item: ListItem }): VNode {
  const hasRichData = item.count != null || item.priority || item.status;

  if (hasRichData) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 bg-theme rounded-md border border-theme text-sm">
        {item.count != null && (
          <span className="font-mono text-[0.7rem] font-semibold text-brand min-w-[2rem] text-center">
            &times;{item.count}
          </span>
        )}
        <span className="flex-1 font-medium text-theme">
          {item.name ?? item.type ?? item.id}
        </span>
        {item.priority && <PriorityBadge priority={item.priority} />}
        {item.status && <StatusChip status={item.status} />}
      </div>
    );
  }

  // Simple fallback for basic items
  return (
    <div className="flex justify-between items-center px-3 py-2 bg-theme rounded-md border border-theme text-sm">
      <span className="text-theme">{item.name ?? item.type ?? item.id}</span>
      {item.name && item.type && (
        <span className="text-theme-muted text-xs">{item.type}</span>
      )}
    </div>
  );
}

export function ListWidget({ title, data }: ListWidgetProps): VNode {
  const parsed = listDataSchema.safeParse(data);

  const jobs = parsed.success ? (parsed.data.jobs ?? []) : [];
  const batches = parsed.success ? (parsed.data.batches ?? []) : [];
  const items = parsed.success ? (parsed.data.items ?? []) : [];
  const allItems: ListItem[] = [...jobs, ...batches, ...items];

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-theme-muted">
          {title}
        </span>
        {allItems.length > 0 && (
          <span className="font-mono text-[0.625rem] px-2 py-0.5 rounded-full bg-status-neutral-bg text-status-neutral-text font-medium">
            {allItems.length} items
          </span>
        )}
      </div>
      {allItems.length === 0 ? (
        <p className="text-theme-muted text-sm italic text-center py-4">
          No active items
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {allItems.map((item) => (
            <ListItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
