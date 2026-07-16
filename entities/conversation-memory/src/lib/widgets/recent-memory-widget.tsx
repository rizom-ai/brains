/** @jsxImportSource preact */
import { h } from "preact";
import type { JSX } from "preact";
import type { WidgetComponentProps } from "@brains/dashboard";
import {
  recentConversationMemoryDataSchema,
  type SummaryEntryRow,
} from "./recent-memory";
import { channelLabel, formatTimeRange } from "./format";

void h;

function EntryRow({ row }: { row: SummaryEntryRow }): JSX.Element {
  const meta = [
    channelLabel(row.channelName, row.channelId),
    formatTimeRange(row.timeRange),
    `${row.messageCount} msgs`,
  ];
  return (
    <li class="list-item">
      <div class="list-main">
        <span class="list-name">{row.title}</span>
        {row.keyPoint && <span class="list-desc">{row.keyPoint}</span>}
        <span class="list-meta-text">
          {meta.map((segment, index) => (
            <span key={`${row.id}-meta-${index}`}>
              {index > 0 && <span class="sep">·</span>}
              {segment}
            </span>
          ))}
        </span>
      </div>
    </li>
  );
}

function Panel({
  view,
  rows,
  active,
}: {
  view: "all" | "byChannel";
  rows: SummaryEntryRow[];
  active: boolean;
}): JSX.Element {
  return (
    <div
      id={`recent-memory-panel-${view}`}
      class={active ? "is-active" : undefined}
      data-recent-memory-panel={view}
      data-ui-panel={view}
      role="tabpanel"
      aria-labelledby={`recent-memory-tab-${view}`}
      hidden={!active}
    >
      {rows.length > 0 ? (
        <ul class="list">
          {rows.map((row) => (
            <EntryRow key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <p class="muted">Nothing to show yet.</p>
      )}
    </div>
  );
}

export function RecentConversationMemoryWidget({
  data,
}: WidgetComponentProps): JSX.Element {
  const parsed = recentConversationMemoryDataSchema.safeParse(data);
  if (!parsed.success) {
    return <p class="muted">Nothing to show yet.</p>;
  }
  const { all, byChannel } = parsed.data;
  return (
    <div data-recent-memory-widget data-ui-tabs data-ui-tabs-default="all">
      <div
        class="widget-tabs"
        role="tablist"
        aria-label="Recent conversation memory views"
      >
        <button
          id="recent-memory-tab-all"
          class="widget-tab is-active"
          type="button"
          role="tab"
          data-recent-memory-view-tab="all"
          data-ui-tab="all"
          aria-controls="recent-memory-panel-all"
          aria-selected="true"
        >
          All
          <span class="widget-tab-count">{all.length}</span>
        </button>
        <button
          id="recent-memory-tab-byChannel"
          class="widget-tab"
          type="button"
          role="tab"
          data-recent-memory-view-tab="byChannel"
          data-ui-tab="byChannel"
          aria-controls="recent-memory-panel-byChannel"
          aria-selected="false"
        >
          By channel
          <span class="widget-tab-count">{byChannel.length}</span>
        </button>
      </div>
      <Panel view="all" rows={all} active={true} />
      <Panel view="byChannel" rows={byChannel} active={false} />
    </div>
  );
}
