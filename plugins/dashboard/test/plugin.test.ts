import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { DashboardPlugin } from "../src/plugin";
import { createServicePluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";

describe("DashboardPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let plugin: DashboardPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test-datadir" });
    plugin = new DashboardPlugin();
    capabilities = await harness.installPlugin(plugin);
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

    it("should provide expected tools", () => {
      expect(capabilities.tools).toBeDefined();
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("dashboard_get-data");
    });
  });

  describe("Widget Registration via Messaging", () => {
    it("should register widget when receiving dashboard:register-widget message", async () => {
      // Register a widget via messaging
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 42 }),
      });

      // Verify widget is registered by fetching dashboard data
      const result = await harness.executeTool("dashboard_get-data", {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("widgets");
      expect(result.data).toHaveProperty([
        "widgets",
        "test-plugin:test-widget",
      ]);
    });

    it("should unregister widget when receiving dashboard:unregister-widget message", async () => {
      // First register a widget
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 42 }),
      });

      // Then unregister it
      await harness.sendMessage("dashboard:unregister-widget", {
        pluginId: "test-plugin",
        widgetId: "test-widget",
      });

      // Verify widget is unregistered
      const result = await harness.executeTool("dashboard_get-data", {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("widgets");
      expect(result.data).not.toHaveProperty([
        "widgets",
        "test-plugin:test-widget",
      ]);
    });

    it("should unregister all widgets for a plugin", async () => {
      // Register multiple widgets
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

      // Verify widgets are registered
      let result = await harness.executeTool("dashboard_get-data", {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty(["widgets", "test-plugin:widget-1"]);
      expect(result.data).toHaveProperty(["widgets", "test-plugin:widget-2"]);

      // Unregister all widgets for the plugin
      await harness.sendMessage("dashboard:unregister-widget", {
        pluginId: "test-plugin",
      });

      // Verify all widgets are unregistered
      result = await harness.executeTool("dashboard_get-data", {});
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("widgets", {});
    });
  });

  describe("Dashboard Data Tool", () => {
    it("should return empty widgets when none registered", async () => {
      const result = await harness.executeTool("dashboard_get-data", {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("widgets", {});
      expect(result.data).toHaveProperty("buildInfo");
    });

    it("should return registered widgets with their data", async () => {
      // Register a widget via messaging
      await harness.sendMessage("dashboard:register-widget", {
        id: "stats-widget",
        pluginId: "system",
        title: "Entity Stats",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ notes: 42, links: 15 }),
      });

      const result = await harness.executeTool("dashboard_get-data", {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty(["widgets", "system:stats-widget"]);
      expect(result.data).toHaveProperty(
        ["widgets", "system:stats-widget", "widget", "title"],
        "Entity Stats",
      );
      expect(result.data).toHaveProperty(
        ["widgets", "system:stats-widget", "data"],
        { notes: 42, links: 15 },
      );
    });
  });
});
