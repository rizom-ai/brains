/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import type { JSX } from "preact";
import { createMockAppInfo } from "@brains/test-utils";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "../src/dashboard-page";

function TestCustomWidget({ data }: { data: unknown }): JSX.Element {
  const value =
    typeof data === "object" && data !== null && "message" in data
      ? String((data as { message: unknown }).message)
      : "missing";
  return <div data-test-custom-widget>{value}</div>;
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
      operatorAccess: {
        isOperator: false,
        hiddenWidgetCount: 1,
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("Operator access");
    expect(html).toContain("1 private console widget is hidden.");
    expect(html).toContain('href="/login?return_to=%2Fdashboard"');
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
            needsOperator: 2,
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
  });

  it("should render overview vitals and digest lines from widgets", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({
        uptime: 100,
        entities: 12,
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
    expect(html).toContain("Queued");
    expect(html).toContain("Published");
    expect(html).toContain('href="#publishing"');
    expect(html).toContain("Activity ledger");
    expect(html).toContain(
      "No entity activity has been observed this session.",
    );
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

    expect(html).toContain("Activity ledger");
    expect(html).toContain("updated");
    expect(html).toContain("note:project-plan");
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
      indexReady: true,
      directorySyncStatus: {
        syncPath: "/brain/content",
        isInitialized: true,
        watchEnabled: true,
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('href="#system"');
    expect(html).toContain('id="system"');
    expect(html).toContain("System health");
    expect(html).toContain("1/1 healthy");
    expect(html).toContain("Job queue");
    expect(html).toContain("1 recent");
    expect(html).toContain("<dt>Semantic index</dt><dd>Ready</dd>");
    expect(html).toContain("Watching");
    expect(html).toContain("/brain/content");
    expect(html).toContain("site:build");
    expect(html).toContain("1/3");
  });

  it("should render the shared console strip", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      dashboardPath: "/operator",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      operatorAccess: {
        isOperator: true,
        hiddenWidgetCount: 0,
        loginUrl: "/login?return_to=%2Foperator",
        logoutUrl: "/logout?return_to=%2Foperator",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="console-strip"');
    expect(html).toContain('href="/operator"');
    expect(html).toContain('href="/chat"');
    expect(html).toContain('href="/cms"');
    expect(html).toContain("Operator");
  });

  it("should not render the masthead scoreboard", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetScripts: [],
      operatorAccess: {
        isOperator: true,
        hiddenWidgetCount: 0,
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).not.toContain('class="scoreboard"');
    expect(html).not.toContain("operator · sign out");
    expect(html).toContain('class="masthead-action"');
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
      operatorAccess: {
        isOperator: false,
        hiddenWidgetCount: 1,
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("Identity capsule");
    expect(html).toContain("Values: clarity");
    expect(html).toContain("Research brain");
    expect(html).toContain("Ways to connect");
    expect(html).toContain("Operator access");
    expect(html).toContain("Let other agents talk to this brain.");
    expect(html).toContain('href="https://brain.test/a2a"');
    expect(html.indexOf("Ways to connect")).toBeLessThan(
      html.indexOf("Operator access"),
    );
    expect(html.indexOf("Operator access")).toBeLessThan(
      html.indexOf("Entities"),
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
      '<article class="card"><div class="card-head"><span class="card-title">Tiny Stats</span>',
    );
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
    expect(html).toContain("hello from plugin");
    expect(html).toContain("window.__customWidgetBoot = 'ready';");
  });
});
