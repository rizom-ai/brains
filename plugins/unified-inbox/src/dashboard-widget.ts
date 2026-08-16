import {
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type DashboardOperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import type { InboxOperatorService } from "./operator-service";
import { inboxDashboardDataSchema, type InboxDashboardData } from "./schemas";

function unavailableSourceBlocks(count: number): DashboardOperatorViewBlock[] {
  return count > 0
    ? [
        {
          type: "notice",
          tone: "warn",
          text: `${count} ${count === 1 ? "source is" : "sources are"} temporarily unavailable.`,
        },
      ]
    : [];
}

const inboxWidget = defineDashboardWidget({
  id: "inbox",
  title: "Inbox",
  description: "Live attention across source-owned workflows",
  group: "communication",
  placement: "primary",
  priority: 10,
  permission: "admin",
  data: inboxDashboardDataSchema,
  digest: ({ data }) => ({
    items: [
      {
        label: "Open",
        value: String(data.summary.open),
        ...(data.summary.open > 0 ? { tone: "warn" } : {}),
      },
      {
        label: "High priority",
        value: String(data.summary.high),
        ...(data.summary.high > 0 ? { tone: "warn" } : {}),
      },
      {
        label: "Sources online",
        value: `${data.summary.availableSources}/${data.summary.availableSources + data.summary.unavailableSources}`,
      },
    ],
    attention: data.summary.high,
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "stats",
        items: [
          { label: "Open", value: data.summary.open },
          {
            label: "High priority",
            value: data.summary.high,
            tone: data.summary.high > 0 ? "warn" : "neutral",
          },
          { label: "Sources online", value: data.summary.availableSources },
          {
            label: "Sources unavailable",
            value: data.summary.unavailableSources,
            tone: data.summary.unavailableSources > 0 ? "warn" : "good",
          },
        ],
      },
      {
        type: "list",
        id: "inbox-entries",
        empty: "Inbox clear — no source needs attention.",
        items: data.entries.map((entry, index) => ({
          id: `${index}:${entry.receivedAt}:${entry.sourceLabel.slice(0, 70)}`,
          title: entry.title,
          metadata: [entry.sourceLabel, entry.receivedAt],
          badges: [
            {
              label: entry.urgency,
              tone: entry.urgency === "high" ? "warn" : "neutral",
            },
          ],
        })),
      },
      ...unavailableSourceBlocks(data.summary.unavailableSources),
      {
        type: "links",
        items: [
          {
            label: "Open Inbox",
            target: { launch: { target: "inbox" } },
          },
        ],
      },
    ],
  }),
});

export async function registerUnifiedInboxDashboardWidget(
  context: ServicePluginContext,
  operator: Pick<InboxOperatorService, "dashboard">,
): Promise<void> {
  await registerBuiltInDashboardWidget({
    context,
    definition: inboxWidget,
    load: async ({ signal }): Promise<InboxDashboardData> => {
      signal.throwIfAborted();
      const data = await operator.dashboard();
      signal.throwIfAborted();
      return data;
    },
  });
}
