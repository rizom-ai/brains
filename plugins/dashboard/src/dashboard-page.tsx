import type { DashboardData, WidgetData } from "./templates/dashboard/schema";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function groupWidgetsBySection(widgets: Record<string, WidgetData>): {
  primary: WidgetData[];
  secondary: WidgetData[];
  sidebar: WidgetData[];
} {
  const groups = {
    primary: [] as WidgetData[],
    secondary: [] as WidgetData[],
    sidebar: [] as WidgetData[],
  };

  for (const widgetData of Object.values(widgets)) {
    groups[widgetData.widget.section].push(widgetData);
  }

  for (const section of Object.keys(groups) as Array<keyof typeof groups>) {
    groups[section].sort((a, b) => a.widget.priority - b.widget.priority);
  }

  return groups;
}

function renderKeyValueList(data: Record<string, unknown>): string {
  const entries = Object.entries(data).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return '<p class="muted">No data available</p>';
  }

  return `<dl class="kv-list">${entries
    .map(
      ([key, value]) =>
        `<div class="kv-row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value,
        )}</dd></div>`,
    )
    .join("")}</dl>`;
}

function renderStatsWidget(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">No data available</p>';
  }

  const source =
    "stats" in data && typeof data.stats === "object" && data.stats !== null
      ? (data.stats as Record<string, unknown>)
      : (data as Record<string, unknown>);

  const stats = Object.entries(source).filter(
    ([, value]) => typeof value === "number",
  );

  if (stats.length === 0) {
    return '<p class="muted">No data available</p>';
  }

  return `<div class="stats-grid">${stats
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .map(
      ([key, value]) =>
        `<div class="stat-card"><div class="stat-value">${escapeHtml(
          value,
        )}</div><div class="stat-label">${escapeHtml(key)}</div></div>`,
    )
    .join("")}</div>`;
}

function renderLinks(links: unknown): string {
  if (!Array.isArray(links) || links.length === 0) {
    return "";
  }

  const validLinks = links.filter(
    (link): link is { label: string; url: string } =>
      typeof link === "object" &&
      link !== null &&
      "label" in link &&
      typeof link.label === "string" &&
      "url" in link &&
      typeof link.url === "string",
  );

  if (validLinks.length === 0) {
    return "";
  }

  return `<ul class="link-list">${validLinks
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          link.label,
        )}</a></li>`,
    )
    .join("")}</ul>`;
}

function renderWidgetBody(widgetData: WidgetData): string {
  const { rendererName } = widgetData.widget;
  const data = widgetData.data;

  if (rendererName === "StatsWidget") {
    return renderStatsWidget(data);
  }

  if (typeof data !== "object" || data === null) {
    return '<p class="muted">No data available</p>';
  }

  const record = data as Record<string, unknown>;
  const { links, ...rest } = record;
  return `${renderKeyValueList(rest)}${renderLinks(links)}`;
}

function renderWidgetCard(widgetData: WidgetData, spanCols = false): string {
  return `<section class="widget-card${spanCols ? " span-2" : ""}">
    <header class="widget-header">
      <h2>${escapeHtml(widgetData.widget.title)}</h2>
      <span class="widget-meta">${escapeHtml(widgetData.widget.pluginId)}</span>
    </header>
    ${renderWidgetBody(widgetData)}
  </section>`;
}

export function renderDashboardPageHtml(options: {
  title?: string;
  dashboardData: DashboardData;
}): string {
  const title = options.title ?? "Brain Dashboard";
  const groups = groupWidgetsBySection(options.dashboardData.widgets);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      a {
        color: #93c5fd;
      }
      .page {
        max-width: 1280px;
        margin: 0 auto;
        padding: 32px 24px;
      }
      .page-title {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #94a3b8;
        margin: 0 0 20px;
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
      }
      .main {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
      }
      .sidebar {
        display: grid;
        gap: 16px;
      }
      .widget-card {
        background: #111827;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 20px;
      }
      .widget-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        margin-bottom: 16px;
      }
      .widget-header h2 {
        margin: 0;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .widget-meta,
      .muted,
      .kv-row dt,
      .stat-label {
        color: #94a3b8;
      }
      .widget-meta {
        font-size: 12px;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
      }
      .stat-card {
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 14px;
        background: #0b1220;
      }
      .stat-value {
        font-size: 28px;
        font-weight: 700;
        line-height: 1.1;
      }
      .stat-label {
        margin-top: 6px;
        font-size: 12px;
      }
      .kv-list {
        margin: 0;
      }
      .kv-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid #334155;
      }
      .kv-row:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .kv-row dt,
      .kv-row dd {
        margin: 0;
        font-size: 13px;
      }
      .kv-row dd {
        text-align: right;
        word-break: break-word;
      }
      .link-list {
        list-style: none;
        padding: 0;
        margin: 16px 0 0;
        display: grid;
        gap: 8px;
      }
      .link-list li {
        font-size: 13px;
      }
      @media (min-width: 1024px) {
        .grid {
          grid-template-columns: minmax(0, 1fr) 280px;
          align-items: start;
        }
        .main {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .span-2 {
          grid-column: span 2;
        }
      }
    </style>
  </head>
  <body>
    <main class="page" data-component="dashboard:dashboard">
      <h1 class="page-title">${escapeHtml(title)}</h1>
      <div class="grid">
        <div class="main">
          ${groups.primary.map((widget) => renderWidgetCard(widget, true)).join("")}
          ${groups.secondary.map((widget) => renderWidgetCard(widget, true)).join("")}
        </div>
        <aside class="sidebar">
          ${groups.sidebar.map((widget) => renderWidgetCard(widget)).join("")}
        </aside>
      </div>
    </main>
  </body>
</html>
`;
}
