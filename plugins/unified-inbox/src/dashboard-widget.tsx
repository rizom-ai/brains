/** @jsxImportSource preact */
import {
  WidgetActionLink,
  WidgetActions,
  WidgetEmptyState,
  WidgetStatusPill,
  type WidgetComponentProps,
} from "@brains/dashboard";
import type { ServicePluginContext } from "@brains/plugins";
import type { JSX } from "preact";
import type { InboxOperatorService } from "./operator-service";
import { inboxDashboardDataSchema, type InboxDashboardData } from "./schemas";
import unifiedInboxWidgetStyles from "./dashboard-widget.css" with { type: "text" };

interface InboxDashboardContext {
  dashboard: Pick<ServicePluginContext["dashboard"], "registerWidget">;
}

function displayTimestamp(receivedAt: string): string {
  return `${receivedAt.slice(0, 10)} ${receivedAt.slice(11, 16)} UTC`;
}

export function UnifiedInboxDashboardWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = inboxDashboardDataSchema.safeParse(data);
  if (!parsed.success) {
    return <WidgetEmptyState>Inbox unavailable.</WidgetEmptyState>;
  }

  const { summary, entries, managementUrl } = parsed.data;
  return (
    <div class="unified-inbox-widget">
      <div class="unified-inbox-summary" aria-label="Inbox summary">
        <span>
          <strong>{summary.open}</strong> open
        </span>
        <span class={summary.high > 0 ? "is-high" : undefined}>
          <strong>{summary.high}</strong> high priority
        </span>
        <span>
          <strong>{summary.availableSources}</strong> sources online
        </span>
      </div>

      {entries.length === 0 ? (
        <WidgetEmptyState className="unified-inbox-empty">
          Inbox clear — no source needs attention.
        </WidgetEmptyState>
      ) : (
        <ol class="unified-inbox-preview">
          {entries.map((entry, index) => (
            <li key={`${entry.sourceLabel}:${entry.receivedAt}:${index}`}>
              <WidgetStatusPill
                tone={entry.urgency === "high" ? "warn" : "muted"}
              >
                {entry.urgency}
              </WidgetStatusPill>
              <span class="unified-inbox-preview-copy">
                <strong>{entry.title}</strong>
                <small>
                  {entry.sourceLabel} · {displayTimestamp(entry.receivedAt)}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}

      {summary.unavailableSources > 0 && (
        <p class="unified-inbox-unavailable">
          {summary.unavailableSources}{" "}
          {summary.unavailableSources === 1 ? "source is" : "sources are"}{" "}
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
