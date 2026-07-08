/** @jsxImportSource preact */
import { render } from "preact-render-to-string";
import type { JSX } from "preact";
import { DASHBOARD_STYLES } from "./render/styles";
import { Masthead } from "./render/masthead";
import { EntitySummaryCard } from "./render/entity-summary-card";
import { EndpointsCard } from "./render/endpoints-card";
import { InteractionsCard } from "./render/interactions-card";
import { WidgetCard } from "./render/widget-card";
import { RuntimeCard } from "./render/runtime-card";
import { Colophon } from "./render/colophon";
import { getDashboardGroupLabel, sortDashboardGroups } from "./widget-groups";
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

interface WidgetTab {
  id: string;
  group: string;
  label: string;
  widgets: WidgetGroups;
  widgetCount: number;
  needsOperator: number;
}

interface OverviewDigestLine {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn" | undefined;
}

interface OverviewDigestCard {
  id: string;
  label: string;
  href: string;
  lines: OverviewDigestLine[];
}

function createEmptyWidgetGroups(): WidgetGroups {
  return {
    primary: [],
    secondary: [],
    sidebar: [],
  };
}

function countNeedsOperator(tab: WidgetTab): number {
  return getTabWidgets(tab).reduce(
    (total, widget) => total + (widget.widget.needsOperator ?? 0),
    0,
  );
}

function countTabWidgets(tab: WidgetTab): number {
  return (
    tab.widgets.primary.length +
    tab.widgets.secondary.length +
    tab.widgets.sidebar.length
  );
}

function getTabWidgets(tab: WidgetTab): RenderableWidgetData[] {
  return [
    ...tab.widgets.primary,
    ...tab.widgets.secondary,
    ...tab.widgets.sidebar,
  ];
}

function getFallbackDigestLines(
  tab: WidgetTab,
  input: DashboardRenderInput,
): OverviewDigestLine[] {
  if (tab.group === "system") {
    return [
      { label: "Runtime", value: "Active", tone: "good" },
      { label: "Endpoints", value: String(input.appInfo.endpoints.length) },
      {
        label: "Semantic index",
        value: input.appInfo.embeddings > 0 ? "Ready" : "Pending",
        tone: input.appInfo.embeddings > 0 ? "good" : "warn",
      },
    ];
  }

  return [
    {
      label: countTabWidgets(tab) === 1 ? "Widget" : "Widgets",
      value: String(countTabWidgets(tab)),
    },
  ];
}

function buildOverviewDigestCards(
  tabs: WidgetTab[],
  input: DashboardRenderInput,
): OverviewDigestCard[] {
  return tabs.map((tab) => {
    const digestLines = getTabWidgets(tab)
      .flatMap((widget) => widget.widget.digest ?? [])
      .slice(0, 4);

    return {
      id: tab.id,
      label: tab.label,
      href: `#${tab.id}`,
      lines:
        digestLines.length > 0
          ? digestLines
          : getFallbackDigestLines(tab, input),
    };
  });
}

function anchorForGroup(group: string): string {
  const slug = group
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "group";
}

function groupExternalWidgets(
  widgets: Record<string, RenderableWidgetData>,
): WidgetTab[] {
  const groupedWidgets = new Map<string, WidgetGroups>();

  for (const widget of Object.values(widgets)) {
    const group = widget.widget.group;
    const sectionWidgets =
      groupedWidgets.get(group) ?? createEmptyWidgetGroups();
    sectionWidgets[widget.widget.section].push(widget);
    groupedWidgets.set(group, sectionWidgets);
  }

  for (const groups of groupedWidgets.values()) {
    for (const section of Object.keys(groups) as Array<keyof WidgetGroups>) {
      groups[section].sort((a, b) => a.widget.priority - b.widget.priority);
    }
  }

  const usedAnchors = new Map<string, number>();

  if (!groupedWidgets.has("system")) {
    groupedWidgets.set("system", createEmptyWidgetGroups());
  }

  return sortDashboardGroups(Array.from(groupedWidgets.keys())).map((group) => {
    const baseAnchor = anchorForGroup(group);
    const anchorCount = usedAnchors.get(baseAnchor) ?? 0;
    const widgetsForGroup =
      groupedWidgets.get(group) ?? createEmptyWidgetGroups();
    const tabWithoutCounts = {
      id: anchorCount === 0 ? baseAnchor : `${baseAnchor}-${anchorCount + 1}`,
      group,
      label: getDashboardGroupLabel(group),
      widgets: widgetsForGroup,
      widgetCount: 0,
      needsOperator: 0,
    };
    usedAnchors.set(baseAnchor, anchorCount + 1);

    return {
      ...tabWithoutCounts,
      widgetCount:
        countTabWidgets(tabWithoutCounts) + (group === "system" ? 2 : 0),
      needsOperator: countNeedsOperator(tabWithoutCounts),
    };
  });
}

