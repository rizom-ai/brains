import { escapeHtml } from "@brains/utils";
import type { WidgetData } from "./widget-schema";
import { DASHBOARD_STYLES } from "./render/styles";
import { renderMasthead } from "./render/masthead";
import { renderHero } from "./render/hero";
import { renderCharacterCard } from "./render/character-card";
import { renderEndpointsCard } from "./render/endpoints-card";
import { renderWidgetCard } from "./render/widget-card";
import { renderColophon } from "./render/colophon";
import type { DashboardRenderInput } from "./render/types";

export type { DashboardRenderInput } from "./render/types";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,30..100;1,9..144,300..900,30..100&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap";

function groupExternalWidgets(widgets: Record<string, WidgetData>): {
  primary: WidgetData[];
  secondary: WidgetData[];
  sidebar: WidgetData[];
} {
  const groups = {
    primary: [] as WidgetData[],
    secondary: [] as WidgetData[],
    sidebar: [] as WidgetData[],
  };
  for (const widget of Object.values(widgets)) {
    groups[widget.widget.section].push(widget);
  }
  for (const section of Object.keys(groups) as Array<keyof typeof groups>) {
    groups[section].sort((a, b) => a.widget.priority - b.widget.priority);
  }
  return groups;
}

const THEME_TOGGLE_SCRIPT = `
(function () {
  var root = document.documentElement;
  var btn = document.getElementById("themeToggle");
  var stored = null;
  try { stored = localStorage.getItem("brain:dashboard:theme"); } catch (e) {}
  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
  }
  function sync() {
    btn.textContent = root.getAttribute("data-theme") === "dark" ? "Light mode" : "Dark mode";
  }
  btn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("brain:dashboard:theme", next); } catch (e) {}
    sync();
  });
  sync();
})();
`;

export function renderDashboardPageHtml(input: DashboardRenderInput): string {
  const totalEntities = input.entityCounts.reduce(
    (sum, { count }) => sum + count,
    0,
  );
  const groups = groupExternalWidgets(input.widgets);

  const mainCards: string[] = [renderHero(totalEntities, input.entityCounts)];
  for (const widget of groups.primary)
    mainCards.push(renderWidgetCard(widget, false));
  for (const widget of groups.secondary)
    mainCards.push(renderWidgetCard(widget, false));

  const sidebarCards: string[] = [];
  const characterCard = renderCharacterCard(input.character);
  if (characterCard) sidebarCards.push(characterCard);
  const endpointsCard = renderEndpointsCard(
    input.appInfo.endpoints,
    input.baseUrl,
  );
  if (endpointsCard) sidebarCards.push(endpointsCard);
  for (const widget of groups.sidebar)
    sidebarCards.push(renderWidgetCard(widget, false));

  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONTS_URL}" rel="stylesheet" />
    <style>${DASHBOARD_STYLES}</style>
  </head>
  <body>
    <main class="console" data-component="dashboard:dashboard">
      ${renderMasthead({
        title: input.title,
        tagline: input.profile.description,
        appInfo: input.appInfo,
        now: new Date(),
      })}

      <section class="layout">
        <div class="main-column">
          ${mainCards.join("")}
        </div>
        ${sidebarCards.length > 0 ? `<div class="sidebar-column">${sidebarCards.join("")}</div>` : ""}
      </section>

      ${renderColophon(input.title, input.appInfo)}
    </main>

    <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">Light mode</button>

    <script>${THEME_TOGGLE_SCRIPT}</script>
  </body>
</html>
`;
}
