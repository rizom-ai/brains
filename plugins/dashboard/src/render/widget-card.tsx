/** @jsxImportSource preact */
import { formatLabel } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { JSX } from "preact";
import type { RenderableWidgetData } from "./types";

const KV_SKIP_KEYS = new Set(["rendered", "version"]);
const PIPELINE_STATUSES = ["draft", "queued", "published", "failed"] as const;
const COMPACT_WIDGET_RENDERERS = new Set(["StatsWidget", "SystemWidget"]);

const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  meta: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  count: z.number().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
});

const listWidgetDataSchema = z.object({
  items: z.array(listItemSchema),
});
const kvWidgetDataSchema = z.record(z.string(), z.unknown());

const pipelineStatusSchema = z.enum(PIPELINE_STATUSES);
const pipelineSummarySchema = z.object({
  draft: z.number().optional(),
  queued: z.number().optional(),
  published: z.number().optional(),
  failed: z.number().optional(),
});
const pipelineItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  status: pipelineStatusSchema,
  scheduledFor: z.string().optional(),
  retryInfo: z.string().optional(),
});
const pipelineGeneratingItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  target: z.string(),
  status: z.enum(["pending", "processing"]),
});
const pipelineWidgetDataSchema = z.object({
  summary: pipelineSummarySchema,
  items: z.array(pipelineItemSchema),
  generating: z.array(pipelineGeneratingItemSchema).default([]),
});

type ListItem = z.output<typeof listItemSchema>;
type PipelineItem = z.output<typeof pipelineItemSchema>;
type PipelineGeneratingItem = z.output<typeof pipelineGeneratingItemSchema>;

interface RendererProps {
  widget: RenderableWidgetData;
}

