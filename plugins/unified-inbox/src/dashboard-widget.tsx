/** @jsxImportSource preact */
import {
  WidgetEmptyState,
  WidgetStatusPill,
  type WidgetComponentProps,
} from "@brains/dashboard";
import type { ServicePluginContext } from "@brains/plugins";
import type { JSX } from "preact";
import type { InboxDataSource } from "./inbox-datasource";
import { INBOX_ACTION_PATH } from "./action-route";
import {
  inboxProjectionSchema,
  type InboxProjection,
  type InboxProjectionEntry,
  type InboxSourceError,
} from "./schemas";
import { unifiedInboxWidgetScript } from "./dashboard-widget-script";
import unifiedInboxWidgetStyles from "./dashboard-widget.css" with { type: "text" };

const WIDGET_ITEM_LIMIT = 24;

interface InboxDashboardContext {
  dashboard: Pick<ServicePluginContext["dashboard"], "registerWidget">;
}

interface InboxGroup {
  sourceId: string;
  displayName: string;
  entries: InboxProjectionEntry[];
}

function displayTimestamp(receivedAt: string): string {
  return `${receivedAt.slice(0, 10)} ${receivedAt.slice(11, 16)} UTC`;
}

function groupEntries(entries: InboxProjectionEntry[]): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();
  for (const entry of entries) {
    const sourceId = entry.source.sourceId;
    const group = groups.get(sourceId) ?? {
      sourceId,
      displayName: entry.source.displayName,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(sourceId, group);
  }
  return [...groups.values()];
}

function InboxEntry({ entry }: { entry: InboxProjectionEntry }): JSX.Element {
  const { item, source } = entry;
  return (
    <li
      class={`unified-inbox-item${item.urgency === "high" ? " is-high" : ""}`}
      data-inbox-item
    >
      <div class="unified-inbox-item-head">
        <WidgetStatusPill tone={item.urgency === "high" ? "warn" : "muted"}>
          {item.urgency === "high" ? "high priority" : "normal"}
        </WidgetStatusPill>
        <time dateTime={item.receivedAt}>
          {displayTimestamp(item.receivedAt)}
        </time>
      </div>
      <h4>{item.title}</h4>
      {item.summary && <p>{item.summary}</p>}
      {item.actions.length > 0 && (
        <div
          class="unified-inbox-actions"
          aria-label={`Actions for ${item.title}`}
        >
          {item.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-inbox-action
              data-inbox-source-id={source.sourceId}
              data-inbox-item-id={item.id}
              data-inbox-action-id={action.id}
              data-inbox-action-label={action.label}
              data-inbox-item-title={item.title}
              {...(action.confirm ? { "data-inbox-confirm": "true" } : {})}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function InboxSourceGroup({ group }: { group: InboxGroup }): JSX.Element {
  return (
    <section
      class="unified-inbox-source"
      aria-labelledby={`inbox-source-${group.sourceId}`}
    >
      <header>
        <span class="unified-inbox-source-mark" aria-hidden="true" />
        <h3 id={`inbox-source-${group.sourceId}`}>{group.displayName}</h3>
        <span class="unified-inbox-source-count">{group.entries.length}</span>
      </header>
      <ul>
        {group.entries.map((entry) => (
          <InboxEntry
            key={`${entry.source.sourceId}:${entry.item.id}`}
            entry={entry}
          />
        ))}
      </ul>
    </section>
  );
}

function SourceErrors({ errors }: { errors: InboxSourceError[] }): JSX.Element {
  return (
    <aside class="unified-inbox-errors" aria-label="Unavailable inbox sources">
      {errors.map((error) => (
        <span key={error.source.sourceId}>
          {error.source.displayName} unavailable
        </span>
      ))}
    </aside>
  );
}

export function UnifiedInboxDashboardWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = inboxProjectionSchema.safeParse(data);
  if (!parsed.success) {
    return <WidgetEmptyState>Inbox unavailable.</WidgetEmptyState>;
  }

  const projection = parsed.data;
  const visibleEntries = projection.entries.slice(0, WIDGET_ITEM_LIMIT);
  const highCount = projection.entries.filter(
    (entry) => entry.item.urgency === "high",
  ).length;
  const hiddenCount = projection.entries.length - visibleEntries.length;

  return (
    <div
      class="unified-inbox-widget"
      data-unified-inbox-widget
      data-inbox-action-url={INBOX_ACTION_PATH}
    >
      <div class="unified-inbox-summary" aria-label="Inbox summary">
        <span>
          <strong>{projection.entries.length}</strong> open
        </span>
        <span class={highCount > 0 ? "is-high" : undefined}>
          <strong>{highCount}</strong> high priority
        </span>
      </div>
      <p class="unified-inbox-status" data-inbox-status aria-live="polite" />
      {visibleEntries.length === 0 ? (
        <WidgetEmptyState className="unified-inbox-empty">
          Inbox clear — no source needs attention.
        </WidgetEmptyState>
      ) : (
        <div class="unified-inbox-groups">
          {groupEntries(visibleEntries).map((group) => (
            <InboxSourceGroup key={group.sourceId} group={group} />
          ))}
        </div>
      )}
      {hiddenCount > 0 && (
        <p class="unified-inbox-overflow">
          {hiddenCount} more {hiddenCount === 1 ? "item" : "items"} available
          through <code>inbox_list</code>.
        </p>
      )}
      {projection.errors.length > 0 && (
        <SourceErrors errors={projection.errors} />
      )}
    </div>
  );
}

export async function registerUnifiedInboxDashboardWidget(
  context: InboxDashboardContext,
  dataSource: Pick<InboxDataSource, "getInboxData">,
): Promise<void> {
  await context.dashboard.registerWidget({
    id: "inbox",
    title: "Inbox",
    description: "Live attention across source-owned workflows",
    group: "communication",
    section: "primary",
    priority: 10,
    rendererName: "CustomWidget",
    visibility: "admin",
    component: UnifiedInboxDashboardWidget,
    clientStyles: unifiedInboxWidgetStyles,
    clientScript: unifiedInboxWidgetScript,
    dataProvider: async (): Promise<InboxProjection> =>
      inboxProjectionSchema.parse(await dataSource.getInboxData()),
    digestProvider: (data) => {
      const current = inboxProjectionSchema.parse(data);
      const high = current.entries.filter(
        (entry) => entry.item.urgency === "high",
      ).length;
      const sources = new Set(
        current.entries.map((entry) => entry.source.sourceId),
      ).size;
      return {
        digest: [
          {
            label: "Open",
            value: String(current.entries.length),
            ...(current.entries.length > 0 ? { tone: "warn" as const } : {}),
          },
          {
            label: "High priority",
            value: String(high),
            ...(high > 0 ? { tone: "warn" as const } : {}),
          },
          { label: "Sources", value: String(sources) },
        ],
        needsAttention: high,
      };
    },
  });
}
