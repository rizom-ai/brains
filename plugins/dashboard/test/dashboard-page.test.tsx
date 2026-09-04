import { describe, expect, it } from "bun:test";
import { createMockAppInfo, normalizeRendererHtml } from "@brains/test-utils";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "../src/dashboard-page";

describe("renderDashboardPageHtml", () => {
  it("renders the anonymous card without restricted-access affordances", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      authAccess: {
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).not.toContain("Restricted access");
    expect(html).not.toContain("private console widget");
    expect(html).toContain('href="/login?return_to=%2Fdashboard"');
    expect(html).toContain("What is this");
    expect(html).toContain('href="#knowledge"');
    expect(html).toContain('href="#network"');
    const stableHtml = html
      .replace(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g,
        "<rendered-at-iso>",
      )
      .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, "<rendered-at>")
      .replace(
        /(<style[^>]*data-dashboard-theme[^>]*>)[\s\S]*?(<\/style>)/,
        "$1<theme-css>$2",
      );
    expect(
      normalizeRendererHtml(stableHtml, { ignoreImagePreloads: true }),
    ).toMatchSnapshot();
  });

  it("keeps the public page independent of any supplied session identity", () => {
    const input: DashboardRenderInput = {
      title: "Test Brain",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Brain" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      authAccess: {
        principal: {
          displayName: "Mira",
          role: "trusted",
          permissionLevel: "trusted",
        },
        loginUrl: "/login",
        logoutUrl: "/logout",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).not.toContain("Restricted access");
    expect(html).not.toContain("private console widget");
    expect(html).not.toContain("Mira");
    expect(html).toContain("What is this");
  });

  it("keeps People administration out of the monitoring dashboard", () => {
    const adminInput: DashboardRenderInput = {
      title: "Test Brain",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Brain" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      authAccess: {
        principal: {
          displayName: "Yeehaa",
          role: "admin",
          permissionLevel: "admin",
        },
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
      themeCSS: ":root { --color-accent: #c6ff00; }",
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain(":root { --color-accent: #c6ff00; }");
    expect(html.indexOf("--color-accent: #c6ff00")).toBeLessThan(
      html.indexOf("data-dashboard-styles"),
    );
  });

  it("should reference host-owned client assets in deterministic cascade order", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      themeCSS: ":root { --private-theme: lime; }",
      assetUrls: {
        themeStyles: "/dashboard/assets/theme.hash.css",
        dashboardStyles: "/dashboard/assets/dashboard.hash.css",
        dashboardScript: "/dashboard/assets/dashboard.hash.js",
      },
    };

    const html = renderDashboardPageHtml(input);
    const themeIndex = html.indexOf("/dashboard/assets/theme.hash.css");
    const dashboardIndex = html.indexOf("/dashboard/assets/dashboard.hash.css");

    expect(themeIndex).toBeGreaterThan(-1);
    expect(themeIndex).toBeLessThan(dashboardIndex);
    expect(html).toContain("/dashboard/assets/dashboard.hash.js");
    expect(html).not.toContain("--private-theme");
    expect(html).not.toContain("data-dashboard-widget-styles");
    expect(html).not.toContain("data-dashboard-widget-script");
  });

  it("renders exactly the public card tabs regardless of widget groups", () => {
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
            rendererName: "DeclarativeOperatorWidget",
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
            rendererName: "DeclarativeOperatorWidget",
            visibility: "public",
          },
          data: { items: [] },
        },
      },
    };

    const html = renderDashboardPageHtml(input);

    const tabIds = [...html.matchAll(/data-dashboard-tab-link="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(tabIds).toEqual(["overview", "knowledge", "network", "system"]);
    expect(html).not.toContain('href="#publishing"');
    expect(html).toContain('href="#system"');
    expect(html).not.toContain('data-dashboard-group="publishing"');
    expect(html).toContain('data-dashboard-group="system"');
  });

  it("renders the public identity, contacts, holdings, and skills card", () => {
    const input: DashboardRenderInput = {
      title: "Rizom",
      baseUrl: "https://brain.test",
      character: {
        role: "A shared memory keeper",
        purpose: "Connect what this network learns.",
        values: ["reciprocity", "agency"],
      },
      profile: {
        name: "Rizom",
        organization: "Rizom Cooperative",
        description: "The shared brain of the rizom network.",
        website: "https://rizom.example",
        email: "hello@rizom.example",
      },
      appInfo: createMockAppInfo({
        uptime: 100,
        entities: 7,
        entityCounts: [
          { entityType: "post", count: 3 },
          { entityType: "note", count: 4 },
        ],
        interactions: [
          {
            id: "chat",
            label: "Chat",
            description: "Ask about anything held in public scope.",
            href: "/chat",
            kind: "human",
            pluginId: "web-chat",
            priority: 10,
            visibility: "public",
            status: "available",
          },
        ],
      }),
      widgets: {
        "agent-discovery:skills": {
          widget: {
            id: "skills",
            pluginId: "agent-discovery",
            title: "Skills",
            group: "network",
            section: "sidebar",
            priority: 20,
            rendererName: "DeclarativeOperatorWidget",
            visibility: "public",
          },
          data: {
            view: {
              blocks: [
                {
                  type: "list",
                  id: "skills",
                  empty: "No skills advertised yet.",
                  items: [{ id: "shared-context", title: "Shared context" }],
                },
              ],
            },
          },
        },
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("What is this");
    expect(html).toContain("A shared memory keeper");
    expect(html).toContain("belongs to them");
    expect(html).toContain("public scope");
    expect(html).toContain("Ways to connect");
    expect(html).toContain('href="https://brain.test/chat"');
    expect(html).toContain('href="https://rizom.example/"');
    expect(html).toContain('href="mailto:hello@rizom.example"');
    expect(html).toContain("What I hold");
    expect(html).toContain("Posts");
    expect(html).toContain("Notes");
    expect(html).toContain("Skills");
    expect(html).toContain("Shared context");
  });

  it("renders source-fed knowledge and proximity maps in their fixed panels", () => {
    const input: DashboardRenderInput = {
      title: "Rizom",
      baseUrl: "https://brain.test",
      character: { role: "Brain", purpose: "Connect knowledge", values: [] },
      profile: { name: "Rizom" },
      appInfo: createMockAppInfo({
        uptime: 100,
        entities: 2,
        entityCounts: [{ entityType: "post", count: 2 }],
      }),
      widgets: {
        "topics:topics-knowledge-map": {
          widget: {
            id: "topics-knowledge-map",
            pluginId: "topics",
            title: "Knowledge Map",
            group: "knowledge",
            section: "primary",
            priority: 30,
            rendererName: "DeclarativeOperatorWidget",
            visibility: "public",
          },
          data: {
            view: {
              blocks: [
                {
                  type: "spatial",
                  layout: "cartesian",
                  id: "knowledge-map",
                  label: "Knowledge map",
                  description: "Public knowledge arranged by topic.",
                  points: [
                    {
                      id: "post:field-notes",
                      label: "Field notes",
                      category: "published",
                      x: 0.25,
                      y: 0.4,
                      zoneId: "topic:trust",
                      tone: "good",
                    },
                  ],
                  zones: [
                    {
                      id: "topic:trust",
                      label: "Trust networks",
                      x: 0.3,
                      y: 0.42,
                      memberIds: ["post:field-notes"],
                    },
                  ],
                  legend: [{ label: "Published", tone: "good" }],
                },
              ],
            },
            source: { points: [{ id: "field-notes" }] },
          },
        },
        "agent-discovery:agent-proximity": {
          widget: {
            id: "agent-proximity",
            pluginId: "agent-discovery",
            title: "Agent Proximity",
            group: "network",
            section: "primary",
            priority: 35,
            rendererName: "DeclarativeOperatorWidget",
            visibility: "public",
          },
          data: {
            view: {
              blocks: [
                {
                  type: "spatial",
                  layout: "radial",
                  id: "agent-proximity",
                  label: "Agent proximity map",
                  description: "Public agents by semantic distance.",
                  centerLabel: "Brain identity",
                  centerKind: "identity",
                  points: [
                    {
                      id: "agent-one",
                      label: "Agent One",
                      kind: "person",
                      status: "approved",
                      distance: 0.35,
                      bearing: 55,
                      tone: "good",
                    },
                  ],
                  strata: [
                    { id: "near", label: "Near", maxDistance: 0.5 },
                    { id: "far", label: "Far", maxDistance: 1 },
                  ],
                  legend: [{ label: "Approved", tone: "good" }],
                },
              ],
            },
            source: { nodes: [{ id: "agent-one" }] },
          },
        },
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('data-card-map="knowledge"');
    expect(html).toContain('class="knowledge-map-field map-field"');
    expect(html).toContain('class="knowledge-atlas-summary"');
    expect(html).toContain("mapped sources");
    expect(html).toContain("Territories");
    expect(html).toContain("Trust networks");
    expect(html).toContain('data-knowledge-zone="topic:trust"');
    expect(html).toContain('data-knowledge-zone-ref="topic:trust"');
    expect(html).not.toContain("knowledge-point-glow");
    expect(html).toContain('data-card-map="network"');
    expect(html).toContain('class="proximity-map-field map-field"');
    expect(html).toContain("Agent One");
  });

  it("places the public masthead outside the dashboard content frame", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="frame"');
    expect(html).toContain('class="canvas"');
    // Public identity and entry actions sit outside the content card; the
    // obsolete cross-product console switcher is absent.
    const frameIndex = html.indexOf('class="frame"');
    expect(frameIndex).toBeGreaterThan(-1);
    expect(html.indexOf('class="public-header"')).toBeLessThan(frameIndex);
    expect(html).not.toContain('class="console-strip"');
    expect(frameIndex).toBeLessThan(html.indexOf('class="masthead"'));
    expect(frameIndex).toBeLessThan(html.indexOf('class="dashboard-tabs"'));
    expect(frameIndex).toBeLessThan(
      html.indexOf('class="dashboard-tab-panels"'),
    );
    expect(html).toMatch(
      /<div class="canvas">.*<footer class="colophon">.*<\/footer><\/div><\/div><\/main>/s,
    );
  });

  it("keeps protocol data behind the mockup's fixed Overview composition", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {
        "publisher:release": {
          widget: {
            id: "release",
            pluginId: "publisher",
            title: "Public releases",
            group: "publishing",
            section: "primary",
            priority: 10,
            rendererName: "DeclarativeOperatorWidget",
            visibility: "public",
          },
          data: {
            view: {
              blocks: [
                {
                  type: "stats",
                  items: [{ label: "Published", value: 9, tone: "good" }],
                },
              ],
            },
          },
        },
      },
    };

    const html = renderDashboardPageHtml(input);
    const overviewPanel = html.slice(
      html.indexOf('id="overview"'),
      html.indexOf('id="knowledge"'),
    );

    expect(overviewPanel).not.toContain("Public releases");
    expect(overviewPanel).not.toContain("Published");
    expect(overviewPanel.match(/<article class="card public-/g)).toHaveLength(
      4,
    );
    expect(html).not.toContain('href="#publishing"');
    expect(html).not.toContain("Runtime vitals");
    expect(html).not.toContain("Activity");
  });

  it("renders all four card panels in the no-JS HTML output", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('id="overview"');
    expect(html).toContain('id="knowledge"');
    expect(html).toContain('id="network"');
    expect(html).toContain('id="system"');
    expect(html).toContain("dashboard-tabs-ready");
    expect(html).toContain('data-ui-tabs-default="overview"');
    expect(html).toContain('data-ui-panel="knowledge"');
    expect(html).toContain('data-ui-panel="network"');
    expect(html).toContain('data-ui-panel="system"');
    expect(html).not.toContain('hidden=""');
  });

  it("shows public system metadata without private runtime diagnostics", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({
        uptime: 100,
        embeddings: 41,
        daemons: [
          {
            name: "Private daemon",
            pluginId: "private-daemon",
            status: "running",
          },
        ],
      }),
      widgets: {},
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('href="#system"');
    expect(html).toContain("System health");
    expect(html).toContain("Runtime");
    expect(html).toContain("public metadata");
    expect(html).not.toContain("Private daemon");
    expect(html).not.toContain("41 embeddings");
  });

  it("renders public identity and entry actions without product tabs", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      dashboardPath: "/console",
      askHref: "/ask",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      authAccess: {
        loginUrl: "/login?return_to=%2Fstudio",
        logoutUrl: "/logout?return_to=%2Fconsole",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="public-header"');
    expect(html).toContain('href="/console"');
    expect(html).toContain('href="/ask"');
    expect(html).toContain('href="/login?return_to=%2Fstudio"');
    expect(html).not.toContain('class="console-strip"');
    expect(html).not.toContain('class="surface-nav"');
    expect(html).not.toContain("<kbd>⌘K</kbd>");
  });

  it("renders one explicit public sign-in action", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      authAccess: {
        loginUrl: "/login?return_to=%2F",
        logoutUrl: "/logout?return_to=%2F",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="public-header-sign-in"');
    expect(html).toContain('href="/login?return_to=%2F"');
    expect(html).not.toContain('class="session-chip');
  });

  it("omits Ask when no public conversation door is registered", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
    };

    const html = renderDashboardPageHtml(input);

    expect(html).not.toContain('class="public-header-ask"');
    expect(html).not.toContain('href="/ask"');
  });

  it("should align the initial theme mode and apply stored climate before styles", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      themeCSS: ":root { --color-bg: black; }",
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('data-climate="instrument"');
    expect(html).toContain('data-theme="dark"');
    // The toggle persists a console-wide preference all surfaces read and
    // maps paper onto the injected theme's light semantic tokens.
    const climateScriptIndex = html.indexOf(
      'localStorage.getItem("console.climate")',
    );
    expect(climateScriptIndex).toBeGreaterThan(-1);
    expect(climateScriptIndex).toBeLessThan(
      html.indexOf("data-dashboard-theme"),
    );
    expect(html).toContain(
      'root.setAttribute("data-theme", climate === "paper" ? "light" : "dark")',
    );
    expect(html).toContain('localStorage.setItem("console.climate"');
  });

  it("renders the climate toggle in the public masthead", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      authAccess: {
        principal: {
          displayName: "Yeehaa",
          role: "admin",
          permissionLevel: "admin",
        },
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).not.toContain('class="scoreboard"');
    expect(html).not.toContain('class="masthead-action"');
    const publicHeader = html.slice(
      html.indexOf('class="public-header"'),
      html.indexOf("</header>"),
    );
    expect(publicHeader).toContain('id="climateToggle"');
    expect(publicHeader).toContain('class="public-header-climate"');
    const masthead = html.slice(
      html.indexOf('class="masthead"'),
      html.indexOf('class="dashboard-tabs"'),
    );
    expect(masthead).not.toContain('id="climateToggle"');
    expect(html).toContain('href="/login?return_to=%2Fdashboard"');
  });

  it("renders identity and interaction entry points on Overview", () => {
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
      authAccess: {
        loginUrl: "/login?return_to=%2Fdashboard",
        logoutUrl: "/logout?return_to=%2Fdashboard",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="card public-identity-card"');
    expect(html).toContain("Research brain");
    expect(html).not.toContain('class="public-values"');
    expect(html).not.toContain(">clarity</span>");
    expect(html).not.toContain("Restricted access");
    expect(html).toContain("Ways to connect");
    expect(html).toContain("Let other agents talk to this brain.");
    expect(html).toContain('href="https://brain.test/a2a"');
    expect(html.indexOf("Ways to connect")).toBeLessThan(
      html.indexOf('id="knowledge"'),
    );
  });
});