const PRIO_CLASS: Record<string, string> = {
  crit: "pill--err",
  critical: "pill--err",
  high: "pill--warn",
  med: "",
  medium: "",
  low: "pill--mute",
};

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function toDisplayValue(value: unknown): string {
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function comparePipelineItems(a: PipelineItem, b: PipelineItem): number {
  const aMeta = a.retryInfo ?? a.scheduledFor ?? "";
  const bMeta = b.retryInfo ?? b.scheduledFor ?? "";
  const metaDiff = aMeta.localeCompare(bMeta);
  if (metaDiff !== 0) return metaDiff;

  return a.title.localeCompare(b.title);
}

function parsedListData(data: unknown): ListItem[] {
  const parsed = listWidgetDataSchema.safeParse(data);
  if (!parsed.success || parsed.data.items.length === 0) {
    return [];
  }
  return parsed.data.items;
}

function parsedKvData(data: unknown): Record<string, unknown> | null {
  const parsed = kvWidgetDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function CountChip({ widget }: RendererProps): JSX.Element | null {
  if (widget.widget.rendererName !== "ListWidget") {
    return null;
  }

  const items = parsedListData(widget.data);
  if (items.length === 0) {
    return null;
  }

  return <span class="chip">{items.length}</span>;
}

function KeyValueBody({ widget }: RendererProps): JSX.Element {
  const data = parsedKvData(widget.data);
  if (!data) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  const entries = Object.entries(data).filter(
    ([key, value]) => !KV_SKIP_KEYS.has(key) && !isEmptyValue(value),
  );

  if (entries.length === 0) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  return (
    <dl class="kv">
      {entries.map(([key, value]) => (
        <div key={key} class="kv-row">
          <dt>{formatLabel(key)}</dt>
          <dd>{toDisplayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListRow({ item }: { item: ListItem }): JSX.Element {
  const priorityClass = item.priority
    ? (PRIO_CLASS[item.priority.toLowerCase()] ?? "")
    : "";

  return (
    <li class="list-item">
      <div class="list-main">
        <span class="list-name">{item.name}</span>
        {item.description && <span class="list-desc">{item.description}</span>}
        {item.meta && item.meta.length > 0 && (
          <span class="list-meta-text">
            {item.meta.map((segment, index) => (
              <span key={`${item.id}-meta-${index}`}>
                {index > 0 && <span class="sep">·</span>}
                {segment}
              </span>
            ))}
          </span>
        )}
        {item.tags && item.tags.length > 0 && (
          <div class="list-tags">
            {item.tags.map((tag) => (
              <span key={tag} class="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div class="list-meta">
        {typeof item.count === "number" && (
          <span class="list-count">{item.count}</span>
        )}
        {item.priority && (
          <span class={`pill ${priorityClass}`.trim()}>{item.priority}</span>
        )}
        {item.status && <span class="pill pill--ok">{item.status}</span>}
      </div>
    </li>
  );
}

function ListBody({ widget }: RendererProps): JSX.Element {
  const items = parsedListData(widget.data);
  if (items.length === 0) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  return (
    <ul class="list">
      {items.map((item) => (
        <ListRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function BoardWorkCard({ item }: { item: PipelineItem }): JSX.Element {
  return (
    <div class={`work${item.status === "failed" ? " work--failed" : ""}`}>
      <div class="work-title">{item.title}</div>
      <div class="work-meta">
        <span>{item.type}</span>
        <span class={item.status === "failed" ? "work-status--err" : ""}>
          {item.retryInfo ?? item.scheduledFor ?? item.status}
        </span>
      </div>
    </div>
  );
}

function BoardLane({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: JSX.Element[] | JSX.Element;
}): JSX.Element {
  return (
    <div class="lane">
      <div class="lane-head">
        {label} <span class="lane-count">{count}</span>
      </div>
      {count === 0 ? <p class="lane-empty">—</p> : children}
    </div>
  );
}

function PipelineBody({ widget }: RendererProps): JSX.Element {
  const parsed = pipelineWidgetDataSchema.safeParse(widget.data);
  if (!parsed.success) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  const items = [...parsed.data.items].sort(comparePipelineItems);
  const queued = items.filter((item) => item.status === "queued");
  // Review holds everything waiting for human attention: drafts and failures.
  const review = [
    ...items.filter((item) => item.status === "draft"),
    ...items.filter((item) => item.status === "failed"),
  ];
  const generating: PipelineGeneratingItem[] = parsed.data.generating;

  return (
    <div class="board">
      <BoardLane label="Queued" count={queued.length}>
        {queued.map((item) => (
          <BoardWorkCard key={item.id} item={item} />
        ))}
      </BoardLane>
      <BoardLane label="Generating" count={generating.length}>
        {generating.map((job) => (
          <div key={job.id} class="work work--generating">
            <div class="work-title">{job.label}</div>
            <div class="work-meta">
              <span>{job.target}</span>
              <span class="work-status--warm">{job.status}</span>
            </div>
            <div class="minibar" aria-hidden="true">
              <i></i>
            </div>
          </div>
        ))}
      </BoardLane>
      <BoardLane label="Review" count={review.length}>
        {review.map((item) => (
          <BoardWorkCard key={item.id} item={item} />
        ))}
      </BoardLane>
    </div>
  );
}

function WidgetBody({ widget }: RendererProps): JSX.Element {
  if (widget.component) {
    const Component = widget.component;
    return (
      <Component
        title={widget.widget.title}
        {...(widget.widget.description
          ? { description: widget.widget.description }
          : {})}
        data={widget.data}
      />
    );
  }

  switch (widget.widget.rendererName) {
    case "PipelineWidget":
      return <PipelineBody widget={widget} />;
    case "ListWidget":
      return <ListBody widget={widget} />;
    default:
      return <KeyValueBody widget={widget} />;
  }
}

export function WidgetCard({
  widget,
  featured = false,
}: {
  widget: RenderableWidgetData;
  featured?: boolean;
}): JSX.Element {
  const isCompact = COMPACT_WIDGET_RENDERERS.has(widget.widget.rendererName);
  const className = featured
    ? "card card--entity-summary"
    : `card${isCompact ? "" : " widget-card--wide"}`;

  return (
    <article class={className}>
      <div class="card-head">
        <span class="card-title">{widget.widget.title}</span>
        <CountChip widget={widget} />
      </div>
      <WidgetBody widget={widget} />
    </article>
  );
}
