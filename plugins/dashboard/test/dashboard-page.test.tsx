/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import type { JSX } from "preact";
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
      appInfo: {
        model: "test-model",
        version: "1.0.0",
        uptime: 100,
        entities: 0,
        embeddings: 0,
        ai: {
          model: "test-model",
          embeddingModel: "test-embedding-model",
        },
        daemons: [],
        endpoints: [],
      },
      entityCounts: [],
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

  it("should render operator sign-out link when signed in", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: {
        model: "test-model",
        version: "1.0.0",
        uptime: 100,
        entities: 0,
        embeddings: 0,
        ai: {
          model: "test-model",
          embeddingModel: "test-embedding-model",
        },
        daemons: [],
        endpoints: [],
      },
      entityCounts: [],
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

    expect(html).toContain("operator · sign out");
    expect(html).toContain('href="/logout?return_to=%2Fdashboard"');
  });

  it("should render identity sections and interaction entry points", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: {
        role: "Research brain",
        purpose: "Help collaborators navigate a network",
        values: ["clarity"],
      },
      profile: { name: "Test Owner" },
      appInfo: {
        model: "test-model",
        version: "1.0.0",
        uptime: 100,
        entities: 0,
        embeddings: 0,
        ai: {
          model: "test-model",
          embeddingModel: "test-embedding-model",
        },
        daemons: [],
        endpoints: [],
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
      },
      entityCounts: [],
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

    expect(html).toContain("Identity");
    expect(html).toContain("Role");
    expect(html).toContain("Purpose");
    expect(html).toContain("Values");
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
      appInfo: {
        model: "test-model",
        version: "1.0.0",
        uptime: 100,
        entities: 4,
        embeddings: 0,
        ai: {
          model: "test-model",
          embeddingModel: "test-embedding-model",
        },
        daemons: [],
        endpoints: [],
      },
      entityCounts: [
        { entityType: "agent", count: 2 },
        { entityType: "skill", count: 2 },
      ],
      widgets: {
        "custom:test-widget": {
          widget: {
            id: "test-widget",
            pluginId: "custom",
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
