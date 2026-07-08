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
  DashboardActivityEvent,
  DashboardJobProgressItem,
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
    const indexReady = resolveIndexReady(input);
    return [
      { label: "Runtime", value: "Active", tone: "good" },
      { label: "Endpoints", value: String(input.appInfo.endpoints.length) },
      {
        label: "Semantic index",
        value: indexReady ? "Ready" : "Pending",
        tone: indexReady ? "good" : "warn",
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

  // Tabs with dashboard built-ins exist even without registered widgets:
  // knowledge (entity summary) and system (index/sync/jobs/runtime).
  for (const builtInGroup of ["knowledge", "system"]) {
    if (!groupedWidgets.has(builtInGroup)) {
      groupedWidgets.set(builtInGroup, createEmptyWidgetGroups());
    }
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
      // Built-ins are not counted: the muted badge reports registered
      // widget volume only (the mockup's System tab carries no badge).
      widgetCount: countTabWidgets(tabWithoutCounts),
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
        <span>
          Brain · <b>Console</b>
        </span>
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
        <span class="command-chip-hint">Search or jump…</span>
        <kbd>⌘K</kbd>
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
          ) : tab.widgetCount > 0 ? (
            <span class="tab-badge tab-badge--muted">{tab.widgetCount}</span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}

function resolveIndexReady(input: DashboardRenderInput): boolean {
  return (
    input.indexStatus?.ready ?? input.indexReady ?? input.appInfo.embeddings > 0
  );
}

function VitalsRow({ input }: { input: DashboardRenderInput }): JSX.Element {
  const indexReady = resolveIndexReady(input);
  const latestWrite = input.activityLog?.[0];
  const typeCount = input.appInfo.entityCounts.length;
  const channels = input.appInfo.interactions
    .map((interaction) => interaction.id)
    .slice(0, 3)
    .join(" / ");
  const embedded =
    input.indexStatus?.embeddedEntities ?? input.appInfo.embeddings;
  // The denominator is embeddable entities only: some entity types never
  // embed by design, so an all-entities denominator would mislead.
  const embeddable = input.indexStatus?.embeddableEntities;
  const indexQueue = input.indexStatus
    ? (input.indexStatus.activeEmbeddingJobs ?? 0) +
      (input.indexStatus.missingEmbeddings ?? 0) +
      (input.indexStatus.staleEmbeddings ?? 0)
    : 0;
  const indexFraction =
    embeddable === undefined ? `${embedded}` : `${embedded}/${embeddable}`;
  const indexSub =
    indexQueue > 0
      ? `${indexFraction} embedded · ${indexQueue} queued`
      : `${indexFraction} embedded`;
  const hasActiveWrite = (input.jobProgress ?? []).some(
    (job) => job.status === "processing" || job.status === "pending",
  );

  return (
    <section class="overview-vitals" aria-label="Runtime vitals">
      <article class="vital-card">
        <span class="vital-label">Entities</span>
        <strong class="vital-num">{input.appInfo.entities}</strong>
        <span class="vital-sub">
          {typeCount === 1 ? "1 type" : `${typeCount} types`}
        </span>
      </article>
      <article class="vital-card">
        <span class="vital-label">Interactions</span>
        <strong class="vital-num">{input.appInfo.interactions.length}</strong>
        <span class="vital-sub">{channels || "no channels"}</span>
      </article>
      <article
        class={`vital-card ${indexReady ? "vital-card--ok" : "vital-card--warm"}`}
      >
        <span class="vital-label">Semantic index</span>
        <strong class="vital-num vital-num--text">
          {indexReady ? "Ready" : "Pending"}
        </strong>
        <span class="vital-sub">{indexSub}</span>
      </article>
      <article class={`vital-card${hasActiveWrite ? " vital-card--warm" : ""}`}>
        <span class="vital-label">Last write</span>
        <strong class="vital-num vital-num--text">
          {latestWrite ? formatClock(latestWrite.timestamp) : "—"}
        </strong>
        <span class="vital-sub">
          {latestWrite
            ? `${latestWrite.entityType}/${latestWrite.entityId}`
            : "no writes observed"}
        </span>
      </article>
    </section>
  );
}

function IdentityCapsule({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element | null {
  const { role, purpose, values } = input.character;
  if (!role && !purpose && values.length === 0) return null;

  return (
    <aside class="card identity-capsule">
      <div class="card-head">
        <span class="card-title">Identity</span>
        <span class="card-from">identity</span>
      </div>
      <div class="identity-capsule-body">
        {role && <span class="identity-role">“{role}”</span>}
        {values.length > 0 && (
          <span class="values">
            {values.map((value) => (
              <span class="value" key={value}>
                {value}
              </span>
            ))}
          </span>
        )}
        {purpose && <span class="identity-purpose">{purpose}</span>}
      </div>
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
    <section class="digests" aria-label="Group digests">
      {cards.map((card) => (
        <a class="card digest-card" href={card.href} key={card.id}>
          <div class="digest-head">
            <h4>{card.label}</h4>
            <span class="digest-go">open →</span>
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

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LEDGER_GLYPHS: Record<
  DashboardActivityEvent["action"],
  { glyph: string; tone: string }
> = {
  created: { glyph: "＋", tone: "" },
  updated: { glyph: "✓", tone: " ledger-glyph--ok" },
  deleted: { glyph: "−", tone: " ledger-glyph--warn" },
};

function ActivityLedger({
  events,
}: {
  events: DashboardActivityEvent[];
}): JSX.Element {
  return (
    <section class="card activity-ledger">
      <div class="card-head">
        <span class="card-title">Activity</span>
        <span class="card-from">entity events</span>
      </div>
      {events.length === 0 ? (
        <p class="muted">No entity activity has been observed this session.</p>
      ) : (
        <ol class="ledger">
          {events.map((event) => (
            <li
              class="ledger-entry"
              key={`${event.timestamp}:${event.action}:${event.entityType}:${event.entityId}`}
            >
              <time class="ledger-time" dateTime={event.timestamp}>
                {formatClock(event.timestamp)}
              </time>
              <span
                class={`ledger-glyph${LEDGER_GLYPHS[event.action].tone}`}
                aria-hidden="true"
              >
                {LEDGER_GLYPHS[event.action].glyph}
              </span>
              <span class="ledger-what">
                <b>{event.entityType}</b> {event.action} —{" "}
                <code>
                  {event.entityType}/{event.entityId}
                </code>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function calculateIndexPercent(
  status: NonNullable<DashboardRenderInput["indexStatus"]>,
): number {
  const outstanding =
    (status.activeEmbeddingJobs ?? 0) +
    (status.missingEmbeddings ?? 0) +
    (status.staleEmbeddings ?? 0);
  if (status.ready && !status.degraded) return 100;
  if (status.ready) return 92;
  if (outstanding === 0) return 50;
  return Math.max(8, Math.min(88, 100 - outstanding * 12));
}

function formatIndexStatus(
  status: NonNullable<DashboardRenderInput["indexStatus"]>,
): string {
  const state = status.ready
    ? status.degraded
      ? "ready, degraded"
      : "ready"
    : "pending";
  return [
    "Semantic index",
    state,
    status.activeEmbeddingJobs !== undefined
      ? `${status.activeEmbeddingJobs} active`
      : undefined,
    status.missingEmbeddings !== undefined
      ? `${status.missingEmbeddings} missing`
      : undefined,
    status.staleEmbeddings !== undefined
      ? `${status.staleEmbeddings} stale`
      : undefined,
    status.failedEmbeddings !== undefined
      ? `${status.failedEmbeddings} failed`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function IndexGauge({
  status,
}: {
  status: NonNullable<DashboardRenderInput["indexStatus"]>;
}): JSX.Element {
  const percent = calculateIndexPercent(status);
  const label = status.ready
    ? status.degraded
      ? "Degraded"
      : "Ready"
    : "Indexing";

  return (
    <div class="index-gauge" style={`--index-percent: ${percent}%`}>
      <div class="index-gauge-ring" aria-hidden="true">
        <span>{percent}%</span>
      </div>
      <div class="index-gauge-copy">
        <strong>{label}</strong>
        <span>{formatIndexStatus(status)}</span>
      </div>
    </div>
  );
}

function SemanticIndexCard({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const indexReady = resolveIndexReady(input);

  return (
    <section class="card semantic-index-card">
      <div class="card-head">
        <span class="card-title">Semantic index</span>
        <span class="card-from">entity-service</span>
      </div>
      {input.indexStatus ? (
        <IndexGauge status={input.indexStatus} />
      ) : (
        <dl class="kv">
          <div class="kv-row">
            <dt>Semantic index</dt>
            <dd>{indexReady ? "Ready" : "Pending"}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function ContentSyncCard({
  status,
}: {
  status: NonNullable<DashboardRenderInput["directorySyncStatus"]>;
}): JSX.Element {
  const fileSummary =
    status.totalFiles === undefined
      ? "—"
      : status.totalFiles === 1
        ? "1 file"
        : `${status.totalFiles} files`;
  const typeSummary = status.byEntityType
    ? Object.entries(status.byEntityType)
        .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
        .slice(0, 2)
        .map(([entityType, count]) => `${entityType} ${count}`)
        .join(", ")
    : undefined;

  return (
    <section class="card content-sync-card">
      <div class="card-head">
        <span class="card-title">Content sync</span>
        <span class="card-from">directory-sync</span>
      </div>
      <dl class="kv">
        <div class="kv-row">
          <dt>Path</dt>
          <dd>{status.syncPath}</dd>
        </div>
        <div class="kv-row">
          <dt>Files</dt>
          <dd>
            {typeSummary ? `${fileSummary} · ${typeSummary}` : fileSummary}
          </dd>
        </div>
        <div class="kv-row">
          <dt>Watch</dt>
          <dd>
            {status.watchEnabled
              ? "Watching"
              : status.isInitialized
                ? "Manual"
                : "Not initialized"}
          </dd>
        </div>
        <div class="kv-row">
          <dt>Last sync</dt>
          <dd>
            {status.lastSync
              ? `last sync ${formatTimestamp(status.lastSync)}`
              : "—"}
          </dd>
        </div>
      </dl>
      <div class="pipeline-mini" aria-label="Write pipeline">
        <span class={`pipeline-step${status.isInitialized ? " is-done" : ""}`}>
          entity db
        </span>
        <span class="pipeline-track"></span>
        <span
          class={`pipeline-step${(status.totalFiles ?? 0) > 0 ? " is-done" : ""}`}
        >
          exported
        </span>
        <span class="pipeline-track"></span>
        <span class={`pipeline-step${status.lastSync ? " is-done" : ""}`}>
          committed
        </span>
      </div>
    </section>
  );
}

const JOB_PILL_TONES: Record<DashboardJobProgressItem["status"], string> = {
  pending: "run",
  processing: "run",
  completed: "done",
  failed: "fail",
};

const JOB_PILL_LABELS: Record<DashboardJobProgressItem["status"], string> = {
  pending: "pending",
  processing: "running",
  completed: "done",
  failed: "failed",
};

function JobQueueCard({
  jobs,
}: {
  jobs: DashboardJobProgressItem[];
}): JSX.Element {
  return (
    <section class="card widget-card--wide job-queue-card">
      <div class="card-head">
        <span class="card-title">Job queue</span>
        <span class="card-from">job-queue</span>
      </div>
      {jobs.length === 0 ? (
        <p class="muted">No recent job progress observed.</p>
      ) : (
        <table class="jobs">
          <thead>
            <tr>
              <th>Job</th>
              <th>Type</th>
              <th>Updated</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={`${job.kind}:${job.id}`}>
                <td class="mono">{job.id.slice(0, 8)}</td>
                <td>{job.jobType ?? job.kind}</td>
                <td class="mono">{formatClock(job.updatedAt)}</td>
                <td>
                  <span
                    class={`status-pill status-pill--${JOB_PILL_TONES[job.status]}`}
                  >
                    {JOB_PILL_LABELS[job.status]}
                    {job.progressLabel ? ` · ${job.progressLabel}` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function OverviewPanel({
  input,
  tabs,
  showOperatorGate,
}: {
  input: DashboardRenderInput;
  tabs: WidgetTab[];
  showOperatorGate: boolean;
}): JSX.Element {
  const digestCards = buildOverviewDigestCards(tabs, input);
  const activityLog = input.activityLog ?? [];

  return (
    <section
      id="overview"
      class="dashboard-tab-panel is-active"
      data-dashboard-tab-panel
      aria-labelledby="dashboard-tab-overview"
    >
      <VitalsRow input={input} />
      <IdentityCapsule input={input} />
      {showOperatorGate && input.operatorAccess && (
        <OperatorGate
          hiddenWidgetCount={input.operatorAccess.hiddenWidgetCount}
          loginUrl={input.operatorAccess.loginUrl}
        />
      )}
      <div class="overview-grid">
        <DigestCards cards={digestCards} />
        <ActivityLedger events={activityLog} />
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
  const hasKnowledgeBuiltIns = tab.group === "knowledge";
  const hasSidebar = tab.widgets.sidebar.length > 0 || hasSystemBuiltIns;

  return (
    <section
      id={tab.id}
      class="dashboard-tab-panel"
      data-dashboard-tab-panel
      data-dashboard-group={tab.group}
    >
      <header class="tab-section-head">
        <h2>{tab.label}</h2>
      </header>
      <div
        class={`layout tab-layout${hasSidebar ? "" : " tab-layout--main-only"}`}
      >
        <div class="main-column">
          {hasKnowledgeBuiltIns && (
            <EntitySummaryCard
              total={input.appInfo.entities}
              entityCounts={input.appInfo.entityCounts}
            />
          )}
          {hasSystemBuiltIns && (
            <>
              <SemanticIndexCard input={input} />
              {input.directorySyncStatus && (
                <ContentSyncCard status={input.directorySyncStatus} />
              )}
              <JobQueueCard jobs={input.jobProgress ?? []} />
            </>
          )}
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
                <InteractionsCard
                  interactions={input.appInfo.interactions}
                  baseUrl={input.baseUrl}
                />
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
          <div class="frame">
            <ConsoleStrip
              dashboardPath={dashboardPath}
              operatorAccess={input.operatorAccess}
            />
            <Masthead title={input.title} tagline={input.profile.description} />
            <TabBar tabs={tabs} />

            <div class="canvas">
              <div class="dashboard-tab-panels">
                <OverviewPanel
                  input={input}
                  tabs={tabs}
                  showOperatorGate={Boolean(showOperatorGate)}
                />
                {tabs.map((tab) => (
                  <WidgetTabPanel
                    key={tab.id}
                    tab={tab}
                    input={input}
                    now={now}
                  />
                ))}
              </div>
            </div>
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
