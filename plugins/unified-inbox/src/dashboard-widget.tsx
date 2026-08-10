/** @jsxImportSource preact */
import type { ServicePluginContext } from "@brains/plugins";
import {
  KeyValueList,
  WidgetActionLink,
  WidgetActions,
  WidgetEmptyState,
  WidgetList,
  WidgetListItem,
  WidgetStatusPill,
  formatDate,
} from "@brains/ui-library";
import { pluralize } from "@brains/utils/string-utils";
import type { JSX } from "preact";
import type { InboxOperatorService } from "./operator-service";
import { inboxDashboardDataSchema, type InboxDashboardData } from "./schemas";
import unifiedInboxWidgetStyles from "./dashboard-widget.css" with { type: "text" };

interface InboxDashboardContext {
  dashboard: Pick<ServicePluginContext["dashboard"], "registerWidget">;
}

interface InboxDashboardWidgetProps {
  data: unknown;
}

export function UnifiedInboxDashboardWidget({
  data,
}: InboxDashboardWidgetProps): JSX.Element {
  const parsed = inboxDashboardDataSchema.safeParse(data);
  if (!parsed.success) {
    return <WidgetEmptyState>Inbox unavailable.</WidgetEmptyState>;
  }

  const { summary, entries, managementUrl } = parsed.data;
  return (
    <div class="unified-inbox-widget">
      <KeyValueList
        items={[
          { label: "Open", value: summary.open },
          { label: "High priority", value: summary.high },
          { label: "Sources online", value: summary.availableSources },
        ]}
      />

      {entries.length === 0 ? (
        <WidgetEmptyState className="unified-inbox-empty">
          Inbox clear — no source needs attention.
        </WidgetEmptyState>
      ) : (
        <WidgetList>
          {entries.map((entry, index) => (
            <WidgetListItem
              key={`${entry.sourceLabel}:${entry.receivedAt}:${index}`}
              title={entry.title}
              meta={[
                entry.sourceLabel,
                formatDate(entry.receivedAt, {
                  style: "medium",
                  includeTime: true,
                }),
              ]}
              trailing={
                <WidgetStatusPill
                  tone={entry.urgency === "high" ? "warn" : "muted"}
                >
                  {entry.urgency}
                </WidgetStatusPill>
              }
            />
          ))}
        </WidgetList>
      )}

      {summary.unavailableSources > 0 && (
        <p class="unified-inbox-unavailable">
          {summary.unavailableSources}{" "}
          {summary.unavailableSources === 1
            ? "source is"
            : `${pluralize("source")} are`}{" "}
          temporarily unavailable.
        </p>
      )}

      {managementUrl ? (
        <WidgetActions label="Inbox actions">
          <WidgetActionLink href={managementUrl} emphasis="primary">
            Open Inbox
          </WidgetActionLink>
        </WidgetActions>
      ) : (
        <p class="unified-inbox-browser-fallback">
          Browser triage is unavailable. Use <code>inbox_list</code> from chat.
        </p>
      )}
    </div>
  );
}

export async function registerUnifiedInboxDashboardWidget(
  context: InboxDashboardContext,
  operator: Pick<InboxOperatorService, "dashboard">,
  managementUrl?: string,
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
    dataProvider: async (): Promise<InboxDashboardData> =>
      operator.dashboard(managementUrl),
    // The registration contract types digest input as unknown, so the parse
    // here is the narrowing, not duplicate validation.
    digestProvider: (data) => {
      const current = inboxDashboardDataSchema.parse(data);
      return {
        digest: [
          {
            label: "Open",
            value: String(current.summary.open),
            ...(current.summary.open > 0 ? { tone: "warn" as const } : {}),
          },
          {
            label: "High priority",
            value: String(current.summary.high),
            ...(current.summary.high > 0 ? { tone: "warn" as const } : {}),
          },
          {
            label: "Sources online",
            value: `${current.summary.availableSources}/${
              current.summary.availableSources +
              current.summary.unavailableSources
            }`,
          },
        ],
        needsAttention: current.summary.high,
      };
    },
  });
}
