/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import type { JSX } from "preact";
import { createMockAppInfo } from "@brains/test-utils";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "../src/dashboard-page";
import type { WidgetComponentProps } from "../src/widget-registry";

function TestCustomWidget({
  data,
  pluginId,
  widgetId,
  instanceId,
}: WidgetComponentProps): JSX.Element {
  const value =
    typeof data === "object" && data !== null && "message" in data
      ? String((data as { message: unknown }).message)
      : "missing";
  return (
    <div
      data-test-custom-widget
      data-plugin-id={pluginId}
      data-widget-id={widgetId}
      data-instance-id={instanceId}
    >
      {value}
    </div>
  );
}

describe("renderDashboardPageHtml", () => {
  it("should render a sign-in prompt when restricted widgets are hidden", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        hiddenWidgetCount: 1,
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("Restricted access");
    expect(html).toContain("1 private console widget is hidden.");
    expect(html).toContain('href="/login?return_to=%2Fdashboard"');
    expect(html).not.toContain('href="#my-agents"');
  });

  it("should explain role-limited widgets without asking signed-in users to sign in again", () => {
    const input: DashboardRenderInput = {
      title: "Test Brain",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Brain" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        principal: {
          displayName: "Mira",
          role: "trusted",
          permissionLevel: "trusted",
        },
        hiddenWidgetCount: 1,
        loginUrl: "/login",
        logoutUrl: "/logout",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("Your Trusted role does not include this layer.");
    expect(html).not.toContain('class="access-gate-link"');
  });

  it("keeps People administration out of the monitoring dashboard", () => {
    const adminInput: DashboardRenderInput = {
      title: "Test Brain",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Brain" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        principal: {
          displayName: "Yeehaa",
          role: "admin",
          permissionLevel: "admin",
        },
        hiddenWidgetCount: 0,
        loginUrl: "/login",
        logoutUrl: "/logout",
      },
    };

    const html = renderDashboardPageHtml(adminInput);

    expect(html).not.toContain('href="#people"');
    expect(html).not.toContain('href="#my-agents"');
    expect(html).not.toContain('data-people-panel="true"');
    expect(html).not.toContain('data-representations-panel="true"');
    expect(html).not.toContain("/auth/admin/users");
    expect(html).not.toContain("/auth/representations");
  });

  it("should inject theme CSS before dashboard component styles", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      themeCSS: ":root { --color-accent: #c6ff00; }",
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain(":root { --color-accent: #c6ff00; }");
    expect(html.indexOf("--color-accent: #c6ff00")).toBeLessThan(
      html.indexOf("data-dashboard-styles"),
    );
  });

  it("should reference external client assets in deterministic cascade order", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      themeCSS: ":root { --private-theme: lime; }",
      widgetStyles: [".private-widget { display: grid; }"],
      widgetScripts: ["window.privateWidget = true;"],
      assetUrls: {
        themeStyles: "/dashboard/assets/theme.hash.css",
        dashboardStyles: "/dashboard/assets/dashboard.hash.css",
        widgetStyles: ["/dashboard/assets/widget.hash.css"],
        dashboardScript: "/dashboard/assets/dashboard.hash.js",
        widgetScripts: ["/dashboard/assets/widget.hash.js"],
      },
    };

    const html = renderDashboardPageHtml(input);
    const themeIndex = html.indexOf("/dashboard/assets/theme.hash.css");
    const dashboardIndex = html.indexOf("/dashboard/assets/dashboard.hash.css");
    const widgetIndex = html.indexOf("/dashboard/assets/widget.hash.css");

    expect(themeIndex).toBeGreaterThan(-1);
    expect(themeIndex).toBeLessThan(dashboardIndex);
    expect(dashboardIndex).toBeLessThan(widgetIndex);
    expect(html.indexOf("/dashboard/assets/dashboard.hash.js")).toBeLessThan(
      html.indexOf("/dashboard/assets/widget.hash.js"),
    );
    expect(html).not.toContain("--private-theme");
    expect(html).not.toContain(".private-widget");
    expect(html).not.toContain("window.privateWidget");
  });

  it("should derive tabs from non-empty widget groups", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {
        "content-pipeline:pipeline": {
          widget: {
            id: "pipeline",
            pluginId: "content-pipeline",
            title: "Publication Pipeline",
            group: "publishing",
            section: "primary",
            priority: 10,
            rendererName: "PipelineWidget",
            visibility: "public",
            needsAttention: 2,
          },
          data: { summary: {}, items: [] },
        },
        "agent-discovery:agents": {
          widget: {
            id: "agents",
            pluginId: "agent-discovery",
            title: "Agents",
            group: "network",
            section: "secondary",
            priority: 20,
            rendererName: "ListWidget",
            visibility: "public",
          },
          data: { items: [] },
        },
      },
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('href="#overview"');
    expect(html).toContain('href="#publishing"');
    expect(html).toContain('href="#network"');
    expect(html).not.toContain('href="#site"');
    expect(html).toContain('class="tab-badge tab-badge--needs">2</span>');
    expect(html).toContain('class="tab-badge tab-badge--muted">1</span>');
    expect(html).toContain('data-dashboard-group="publishing"');
    expect(html).toContain('data-dashboard-group="network"');
    // Built-in tabs carry no plain-count badge (mockup: System has no badge).
    expect(html).not.toContain('class="tab-badge tab-badge--muted">0</span>');
  });

  it("should wrap the console chrome and panels in a single frame", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="frame"');
    expect(html).toContain('class="canvas"');
    // The strip pins to the top of the viewport on every surface — it
    // lives OUTSIDE the frame so it never shifts between dashboard, chat,
    // and the CMS. Masthead, tab bar, and panels stay inside the frame.
    const frameIndex = html.indexOf('class="frame"');
    expect(frameIndex).toBeGreaterThan(-1);
    expect(html.indexOf('class="console-strip"')).toBeLessThan(frameIndex);
    expect(frameIndex).toBeLessThan(html.indexOf('class="masthead"'));
    expect(frameIndex).toBeLessThan(html.indexOf('class="dashboard-tabs"'));
    expect(frameIndex).toBeLessThan(
      html.indexOf('class="dashboard-tab-panels"'),
    );
  });

  it("should render overview vitals and digest lines from widgets", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({
        uptime: 100,
        entities: 15,
        embeddings: 12,
        interactions: [
          {
            id: "dashboard",
            label: "Dashboard",
            href: "/dashboard",
            kind: "admin",
            pluginId: "dashboard",
            priority: 30,
            visibility: "public",
            status: "available",
          },
        ],
      }),
      indexStatus: {
        ready: true,
        activeEmbeddingJobs: 0,
        missingEmbeddings: 0,
        staleEmbeddings: 0,
        failedEmbeddings: 0,
        embeddableEntities: 12,
        embeddedEntities: 12,
      },
      widgets: {
        "content-pipeline:pipeline": {
          widget: {
            id: "pipeline",
            pluginId: "content-pipeline",
            title: "Publication Pipeline",
            group: "publishing",
            section: "primary",
            priority: 10,
            rendererName: "PipelineWidget",
            visibility: "public",
            digest: [
              { label: "Queued", value: "3", tone: "warn" },
              { label: "Published", value: "9", tone: "good" },
            ],
          },
          data: { summary: {}, items: [] },
        },
      },
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("Runtime vitals");
    expect(html).toContain("Semantic index");
    expect(html).toContain("Ready");
    // Vitals carry sub-lines and semantic status dots per the mockup.
    expect(html).toContain('class="vital-sub"');
    expect(html).toContain("vital-card--ok");
    // The index fraction uses the embeddable denominator, never all
    // entities (non-embeddable types would make the fraction lie).
    expect(html).toContain("12/12 embedded");
    expect(html).not.toContain("12/15");
    expect(html).toContain("Queued");
    expect(html).toContain("Published");
    expect(html).toContain('href="#publishing"');
    expect(html).toContain("open →");
    expect(html).toContain("Activity");
    expect(html).toContain(
      "No entity activity has been observed this session.",
    );
    // Overview is a fixed composition: no entity-summary or interactions
    // cards on the overview panel (they live in their group tabs).
    const overviewPanel = html.slice(
      html.indexOf('id="overview"'),
      html.indexOf('id="knowledge"'),
    );
    expect(overviewPanel).not.toContain("card--entity-summary");
    expect(overviewPanel).not.toContain("Ways to connect");
    expect(overviewPanel).toContain("overview-grid");
  });

  it("should render all tab panels in the no-JS HTML output", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {
        "content-pipeline:pipeline": {
          widget: {
            id: "pipeline",
            pluginId: "content-pipeline",
            title: "Publication Pipeline",
            group: "publishing",
            section: "primary",
            priority: 10,
            rendererName: "PipelineWidget",
            visibility: "public",
          },
          data: { summary: {}, items: [] },
        },
      },
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('id="overview"');
    expect(html).toContain('id="publishing"');
    expect(html).toContain("Entities");
    expect(html).toContain("Publication Pipeline");
    expect(html).toContain("dashboard-tabs-ready");
    expect(html).toContain('data-ui-tabs-default="overview"');
    expect(html).toContain('data-ui-tab="overview"');
    expect(html).toContain('data-ui-panel="publishing"');
    expect(html).toContain('aria-labelledby="dashboard-tab-publishing"');
    expect(html).not.toContain('hidden=""');
  });

  it("should render activity ledger events", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      activityLog: [
        {
          action: "updated",
          entityType: "note",
          entityId: "project-plan",
          timestamp: "2026-07-08T10:00:00.000Z",
        },
      ],
    };

    const html = renderDashboardPageHtml(input);

    // Ledger entries follow the mockup shape: time | glyph | what.
    expect(html).toContain('class="ledger-entry"');
    expect(html).toContain("updated");
    expect(html).toContain("note/project-plan");
  });

  it("should render a built-in System tab with runtime status", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({
        uptime: 100,
        embeddings: 0,
        endpoints: [
          {
            label: "Dashboard",
            url: "/dashboard",
            pluginId: "dashboard",
            priority: 30,
            visibility: "public",
          },
        ],
        daemons: [
          {
            name: "Directory Sync",
            pluginId: "directory-sync",
            status: "running",
            health: { status: "healthy" },
          },
        ],
      }),
      widgets: {},
      widgetScripts: [],
      jobProgress: [
        {
          id: "job-1",
          kind: "job",
          status: "processing",
          updatedAt: "2026-07-08T10:00:00.000Z",
          jobType: "site:build",
          progressLabel: "1/3",
        },
      ],
      indexStatus: {
        ready: true,
        activeEmbeddingJobs: 0,
        missingEmbeddings: 0,
        staleEmbeddings: 0,
        failedEmbeddings: 0,
      },
      directorySyncStatus: {
        syncPath: "/brain/content",
        isInitialized: true,
        watchEnabled: true,
        lastSync: "2026-07-08T09:30:00.000Z",
        totalFiles: 4,
        byEntityType: { note: 3, post: 1 },
        managementUrl: "/studio/workspaces/sync",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('href="#system"');
    expect(html).toContain('id="system"');
    // System tab splits into the mockup's instrument cards.
    expect(html).toContain("Semantic index");
    expect(html).toContain("Content sync");
    expect(html).toContain("Job queue");
    expect(html).toContain("1/1 healthy");
    expect(html).toContain("Semantic index · ready · 0 active");
    expect(html).toContain("Watching");
    expect(html).toContain("/brain/content");
    expect(html).toContain("4 files");
    expect(html).toContain("note 3, post 1");
    expect(html).toContain("last sync");
    expect(html).toContain("site:build");
    expect(html).toContain("1/3");
    // Job queue renders as a table with status pills.
    expect(html).toContain('class="jobs"');
    expect(html).toContain('class="status-pill status-pill--run"');
    // Content sync shows the mini write pipeline.
    expect(html).toContain('class="pipeline-mini"');
    expect(html).toContain("entity db");
    expect(html).toContain("exported");
    expect(html).toContain("committed");
    expect(html).toContain('href="/studio/workspaces/sync"');
    expect(html).toContain("Open in CMS");
  });

  it("should render the shared console strip from derived surfaces", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      dashboardPath: "/console",
      surfaces: [
        {
          id: "dashboard",
          label: "Dashboard",
          href: "/console",
          isActive: true,
        },
        { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
        { id: "cms", label: "CMS", href: "/cms", isActive: false },
      ],
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        principal: {
          displayName: "Yeehaa",
          role: "admin",
          permissionLevel: "admin",
        },
        hiddenWidgetCount: 0,
        loginUrl: "/login?return_to=%2Fconsole",
        logoutUrl: "/logout?return_to=%2Fconsole",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="console-strip"');
    expect(html).toContain('href="/console"');
    expect(html).toContain('href="/chat"');
    expect(html).toContain('href="/cms"');
    expect(html).toContain("Yeehaa");
    expect(html).toContain("Admin");
    // Mockup strip chrome: brandmark, command palette hint, session chip.
    expect(html).toContain("Console");
    expect(html).toContain("<kbd>⌘K</kbd>");
    // An authenticated session renders the plain chip (visitor modifier only exists
    // in the sheet, not in the markup).
    expect(html).toContain('class="session-chip"');
    expect(html).not.toContain('class="session-chip is-visitor"');
  });

  it("should render the visitor session chip as neutral", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        hiddenWidgetCount: 2,
        loginUrl: "/login?return_to=%2F",
        logoutUrl: "/logout?return_to=%2F",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="session-chip is-visitor"');
    expect(html).toContain("Sign in");
  });

  it("should omit surface links that are not registered", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      surfaces: [
        {
          id: "dashboard",
          label: "Dashboard",
          href: "/dashboard",
          isActive: true,
        },
        { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
      ],
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('href="/chat"');
    expect(html).not.toContain('href="/cms"');
    expect(html).not.toContain(">CMS<");
  });

  it("should default the climate to instrument and persist the toggle", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('data-climate="instrument"');
    expect(html).not.toContain("data-theme");
    // The toggle persists a console-wide preference all surfaces read.
    expect(html).toContain('localStorage.getItem("console.climate")');
    expect(html).toContain('localStorage.setItem("console.climate"');
  });

  it("should render the climate toggle in the strip, not the masthead", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        principal: {
          displayName: "Yeehaa",
          role: "admin",
          permissionLevel: "admin",
        },
        hiddenWidgetCount: 0,
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).not.toContain('class="scoreboard"');
    expect(html).not.toContain('class="masthead-action"');
    // The toggle is console chrome shared by every surface; it sits in the
    // strip between the command chip and the session chip.
    const strip = html.slice(
      html.indexOf('class="console-strip"'),
      html.indexOf("</header>"),
    );
    expect(strip).toContain('id="climateToggle"');
    expect(strip).toContain('class="climate-chip"');
    const masthead = html.slice(
      html.indexOf('class="masthead"'),
      html.indexOf('class="dashboard-tabs"'),
    );
    expect(masthead).not.toContain('id="climateToggle"');
    expect(html).toContain('href="/logout?return_to=%2Fdashboard"');
  });

  it("should render identity capsule and interaction entry points", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: {
        role: "Research brain",
        purpose: "Help collaborators navigate a network",
        values: ["clarity"],
      },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({
        uptime: 100,
        interactions: [
          {
            id: "a2a",
            label: "A2A",
            description: "Let other agents talk to this brain.",
            href: "/a2a",
            kind: "agent",
            pluginId: "a2a",
            priority: 25,
            visibility: "public",
            status: "available",
          },
        ],
      }),
      widgets: {},
      widgetScripts: [],
      authAccess: {
        hiddenWidgetCount: 1,
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    // Identity capsule: quoted role plus value chips (mockup composition).
    expect(html).toContain('class="card identity-capsule"');
    expect(html).toContain("“Research brain”");
    expect(html).toContain('class="value">clarity</span>');
    expect(html).toContain("Restricted access");
    // Interactions move to the System tab; entity summary to Knowledge.
    expect(html).toContain("Ways to connect");
    expect(html).toContain("Let other agents talk to this brain.");
    expect(html).toContain('href="https://brain.test/a2a"');
    expect(html.indexOf("Restricted access")).toBeLessThan(
      html.indexOf('id="knowledge"'),
    );
    expect(html.indexOf('id="knowledge"')).toBeLessThan(
      html.indexOf("Ways to connect"),
    );
  });

  it("should give content-heavy widgets a wide card by default", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {
        "swot:swot": {
          widget: {
            id: "swot",
            pluginId: "swot",
            group: "network",
            title: "SWOT",
            section: "secondary",
            priority: 10,
            rendererName: "SwotWidget",
            visibility: "public",
          },
          data: { status: "ready" },
        },
        "agent-discovery:network": {
          widget: {
            id: "network",
            pluginId: "agent-discovery",
            group: "network",
            title: "Agent Network",
            section: "secondary",
            priority: 11,
            rendererName: "AgentNetworkWidget",
            visibility: "public",
          },
          data: { status: "ready" },
        },
        "content-pipeline:pipeline": {
          widget: {
            id: "pipeline",
            pluginId: "content-pipeline",
            group: "publishing",
            title: "Content Pipeline",
            section: "secondary",
            priority: 12,
            rendererName: "PipelineWidget",
            visibility: "public",
          },
          data: { summary: {}, items: [] },
        },
        "stats:tiny": {
          widget: {
            id: "tiny",
            pluginId: "stats",
            group: "system",
            title: "Tiny Stats",
            section: "secondary",
            priority: 13,
            rendererName: "StatsWidget",
            visibility: "public",
          },
          data: { ok: true },
        },
      },
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html.match(/class="card widget-card--wide"/g)).toHaveLength(3);
    expect(html).toContain(
      '<article class="card widget-card--wide"><div class="card-head"><span class="card-title">Content Pipeline</span>',
    );
    expect(html).toContain(
      '<article class="card"><div class="card-head"><span class="card-title">Tiny Stats</span>',
    );
  });

  it("renders the pipeline widget as a wide read-only digest", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {
        "content-pipeline:pipeline": {
          widget: {
            id: "pipeline",
            pluginId: "content-pipeline",
            title: "Publication Pipeline",
            group: "publishing",
            section: "primary",
            priority: 10,
            rendererName: "PipelineWidget",
            visibility: "public",
          },
          data: {
            summary: {
              draft: 1,
              queued: 1,
              generating: 1,
              failed: 1,
              published: 3,
              needsOperator: 2,
            },
            queue: [
              {
                entityId: "q1",
                entityType: "post",
                title: "Domain as identity",
                position: 1,
                queuedAt: "2026-07-14T08:00:00.000Z",
                destination: "website",
              },
            ],
            generating: [
              {
                id: "job-8412",
                label: "og-image",
                target: "post/domain-as-identity",
                status: "processing",
              },
            ],
            failures: [
              {
                entityId: "f1",
                entityType: "newsletter",
                title: "Broken send",
                error: "Provider rejected sender",
                retryCount: 2,
              },
            ],
            publishableEntityTypes: ["newsletter", "post"],
            managementUrl: "/cms/workspaces/publishing",
          },
        },
      },
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="pipeline-digest"');
    expect(html).toContain("Queued");
    expect(html).toContain("Generating");
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Published");
    expect(html).toContain("Broken send");
    expect(html).toContain("Provider rejected sender");
    expect(html).toContain('href="/cms/workspaces/publishing"');
    expect(html).toContain("Open in CMS");
    expect(html).not.toContain('class="board"');
    expect(html).not.toContain("Domain as identity");
    expect(html).not.toContain("post/domain-as-identity");
  });

  it("omits the CMS link when no publishing workspace registered", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {
        "content-pipeline:pipeline": {
          widget: {
            id: "pipeline",
            pluginId: "content-pipeline",
            title: "Publication Pipeline",
            group: "publishing",
            section: "primary",
            priority: 10,
            rendererName: "PipelineWidget",
            visibility: "public",
          },
          data: {
            summary: {
              draft: 0,
              queued: 0,
              generating: 0,
              failed: 0,
              published: 4,
              needsOperator: 0,
            },
            queue: [],
            generating: [],
            failures: [],
            publishableEntityTypes: ["post"],
          },
        },
      },
      widgetScripts: [],
    };

    const html = renderDashboardPageHtml(input);
    expect(html).toContain('class="pipeline-digest"');
    expect(html).not.toContain("Open in CMS");
    expect(html).not.toContain('href="undefined"');
  });

  it("should render plugin-owned custom widgets and inject their scripts", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: {
        role: "Research brain",
        purpose: "Help the operator navigate a network",
        values: ["clarity"],
      },
      profile: {
        name: "Test Owner",
        description: "A dashboard render test",
      },
      appInfo: createMockAppInfo({
        uptime: 100,
        entities: 4,
        entityCounts: [
          { entityType: "agent", count: 2 },
          { entityType: "skill", count: 2 },
        ],
      }),
      widgets: {
        "custom:test-widget": {
          widget: {
            id: "test-widget",
            pluginId: "custom",
            group: "knowledge",
            title: "Custom",
            section: "secondary",
            priority: 15,
            rendererName: "TestCustomWidget",
            visibility: "public",
          },
          component: TestCustomWidget,
          data: {
            message: "hello from plugin",
          },
        },
      },
      widgetScripts: ["window.__customWidgetBoot = 'ready';"],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("data-test-custom-widget");
    expect(html).toContain('data-plugin-id="custom"');
    expect(html).toContain('data-widget-id="test-widget"');
    expect(html).toContain('data-instance-id="widget-custom-test-widget"');
    expect(html).toContain("hello from plugin");
    expect(html).toContain("window.__customWidgetBoot = 'ready';");
  });
});
