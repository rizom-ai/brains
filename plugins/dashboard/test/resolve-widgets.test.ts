import { describe, expect, it } from "bun:test";
import { createMockLogger } from "@brains/test-utils";
import { resolveWidgetsForRender } from "../src/render/resolve-widgets";
import { DashboardWidgetRegistry } from "../src/widget-registry";
import type { WidgetData } from "../src/widget-schema";

function createWidgetData(pluginId: string, id: string): WidgetData {
  return {
    widget: {
      id,
      pluginId,
      title: id,
      group: "knowledge",
      priority: 10,
      section: "primary",
      rendererName: "StatsWidget",
      visibility: "public",
    },
    data: { ok: true },
  };
}

describe("resolveWidgetsForRender", () => {
  it("deduplicates assets belonging to visible widgets", () => {
    const registry = new DashboardWidgetRegistry(createMockLogger());
    const sharedStyles = ".shared-widget { display: grid; }";
    const sharedScript = "window.__sharedWidget = true;";

    for (const id of ["one", "two", "hidden"]) {
      registry.register({
        id,
        pluginId: "test-plugin",
        title: id,
        group: "knowledge",
        rendererName: "StatsWidget",
        clientStyles: id === "hidden" ? ".hidden-widget {}" : sharedStyles,
        clientScript:
          id === "hidden" ? "window.__hidden = true;" : sharedScript,
        dataProvider: async () => ({}),
      });
    }

    const resolved = resolveWidgetsForRender(
      {
        "test-plugin:one": createWidgetData("test-plugin", "one"),
        "test-plugin:two": createWidgetData("test-plugin", "two"),
      },
      registry,
    );

    expect(resolved.widgetStyles).toEqual([sharedStyles]);
    expect(resolved.widgetScripts).toEqual([sharedScript]);
    expect(resolved.widgetStyles).not.toContain(".hidden-widget {}");
    expect(resolved.widgetScripts).not.toContain("window.__hidden = true;");
  });

  it("returns no assets without a registry", () => {
    const resolved = resolveWidgetsForRender(
      { "test-plugin:one": createWidgetData("test-plugin", "one") },
      null,
    );

    expect(resolved.widgetStyles).toEqual([]);
    expect(resolved.widgetScripts).toEqual([]);
  });
});
