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
    const stableHtml = html.replace(
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g,
      "<rendered-at>",
    );
    expect(
      normalizeRendererHtml(stableHtml, { ignoreImagePreloads: true }),
    ).toMatchSnapshot();
  });

  it("keeps the same public card for a signed-in role", () => {
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
    expect(html).toContain("Mira");
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
    expect(tabIds).toEqual(["overview", "knowledge", "network"]);
    expect(html).not.toContain('href="#publishing"');
    expect(html).not.toContain('href="#system"');
    expect(html).not.toContain('data-dashboard-group="publishing"');
    expect(html).not.toContain('data-dashboard-group="system"');
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
          },
        },
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('data-card-map="knowledge"');
    expect(html).toContain('class="knowledge-map-field map-field"');
    expect(html).toContain("Trust networks");
    expect(html).toContain('data-card-map="network"');
    expect(html).toContain('class="proximity-map-field map-field"');
    expect(html).toContain("Agent One");
  });

  it("should wrap the console chrome and panels in a single frame", () => {
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
    // The strip pins to the top of the viewport on every surface — it
    // lives OUTSIDE the frame so it never shifts between dashboard, chat,
    // and the Studio. Masthead, tab bar, and panels stay inside the frame.
    const frameIndex = html.indexOf('class="frame"');
    expect(frameIndex).toBeGreaterThan(-1);
    expect(html.indexOf('class="console-strip"')).toBeLessThan(frameIndex);
    expect(frameIndex).toBeLessThan(html.indexOf('class="masthead"'));
    expect(frameIndex).toBeLessThan(html.indexOf('class="dashboard-tabs"'));
    expect(frameIndex).toBeLessThan(
      html.indexOf('class="dashboard-tab-panels"'),
    );
  });

  it("renders public widget protocol contributions as Overview cards", () => {
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

    expect(overviewPanel).toContain("Public releases");
    expect(overviewPanel).toContain("Published");
    expect(html).not.toContain('href="#publishing"');
    expect(html).not.toContain("Runtime vitals");
    expect(html).not.toContain("Activity");
  });

  it("renders all three card panels in the no-JS HTML output", () => {
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
    expect(html).toContain("dashboard-tabs-ready");
    expect(html).toContain('data-ui-tabs-default="overview"');
    expect(html).toContain('data-ui-panel="knowledge"');
    expect(html).toContain('data-ui-panel="network"');
    expect(html).not.toContain('hidden=""');
  });

  it("omits operator activity and runtime diagnostics from the card", () => {
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

    expect(html).not.toContain("Private daemon");
    expect(html).not.toContain("41 embeddings");
    expect(html).not.toContain('href="#system"');
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
        { id: "studio", label: "Studio", href: "/studio", isActive: false },
      ],
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
        loginUrl: "/login?return_to=%2Fconsole",
        logoutUrl: "/logout?return_to=%2Fconsole",
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('class="console-strip"');
    expect(html).toContain('href="/console"');
    expect(html).toContain('href="/chat"');
    expect(html).toContain('href="/studio"');
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
      authAccess: {
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
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain('href="/chat"');
    expect(html).not.toContain('href="/studio"');
    expect(html).not.toContain(">Studio<");
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

  it("should render the climate toggle in the strip, not the masthead", () => {
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
    expect(html).toContain('class="public-values"');
    expect(html).toContain("clarity");
    expect(html).not.toContain("Restricted access");
    expect(html).toContain("Ways to connect");
    expect(html).toContain("Let other agents talk to this brain.");
    expect(html).toContain('href="https://brain.test/a2a"');
    expect(html.indexOf("Ways to connect")).toBeLessThan(
      html.indexOf('id="knowledge"'),
    );
  });
});
