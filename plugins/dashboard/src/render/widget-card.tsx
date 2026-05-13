/** @jsxImportSource preact */
import { formatLabel, z } from "@brains/utils";
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
const pipelineWidgetDataSchema = z.object({
  summary: pipelineSummarySchema,
  items: z.array(pipelineItemSchema),
});

type ListItem = z.infer<typeof listItemSchema>;
type PipelineStatus = z.infer<typeof pipelineStatusSchema>;
type PipelineItem = z.infer<typeof pipelineItemSchema>;

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

const PIPELINE_DEFAULT_STATUS_ORDER: PipelineStatus[] = [
  "failed",
  "queued",
  "draft",
  "published",
];

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

function pipelineStatusLabel(status: PipelineStatus): string {
  switch (status) {
    case "draft":
      return "drafts";
    case "queued":
      return "queued";
    case "published":
      return "published";
    case "failed":
      return "failed";
  }
}

function pipelineStatusPriority(status: PipelineStatus): number {
  switch (status) {
    case "failed":
      return 0;
    case "queued":
      return 1;
    case "draft":
      return 2;
    case "published":
      return 3;
  }
}

function pipelineDefaultStatus(
  summary: Record<PipelineStatus, number>,
): PipelineStatus {
  return (
    PIPELINE_DEFAULT_STATUS_ORDER.find((status) => summary[status] > 0) ??
    "draft"
  );
}

function comparePipelineItems(a: PipelineItem, b: PipelineItem): number {
  const priorityDiff =
    pipelineStatusPriority(a.status) - pipelineStatusPriority(b.status);
  if (priorityDiff !== 0) return priorityDiff;

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
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, unknown>;
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

function PipelineBody({ widget }: RendererProps): JSX.Element {
  const parsed = pipelineWidgetDataSchema.safeParse(widget.data);
  if (!parsed.success) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  const summary: Record<PipelineStatus, number> = {
    draft: parsed.data.summary.draft ?? 0,
    queued: parsed.data.summary.queued ?? 0,
    published: parsed.data.summary.published ?? 0,
    failed: parsed.data.summary.failed ?? 0,
  };
  const items = [...parsed.data.items].sort(comparePipelineItems);
  const activeStatus = pipelineDefaultStatus(summary);

  return (
    <div
      class="pipeline-widget"
      data-pipeline-widget
      data-pipeline-default={activeStatus}
    >
      <div class="pipeline-tabs">
        {PIPELINE_STATUSES.map((status) => {
          const isActive = status === activeStatus;
          return (
            <button
              key={status}
              class={`pipeline-tab${isActive ? " is-active" : ""}`}
              type="button"
              data-pipeline-tab={status}
              aria-pressed={isActive ? "true" : "false"}
            >
              <span class={`pipeline-dot pipeline-dot--${status}`}></span>
              <span class="pipeline-summary-count">{summary[status]}</span>
              <span class="pipeline-summary-label">
                {pipelineStatusLabel(status)}
              </span>
            </button>
          );
        })}
      </div>
      {PIPELINE_STATUSES.map((status) => {
        const statusItems = items.filter((item) => item.status === status);
        const panelClass =
          status === activeStatus
            ? "pipeline-panel is-active"
            : "pipeline-panel";

        return (
          <div key={status} class={panelClass} data-pipeline-panel={status}>
            {statusItems.length === 0 ? (
              <p class="pipeline-empty">
                No {pipelineStatusLabel(status)} items
              </p>
            ) : (
              <div class="pipeline-list">
                {statusItems.map((item) => {
                  const meta =
                    item.retryInfo ?? item.scheduledFor ?? item.status;
                  return (
                    <div key={item.id} class="pipeline-item">
                      <span
                        class={`pipeline-dot pipeline-dot--${item.status}`}
                      ></span>
                      <span class="pipeline-name">{item.title}</span>
                      <span class="pipeline-type">{item.type}</span>
                      <span
                        class={`pipeline-when${item.status === "failed" ? " pipeline-when--err" : ""}`}
                      >
                        {meta}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
