/** @jsxImportSource preact */
import {
  WidgetEmptyState,
  WidgetList,
  WidgetListItem,
  WidgetTabs,
  type WidgetComponentProps,
} from "@brains/dashboard";
import type { JSX } from "preact";
import {
  recentConversationMemoryDataSchema,
  type SummaryEntryRow,
} from "./recent-memory";
import { channelLabel, formatTimeRange } from "./format";

function EntryRow({ row }: { row: SummaryEntryRow }): JSX.Element {
  return (
    <WidgetListItem
      title={row.title}
      description={row.keyPoint}
      meta={[
        channelLabel(row.channelName, row.channelId),
        formatTimeRange(row.timeRange),
        `${row.messageCount} msgs`,
      ]}
    />
  );
}

function Panel({ rows }: { rows: SummaryEntryRow[] }): JSX.Element {
  if (rows.length === 0) return <WidgetEmptyState />;

  return (
    <WidgetList>
      {rows.map((row) => (
        <EntryRow key={row.id} row={row} />
      ))}
    </WidgetList>
  );
}

export function RecentConversationMemoryWidget({
  data,
  instanceId = "recent-memory",
}: WidgetComponentProps): JSX.Element {
  const parsed = recentConversationMemoryDataSchema.safeParse(data);
  if (!parsed.success) return <WidgetEmptyState />;

  const { all, byChannel } = parsed.data;
  return (
    <WidgetTabs
      id={`${instanceId}-views`}
      label="Recent conversation memory views"
      defaultValue="all"
      rootProps={{ "data-recent-memory-widget": true }}
      tabs={[
        {
          value: "all",
          label: "All",
          count: all.length,
          content: <Panel rows={all} />,
          triggerProps: { "data-recent-memory-view-tab": "all" },
          panelProps: { "data-recent-memory-panel": "all" },
        },
        {
          value: "byChannel",
          label: "By channel",
          count: byChannel.length,
          content: <Panel rows={byChannel} />,
          triggerProps: { "data-recent-memory-view-tab": "byChannel" },
          panelProps: { "data-recent-memory-panel": "byChannel" },
        },
      ]}
    />
  );
}
