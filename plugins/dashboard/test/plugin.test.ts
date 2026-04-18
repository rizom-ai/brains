import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { WebRouteDefinition } from "@brains/plugins";
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

    it("should not require site-builder as a plugin dependency", () => {
      expect(Object.hasOwn(plugin, "dependencies")).toBe(false);
    });

    it("should expose no tools", async () => {
      const capabilities = await harness.installPlugin(new DashboardPlugin());
      expect(capabilities.tools).toHaveLength(0);
    });
  });

  describe("Web routes", () => {
    it("should expose the existing dashboard web route", async () => {
      const routes = plugin.getWebRoutes();
      expect(routes).toHaveLength(1);
      expect(routes[0]).toMatchObject({
        path: "/dashboard",
        method: "GET",
        public: true,
      } satisfies Partial<WebRouteDefinition>);

      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard"),
      );
      expect(response?.status).toBe(200);
      expect(response?.headers.get("content-type")).toContain("text/html");
      const html = await response?.text();
      expect(html).toContain("Test Owner");
      expect(html).toContain("Entities");
      expect(html).toContain("Brain Character");
      expect(html).toContain("dashboard:dashboard");
      expect(html).not.toContain("data-cms-frame");
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
      const testPluginWidgets =
        registry?.list().filter((w) => w.pluginId === "test-plugin") ?? [];
      expect(testPluginWidgets).toHaveLength(1);
      expect(testPluginWidgets[0]).toMatchObject({
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
      const testPluginWidgets =
        registry?.list().filter((w) => w.pluginId === "test-plugin") ?? [];
      expect(testPluginWidgets).toHaveLength(0);
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
      const testPluginCount = (): number =>
        registry?.list().filter((w) => w.pluginId === "test-plugin").length ??
        0;

      expect(testPluginCount()).toBe(2);

      await harness.sendMessage("dashboard:unregister-widget", {
        pluginId: "test-plugin",
      });

      expect(testPluginCount()).toBe(0);
    });
  });
});
