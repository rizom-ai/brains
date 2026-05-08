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
  it("should render an operator sign-in prompt when operator widgets are hidden", () => {
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
      },
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("Operator layer");
    expect(html).toContain("1 operator widget is hidden.");
    expect(html).toContain('href="/login?return_to=%2Fdashboard"');
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
