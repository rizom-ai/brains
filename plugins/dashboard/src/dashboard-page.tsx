/** @jsxImportSource preact */
import { render } from "preact-render-to-string";
import type { JSX } from "preact";
import { DASHBOARD_STYLES } from "./render/styles";
import { Masthead } from "./render/masthead";
import { EntitySummaryCard } from "./render/entity-summary-card";
import { IdentityCard } from "./render/identity-card";
import { EndpointsCard } from "./render/endpoints-card";
import { InteractionsCard } from "./render/interactions-card";
import { WidgetCard } from "./render/widget-card";
import { Colophon } from "./render/colophon";
import type {
  DashboardRenderInput,
  RenderableWidgetData,
} from "./render/types";

export type { DashboardRenderInput } from "./render/types";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,30..100;1,9..144,300..900,30..100&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap";

interface WidgetGroups {
  primary: RenderableWidgetData[];
  secondary: RenderableWidgetData[];
  sidebar: RenderableWidgetData[];
}

function groupExternalWidgets(
  widgets: Record<string, RenderableWidgetData>,
): WidgetGroups {
  const groups: WidgetGroups = {
    primary: [],
    secondary: [],
    sidebar: [],
  };

  for (const widget of Object.values(widgets)) {
    groups[widget.widget.section].push(widget);
  }

  for (const section of Object.keys(groups) as Array<keyof WidgetGroups>) {
    groups[section].sort((a, b) => a.widget.priority - b.widget.priority);
  }

  return groups;
}

const THEME_TOGGLE_SCRIPT = `(function () {
  var root = document.documentElement;
  var btn = document.getElementById("themeToggle");
  var stored = null;
  try { stored = localStorage.getItem("brain:dashboard:theme"); } catch (e) {}
  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
  }
  function sync() {
    if (!btn) return;
    btn.textContent = root.getAttribute("data-theme") === "dark" ? "Light mode" : "Dark mode";
  }
  if (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("brain:dashboard:theme", next); } catch (e) {}
      sync();
    });
  }
  sync();
})();`;

function OperatorGate({
  hiddenWidgetCount,
  loginUrl,
}: {
  hiddenWidgetCount: number;
  loginUrl: string;
}): JSX.Element {
  return (
    <section class="card operator-gate">
      <div>
        <div class="card-title">Operator access</div>
        <p>
          {hiddenWidgetCount === 1
            ? "1 private console widget is hidden."
            : `${hiddenWidgetCount} private console widgets are hidden.`}{" "}
          {""}
          Sign in with your passkey to unlock the restricted layer.
        </p>
      </div>
      <a class="operator-gate-link" href={loginUrl}>
        Sign in
      </a>
    </section>
  );
}

const PIPELINE_TABS_SCRIPT = `(function () {
  function activate(root, status) {
    var tabs = root.querySelectorAll("[data-pipeline-tab]");
    var panels = root.querySelectorAll("[data-pipeline-panel]");

    tabs.forEach(function (tab) {
      var active = tab.getAttribute("data-pipeline-tab") === status;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });

    panels.forEach(function (panel) {
      var active = panel.getAttribute("data-pipeline-panel") === status;
      panel.classList.toggle("is-active", active);
    });
  }

  document.querySelectorAll("[data-pipeline-widget]").forEach(function (root) {
    var defaultStatus = root.getAttribute("data-pipeline-default");
    root.querySelectorAll("[data-pipeline-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var status = tab.getAttribute("data-pipeline-tab");
        if (status) activate(root, status);
      });
    });

    if (defaultStatus) {
      activate(root, defaultStatus);
    }
  });
})();`;

function DashboardDocument({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const totalEntities = input.appInfo.entities;
  const entityCounts = input.appInfo.entityCounts;
  const groups = groupExternalWidgets(input.widgets);
  const hasCharacter =
    Boolean(input.character.role) ||
    Boolean(input.character.purpose) ||
    input.character.values.length > 0;
  const interactions = input.appInfo.interactions;
  const hasInteractions = interactions.length > 0;
  const hasEndpoints = input.appInfo.endpoints.length > 0;
  const hasSidebarWidgets = groups.sidebar.length > 0;
  const layoutClass = `layout${hasCharacter ? " has-identity" : ""}`;
  const showOperatorGate =
    input.operatorAccess &&
    !input.operatorAccess.isOperator &&
    input.operatorAccess.hiddenWidgetCount > 0;

  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{input.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={FONTS_URL} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />
      </head>
      <body>
        <main class="console" data-component="dashboard:dashboard">
          <Masthead
            title={input.title}
            tagline={input.profile.description}
            appInfo={input.appInfo}
            now={new Date()}
            operatorAccess={input.operatorAccess}
          />

          <section class={layoutClass}>
            {hasCharacter && (
              <div class="identity-column">
                <IdentityCard character={input.character} />
                <InteractionsCard
                  interactions={interactions}
                  baseUrl={input.baseUrl}
                />
                {showOperatorGate && input.operatorAccess && (
                  <OperatorGate
                    hiddenWidgetCount={input.operatorAccess.hiddenWidgetCount}
                    loginUrl={input.operatorAccess.loginUrl}
                  />
                )}
              </div>
            )}
            <div class="main-column">
              <EntitySummaryCard
                total={totalEntities}
                entityCounts={entityCounts}
              />
              {!hasCharacter && showOperatorGate && input.operatorAccess && (
                <OperatorGate
                  hiddenWidgetCount={input.operatorAccess.hiddenWidgetCount}
                  loginUrl={input.operatorAccess.loginUrl}
                />
              )}
              {groups.primary.map((widget) => (
                <WidgetCard
                  key={`${widget.widget.pluginId}:${widget.widget.id}`}
                  widget={widget}
                />
              ))}
              {groups.secondary.map((widget) => (
                <WidgetCard
                  key={`${widget.widget.pluginId}:${widget.widget.id}`}
                  widget={widget}
                />
              ))}
            </div>
            {(hasSidebarWidgets ||
              hasEndpoints ||
              (!hasCharacter && hasInteractions)) && (
              <div class="sidebar-column">
                {!hasCharacter && (
                  <InteractionsCard
                    interactions={interactions}
                    baseUrl={input.baseUrl}
                  />
                )}
                {groups.sidebar.map((widget) => (
                  <WidgetCard
                    key={`${widget.widget.pluginId}:${widget.widget.id}`}
                    widget={widget}
                  />
                ))}
                <EndpointsCard
                  endpoints={input.appInfo.endpoints}
                  baseUrl={input.baseUrl}
                />
              </div>
            )}
          </section>

          <Colophon title={input.title} appInfo={input.appInfo} />
        </main>

        <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
          Light mode
        </button>

        <script dangerouslySetInnerHTML={{ __html: THEME_TOGGLE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PIPELINE_TABS_SCRIPT }} />
        {input.widgetScripts.map((script, index) => (
          <script
            key={`widget-script:${index}`}
            dangerouslySetInnerHTML={{ __html: script }}
          />
        ))}
      </body>
    </html>
  );
}

export function renderDashboardPageHtml(input: DashboardRenderInput): string {
  return `<!doctype html>\n${render(<DashboardDocument input={input} />)}`;
}