const THEME_TOGGLE_SCRIPT = `(function () {
  var root = document.documentElement;
  var btn = document.getElementById("themeToggle");
  var stored = null;
  try { stored = localStorage.getItem("brain:dashboard:theme"); } catch (e) { /* storage unavailable */ }
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
      try { localStorage.setItem("brain:dashboard:theme", next); } catch (e) { /* storage unavailable */ }
      sync();
    });
  }
  sync();
})();`;

const DASHBOARD_TABS_SCRIPT = `(function () {
  var root = document.documentElement;
  var links = Array.prototype.slice.call(document.querySelectorAll("[data-dashboard-tab-link]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-dashboard-tab-panel]"));
  if (!links.length || !panels.length) return;

  root.classList.add("dashboard-tabs-ready");

  function panelExists(id) {
    return panels.some(function (panel) { return panel.id === id; });
  }

  function resolveId(hash) {
    var id = (hash || "").replace(/^#/, "");
    return id && panelExists(id) ? id : "overview";
  }

  function activate(id, updateHash) {
    links.forEach(function (link) {
      var active = link.getAttribute("data-dashboard-tab-link") === id;
      link.classList.toggle("is-active", active);
      link.setAttribute("aria-selected", active ? "true" : "false");
    });

    panels.forEach(function (panel) {
      var active = panel.id === id;
      panel.classList.toggle("is-active", active);
      panel.toggleAttribute("hidden", !active);
    });

    if (updateHash && window.history && window.history.pushState) {
      window.history.pushState(null, "", "#" + id);
    }
  }

  links.forEach(function (link) {
    link.addEventListener("click", function (event) {
      var id = link.getAttribute("data-dashboard-tab-link");
      if (!id) return;
      event.preventDefault();
      activate(id, true);
    });
  });

  activate(resolveId(window.location.hash), false);
  window.addEventListener("hashchange", function () {
    activate(resolveId(window.location.hash), false);
  });
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

function ConsoleStrip({
  dashboardPath,
  operatorAccess,
}: {
  dashboardPath: string;
  operatorAccess: DashboardRenderInput["operatorAccess"];
}): JSX.Element {
  const sessionHref = operatorAccess?.isOperator
    ? operatorAccess.logoutUrl
    : (operatorAccess?.loginUrl ?? "/login");
  const sessionLabel = operatorAccess?.isOperator ? "Operator" : "Visitor";
  const sessionAction = operatorAccess?.isOperator ? "Sign out" : "Sign in";

  return (
    <header class="console-strip" aria-label="Operator surfaces">
      <a class="console-mark" href={dashboardPath} aria-label="Dashboard home">
        <span class="pulse"></span>
        <span>Brain</span>
      </a>
      <nav class="surface-nav" aria-label="Console surfaces">
        <a class="surface-nav-link is-active" href={dashboardPath}>
          Dashboard
        </a>
        <a class="surface-nav-link" href="/chat">
          Chat
        </a>
        <a class="surface-nav-link" href="/cms">
          CMS
        </a>
      </nav>
      <button class="command-chip" type="button" aria-label="Command menu">
        ⌘K
      </button>
      <a class="session-chip" href={sessionHref}>
        <span>{sessionLabel}</span>
        <strong>{sessionAction}</strong>
      </a>
    </header>
  );
}

function TabBar({ tabs }: { tabs: WidgetTab[] }): JSX.Element {
  return (
    <nav class="dashboard-tabs" aria-label="Dashboard sections" role="tablist">
      <a
        class="dashboard-tab is-active"
        href="#overview"
        role="tab"
        aria-selected="true"
        data-dashboard-tab-link="overview"
      >
        Overview
      </a>
      {tabs.map((tab) => (
        <a
          class="dashboard-tab"
          href={`#${tab.id}`}
          role="tab"
          aria-selected="false"
          data-dashboard-tab-link={tab.id}
          key={tab.id}
        >
          <span>{tab.label}</span>
          {tab.needsOperator > 0 ? (
            <span class="tab-badge tab-badge--needs">{tab.needsOperator}</span>
          ) : (
            <span class="tab-badge tab-badge--muted">{tab.widgetCount}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

function VitalsRow({ input }: { input: DashboardRenderInput }): JSX.Element {
  const indexReady = input.appInfo.embeddings > 0;

  return (
    <section class="overview-vitals" aria-label="Runtime vitals">
      <article class="vital-card">
        <span>Entities</span>
        <strong>{input.appInfo.entities}</strong>
      </article>
      <article class="vital-card">
        <span>Interactions</span>
        <strong>{input.appInfo.interactions.length}</strong>
      </article>
      <article class="vital-card">
        <span>Semantic index</span>
        <strong>{indexReady ? "Ready" : "Pending"}</strong>
      </article>
      <article class="vital-card vital-card--muted">
        <span>Last write</span>
        <strong>—</strong>
      </article>
    </section>
  );
}

function IdentityCapsule({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element | null {
  const fragments = [
    input.character.role,
    input.character.purpose,
    input.character.values.length > 0
      ? `Values: ${input.character.values.join(", ")}`
      : "",
  ].filter(Boolean);

  if (fragments.length === 0) return null;

  return (
    <aside class="card identity-capsule">
      <span class="card-title">Identity capsule</span>
      <p>{fragments.join(" · ")}</p>
    </aside>
  );
}

function DigestCards({ cards }: { cards: OverviewDigestCard[] }): JSX.Element {
  if (cards.length === 0) {
    return (
      <section class="card overview-empty-digest">
        <div class="card-head">
          <span class="card-title">Group digests</span>
        </div>
        <p class="muted">No plugin groups are visible yet.</p>
      </section>
    );
  }

  return (
    <section class="digest-grid" aria-label="Group digests">
      {cards.map((card) => (
        <a class="card digest-card" href={card.href} key={card.id}>
          <div class="card-head">
            <span class="card-title">{card.label}</span>
            <span class="card-subtitle">Open tab</span>
          </div>
          <dl class="digest-lines">
            {card.lines.map((line) => (
              <div
                class={`digest-line digest-line--${line.tone ?? "plain"}`}
                key={`${line.label}:${line.value}`}
              >
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        </a>
      ))}
    </section>
  );
}

function ActivityLedger(): JSX.Element {
  return (
    <section class="card activity-ledger">
      <div class="card-head">
        <span class="card-title">Activity ledger</span>
        <span class="card-subtitle">Recent events</span>
      </div>
      <p class="muted">
        Recent entity activity is not available from the dashboard datasource
        yet.
      </p>
    </section>
  );
}

function SystemHealthCard({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const daemonCount = input.appInfo.daemons.length;
  const healthyDaemons = input.appInfo.daemons.filter(
    (daemon) => daemon.health?.status === "healthy",
  ).length;
  const indexReady = input.appInfo.embeddings > 0;

  return (
    <section class="card system-health-card">
      <div class="card-head">
        <span class="card-title">System health</span>
        <span class="card-subtitle">Runtime signals</span>
      </div>
      <dl class="kv">
        <div class="kv-row">
          <dt>Daemons</dt>
          <dd>
            {daemonCount === 0
              ? "—"
              : `${healthyDaemons}/${daemonCount} healthy`}
          </dd>
        </div>
        <div class="kv-row">
          <dt>Semantic index</dt>
          <dd>{indexReady ? "Ready" : "Pending"}</dd>
        </div>
        <div class="kv-row">
          <dt>Job queue</dt>
          <dd>Unavailable</dd>
        </div>
        <div class="kv-row">
          <dt>Directory sync</dt>
          <dd>Unavailable</dd>
        </div>
      </dl>
    </section>
  );
}

function OverviewPanel({
  input,
  tabs,
  layoutClass,
  hasCharacter,
  showOperatorGate,
}: {
  input: DashboardRenderInput;
  tabs: WidgetTab[];
  layoutClass: string;
  hasCharacter: boolean;
  showOperatorGate: boolean;
}): JSX.Element {
  const totalEntities = input.appInfo.entities;
  const entityCounts = input.appInfo.entityCounts;
  const interactions = input.appInfo.interactions;
  const digestCards = buildOverviewDigestCards(tabs, input);

  return (
    <section
      id="overview"
      class="dashboard-tab-panel is-active"
      data-dashboard-tab-panel
      aria-labelledby="dashboard-tab-overview"
    >
      <div class={layoutClass}>
        {hasCharacter && (
          <div class="identity-column">
            <IdentityCapsule input={input} />
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
          <VitalsRow input={input} />
          <DigestCards cards={digestCards} />
          <EntitySummaryCard
            total={totalEntities}
            entityCounts={entityCounts}
          />
          <ActivityLedger />
          {!hasCharacter && showOperatorGate && input.operatorAccess && (
            <OperatorGate
              hiddenWidgetCount={input.operatorAccess.hiddenWidgetCount}
              loginUrl={input.operatorAccess.loginUrl}
            />
          )}
        </div>
        <div class="sidebar-column">
          {!hasCharacter && (
            <InteractionsCard
              interactions={interactions}
              baseUrl={input.baseUrl}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function WidgetTabPanel({
  tab,
  input,
  now,
}: {
  tab: WidgetTab;
  input: DashboardRenderInput;
  now: Date;
}): JSX.Element {
  const mainWidgets = [...tab.widgets.primary, ...tab.widgets.secondary];
  const hasSystemBuiltIns = tab.group === "system";
  const hasSidebar = tab.widgets.sidebar.length > 0 || hasSystemBuiltIns;

  return (
    <section
      id={tab.id}
      class="dashboard-tab-panel"
      data-dashboard-tab-panel
      data-dashboard-group={tab.group}
    >
      <header class="tab-section-head">
        <p class="eyebrow">{tab.label} Tab</p>
        <h2>{tab.label}</h2>
      </header>
      <div
        class={`layout tab-layout${hasSidebar ? "" : " tab-layout--main-only"}`}
      >
        <div class="main-column">
          {hasSystemBuiltIns && <SystemHealthCard input={input} />}
          {mainWidgets.map((widget) => (
            <WidgetCard
              key={`${widget.widget.pluginId}:${widget.widget.id}`}
              widget={widget}
            />
          ))}
        </div>
        {hasSidebar && (
          <div class="sidebar-column">
            {hasSystemBuiltIns && (
              <>
                <EndpointsCard
                  endpoints={input.appInfo.endpoints}
                  baseUrl={input.baseUrl}
                />
                <RuntimeCard appInfo={input.appInfo} now={now} />
              </>
            )}
            {tab.widgets.sidebar.map((widget) => (
              <WidgetCard
                key={`${widget.widget.pluginId}:${widget.widget.id}`}
                widget={widget}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DashboardDocument({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const tabs = groupExternalWidgets(input.widgets);
  const hasCharacter =
    Boolean(input.character.role) ||
    Boolean(input.character.purpose) ||
    input.character.values.length > 0;
  const layoutClass = `layout${hasCharacter ? " has-identity" : ""}`;
  const showOperatorGate =
    input.operatorAccess &&
    !input.operatorAccess.isOperator &&
    input.operatorAccess.hiddenWidgetCount > 0;
  const dashboardPath = input.dashboardPath ?? "/dashboard";
  const now = new Date();

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
        {input.themeCSS !== undefined && (
          <style
            data-dashboard-theme
            dangerouslySetInnerHTML={{ __html: input.themeCSS }}
          />
        )}
        <style
          data-dashboard-styles
          dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }}
        />
      </head>
      <body>
        <main class="console" data-component="dashboard:dashboard">
          <ConsoleStrip
            dashboardPath={dashboardPath}
            operatorAccess={input.operatorAccess}
          />
          <Masthead
            title={input.title}
            tagline={input.profile.description}
            operatorAccess={input.operatorAccess}
          />
          <TabBar tabs={tabs} />

          <div class="dashboard-tab-panels">
            <OverviewPanel
              input={input}
              tabs={tabs}
              layoutClass={layoutClass}
              hasCharacter={hasCharacter}
              showOperatorGate={Boolean(showOperatorGate)}
            />
            {tabs.map((tab) => (
              <WidgetTabPanel key={tab.id} tab={tab} input={input} now={now} />
            ))}
          </div>

          <Colophon
            title={input.title}
            appInfo={input.appInfo}
            baseUrl={input.baseUrl}
          />
        </main>

        <script dangerouslySetInnerHTML={{ __html: THEME_TOGGLE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: DASHBOARD_TABS_SCRIPT }} />
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
