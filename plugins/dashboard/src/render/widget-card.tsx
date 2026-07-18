/** @jsxImportSource preact */
import { formatLabel } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { JSX } from "preact";
import type { RenderableWidgetData } from "./types";
import {
  CardHeader,
  createWidgetInstanceId,
  EmptyState,
  KeyValueList,
  WidgetActionLink,
  WidgetActions,
  WidgetList,
  WidgetListItem,
  WidgetStatusPill,
} from "../widget-ui";

const KV_SKIP_KEYS = new Set(["rendered", "version"]);
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

const PRIO_TONE: Record<string, "plain" | "warn" | "error" | "muted"> = {
  crit: "error",
  critical: "error",
  high: "warn",
  med: "plain",
  medium: "plain",
  low: "muted",
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

  return <span class="tab-badge tab-badge--muted">{items.length}</span>;
}

function KeyValueBody({ widget }: RendererProps): JSX.Element {
  const data = parsedKvData(widget.data);
  if (!data) {
    return <EmptyState />;
  }

  const entries = Object.entries(data).filter(
    ([key, value]) => !KV_SKIP_KEYS.has(key) && !isEmptyValue(value),
  );

  if (entries.length === 0) {
    return <EmptyState />;
  }

  return (
    <KeyValueList
      items={entries.map(([key, value]) => ({
        label: formatLabel(key),
        value: toDisplayValue(value),
      }))}
    />
  );
}

function ListRow({ item }: { item: ListItem }): JSX.Element {
  const priorityTone = item.priority
    ? (PRIO_TONE[item.priority.toLowerCase()] ?? "plain")
    : "plain";
  const hasTrailing =
    typeof item.count === "number" || Boolean(item.priority ?? item.status);

  return (
    <WidgetListItem
      title={item.name}
      description={item.description}
      meta={item.meta}
      tags={item.tags}
      trailing={
        hasTrailing ? (
          <>
            {typeof item.count === "number" && (
              <span class="list-count">{item.count}</span>
            )}
            {item.priority && (
              <WidgetStatusPill tone={priorityTone}>
                {item.priority}
              </WidgetStatusPill>
            )}
            {item.status && (
              <WidgetStatusPill tone="ok">{item.status}</WidgetStatusPill>
            )}
          </>
        ) : undefined
      }
    />
  );
}

function ListBody({ widget }: RendererProps): JSX.Element {
  const items = parsedListData(widget.data);
  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <WidgetList>
      {items.map((item) => (
        <ListRow key={item.id} item={item} />
      ))}
    </WidgetList>
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
    return <EmptyState />;
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
        <WidgetActions label="Publication actions">
          <WidgetActionLink href={managementUrl} emphasis="primary">
            Open in CMS
          </WidgetActionLink>
        </WidgetActions>
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
        pluginId={widget.widget.pluginId}
        widgetId={widget.widget.id}
        instanceId={createWidgetInstanceId(
          widget.widget.pluginId,
          widget.widget.id,
        )}
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
      <CardHeader title={widget.widget.title}>
        <CountChip widget={widget} />
      </CardHeader>
      <WidgetBody widget={widget} />
    </article>
  );
}
