import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { DashboardPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";

describe("DashboardPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: DashboardPlugin;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    plugin = new DashboardPlugin();
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("Plugin Registration", () => {
    it("should register plugin with correct metadata", () => {
      expect(plugin.id).toBe("dashboard");
      expect(plugin.type).toBe("service");
      expect(plugin.version).toBeDefined();
    });

    it("should expose no tools", async () => {
      const capabilities = await harness.installPlugin(new DashboardPlugin());
      expect(capabilities.tools).toHaveLength(0);
    });
  });

  describe("Widget Registration via Messaging", () => {
    it("should register widget when receiving dashboard:register-widget message", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 42 }),
      });

      const registry = plugin.getWidgetRegistry();
      expect(registry).toBeDefined();
      expect(registry?.size).toBe(1);
      const widgets = registry?.list() ?? [];
      expect(widgets).toHaveLength(1);
      expect(widgets[0]).toMatchObject({
        id: "test-widget",
        pluginId: "test-plugin",
      });
    });

    it("should unregister widget when receiving dashboard:unregister-widget message", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 42 }),
      });

      await harness.sendMessage("dashboard:unregister-widget", {
        pluginId: "test-plugin",
        widgetId: "test-widget",
      });

      const registry = plugin.getWidgetRegistry();
      expect(registry?.size).toBe(0);
    });

    it("should unregister all widgets for a plugin", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "widget-1",
        pluginId: "test-plugin",
        title: "Widget 1",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      });

      await harness.sendMessage("dashboard:register-widget", {
        id: "widget-2",
        pluginId: "test-plugin",
        title: "Widget 2",
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
        dataProvider: async () => ({}),
      });

      const registry = plugin.getWidgetRegistry();
      expect(registry?.size).toBe(2);

      await harness.sendMessage("dashboard:unregister-widget", {
        pluginId: "test-plugin",
      });

      expect(registry?.size).toBe(0);
    });
  });
});
