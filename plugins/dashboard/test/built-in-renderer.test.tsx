/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { createMockAppInfo, createSilentLogger } from "@brains/test-utils";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "../src/dashboard-page";
import { DashboardWidgetRegistry } from "../src/widget-registry";
import { resolveWidgetsForRender } from "../src/render/resolve-widgets";
import { WidgetCard } from "../src/render/widget-card";
import type { WidgetData } from "../src/widget-schema";

/* A first-party widget may draw itself. Its component lives in the registry,
   never in the widget payload, so widget data stays serializable and only the
   host can hand a component to the page. */

const RENDERER_NAME = "DeclarativeOperatorWidget" as const;

function widgetData(data: unknown): WidgetData {
  return {
    widget: {
      id: "knowledge-map",
      pluginId: "topics",
      title: "Knowledge Map",
      group: "knowledge",
      priority: 30,
      section: "primary",
      rendererName: RENDERER_NAME,
      visibility: "public",
    },
    data,
  };
}

function registryWithMap(): DashboardWidgetRegistry {
  const registry = new DashboardWidgetRegistry(createSilentLogger());
  registry.register({
    id: "knowledge-map",
    pluginId: "topics",
    title: "Knowledge Map",
    group: "knowledge",
    section: "primary",
    rendererName: RENDERER_NAME,
    dataProvider: async () => ({}),
    renderer: {
      component: ({ data }) => (
        <div class="kmap-field">{JSON.stringify(data)}</div>
      ),
      clientStyles: ".kmap-field { display: block; }",
    },
  });
  return registry;
}

describe("built-in widget renderers", () => {
  it("reunites a widget's data with the renderer its plugin registered", () => {
    const resolved = resolveWidgetsForRender(
      {
        "topics:knowledge-map": widgetData({ view: {}, source: { zones: 2 } }),
      },
      registryWithMap(),
    );

    const widget = resolved.widgets["topics:knowledge-map"];
    if (!widget) throw new Error("widget was not resolved");
    expect(typeof widget.component).toBe("function");
    expect(resolved.widgetStyles).toEqual([".kmap-field { display: block; }"]);
  });

  it("draws the component with its own data instead of the declarative body", () => {
    const resolved = resolveWidgetsForRender(
      {
        "topics:knowledge-map": widgetData({
          view: { blocks: [] },
          source: { zones: 2 },
        }),
      },
      registryWithMap(),
    );
    const widget = resolved.widgets["topics:knowledge-map"];
    if (!widget) throw new Error("widget was not resolved");

    const html = render(<WidgetCard widget={widget} />);

    expect(html).toContain("kmap-field");
    // The component sees its domain data, not the semantic envelope.
    expect(html).toContain("zones");
    expect(html).not.toContain("blocks");
    expect(html).not.toContain("operator-spatial");
  });

  it("leaves widgets without a renderer on the declarative body", () => {
    const registry = new DashboardWidgetRegistry(createSilentLogger());
    registry.register({
      id: "plain",
      pluginId: "fixture",
      title: "Plain",
      group: "knowledge",
      section: "primary",
      rendererName: RENDERER_NAME,
      dataProvider: async () => ({}),
    });

    const resolved = resolveWidgetsForRender(
      { "fixture:plain": widgetData({ view: { blocks: [] } }) },
      registry,
    );
    const widget = resolved.widgets["fixture:plain"];
    if (!widget) throw new Error("widget was not resolved");
    expect(widget.component).toBeUndefined();
    expect(resolved.widgetStyles).toEqual([]);
  });

  it("carries a renderer's styles and script into the page", () => {
    const input: DashboardRenderInput = {
      title: "Test Owner",
      baseUrl: "https://brain.test",
      character: { role: "", purpose: "", values: [] },
      profile: { name: "Test Owner" },
      appInfo: createMockAppInfo({ uptime: 100 }),
      widgets: {},
      widgetStyles: [".kmap-field { display: block; }"],
      widgetScripts: ["console.log('kmap')"],
    };

    const html = renderDashboardPageHtml(input);

    expect(html).toContain("data-dashboard-widget-styles");
    expect(html).toContain(".kmap-field { display: block; }");
    expect(html).toContain("data-dashboard-widget-script");
    expect(html).toContain("console.log('kmap')");
  });

  it("rejects a renderer whose component is not a function", () => {
    const registry = new DashboardWidgetRegistry(createSilentLogger());
    expect(() =>
      registry.register({
        id: "broken",
        pluginId: "fixture",
        title: "Broken",
        group: "knowledge",
        section: "primary",
        rendererName: RENDERER_NAME,
        dataProvider: async () => ({}),
        renderer: {
          component: "<svg />" as never,
        },
      }),
    ).toThrow();
  });
});
