/** @jsxImportSource preact */
import { formatLabel } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { JSX } from "preact";
import type { RenderableWidgetData } from "./types";

const KV_SKIP_KEYS = new Set(["rendered", "version"]);
const COMPACT_WIDGET_RENDERERS = new Set([
  "StatsWidget",
  "SystemWidget",
  "PipelineWidget",
]);

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

const pipelineWidgetDataSchema = z.object({
  summary: z.object({
    draft: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    generating: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    needsOperator: z.number().int().nonnegative(),
  }),
  failures: z
    .array(
      z.object({
        entityId: z.string(),
        entityType: z.string(),
        title: z.string(),
        error: z.string(),
        retryCount: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  managementUrl: z.string().optional(),
});

type ListItem = z.output<typeof listItemSchema>;

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

function PipelineMetric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}): JSX.Element {
  return (
    <div class={`pipeline-metric${tone ? ` pipeline-metric--${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PipelineBody({ widget }: RendererProps): JSX.Element {
  const parsed = pipelineWidgetDataSchema.safeParse(widget.data);
  if (!parsed.success) {
    return <p class="muted">Nothing to show yet.</p>;
  }

  const { summary, failures, managementUrl } = parsed.data;
  return (
    <div class="pipeline-digest">
      <dl class="pipeline-metrics">
        <PipelineMetric label="Queued" value={summary.queued} />
        <PipelineMetric label="Generating" value={summary.generating} />
        <PipelineMetric
          label="Awaiting review"
          value={summary.needsOperator}
          tone={summary.needsOperator > 0 ? "warn" : ""}
        />
        <PipelineMetric label="Published" value={summary.published} tone="ok" />
      </dl>
      {failures.length > 0 && (
        <section class="pipeline-failures" aria-label="Publication failures">
          <h4>Needs attention</h4>
          {failures.slice(0, 3).map((failure) => (
            <div
              class="pipeline-failure"
              key={`${failure.entityType}:${failure.entityId}`}
            >
              <strong>{failure.title}</strong>
              <span>{failure.error}</span>
            </div>
          ))}
        </section>
      )}
      {managementUrl && (
        <a class="pipeline-manage" href={managementUrl}>
          Manage in CMS →
        </a>
      )}
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
