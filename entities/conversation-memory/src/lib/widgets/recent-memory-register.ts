import {
  SYSTEM_CHANNELS,
  defineDashboardWidget,
  registerBuiltInDashboardWidget,
  type EntityPluginContext,
} from "@brains/plugins";
import {
  buildRecentConversationMemoryData,
  recentConversationMemoryDataSchema,
  RECENT_MEMORY_WIDGET_ID,
  type SummaryEntryRow,
} from "./recent-memory";
import { channelLabel, formatTimeRange } from "./format";

interface MemoryRow {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly metadata: string[];
}

function memoryRows(rows: readonly SummaryEntryRow[]): MemoryRow[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ...(row.keyPoint ? { description: row.keyPoint } : {}),
    metadata: [
      channelLabel(row.channelName, row.channelId),
      formatTimeRange(row.timeRange),
      `${row.messageCount} msgs`,
    ],
  }));
}

const recentMemoryWidget = defineDashboardWidget({
  id: RECENT_MEMORY_WIDGET_ID,
  title: "Recent conversation memory",
  group: "knowledge",
  placement: "secondary",
  priority: 35,
  permission: "public",
  data: recentConversationMemoryDataSchema,
  view: ({ data }) => ({
    blocks: [
      {
        type: "tabs",
        id: "memory-views",
        label: "Recent conversation memory views",
        defaultTab: "all",
        tabs: [
          {
            id: "all",
            label: "All",
            count: data.all.length,
            blocks: [
              {
                type: "list",
                id: "all-memory",
                empty: "No recent conversation memory.",
                items: memoryRows(data.all),
              },
            ],
          },
          {
            id: "by-channel",
            label: "By channel",
            count: data.byChannel.length,
            blocks: [
              {
                type: "list",
                id: "channel-memory",
                empty: "No recent channel memory.",
                items: memoryRows(data.byChannel),
              },
            ],
          },
        ],
      },
    ],
  }),
});

export function registerRecentConversationMemoryWidget(params: {
  context: EntityPluginContext;
}): void {
  const { context } = params;
  context.messaging.subscribe(
    SYSTEM_CHANNELS.pluginsRegistered,
    async (): Promise<{ success: boolean }> => {
      await registerBuiltInDashboardWidget({
        context,
        definition: recentMemoryWidget,
        load: ({ signal }) => {
          signal.throwIfAborted();
          return buildRecentConversationMemoryData(context);
        },
      });
      return { success: true };
    },
  );
}
