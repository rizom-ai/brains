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

export const recentConversationMemoryScript = `(function () {
  function setActive(nodes, match) {
    nodes.forEach(function (node) {
      var active = match(node);
      node.classList.toggle("is-active", active);
      if (node.hasAttribute("aria-pressed")) {
        node.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
  }
  document.querySelectorAll("[data-recent-memory-widget]").forEach(function (widget) {
    var tabs = widget.querySelectorAll("[data-recent-memory-view-tab]");
    var panels = widget.querySelectorAll("[data-recent-memory-panel]");
    function setView(view) {
      setActive(tabs, function (tab) {
        return tab.getAttribute("data-recent-memory-view-tab") === view;
      });
      panels.forEach(function (panel) {
        var match = panel.getAttribute("data-recent-memory-panel") === view;
        panel.style.display = match ? "" : "none";
      });
    }
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var view = tab.getAttribute("data-recent-memory-view-tab");
        if (view) setView(view);
      });
    });
    setView("all");
  });
})();`;

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
      data-recent-memory-panel={view}
      style={{ display: active ? undefined : "none" }}
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
    <div data-recent-memory-widget>
      <div
        class="view-tabs"
        role="tablist"
        aria-label="Recent conversation memory views"
      >
        <button
          class="view-tab is-active"
          type="button"
          data-recent-memory-view-tab="all"
          aria-pressed="true"
        >
          All
          <span class="view-tab-count">{all.length}</span>
        </button>
        <button
          class="view-tab"
          type="button"
          data-recent-memory-view-tab="byChannel"
          aria-pressed="false"
        >
          By channel
          <span class="view-tab-count">{byChannel.length}</span>
        </button>
      </div>
      <Panel view="all" rows={all} active={true} />
      <Panel view="byChannel" rows={byChannel} active={false} />
    </div>
  );
}
