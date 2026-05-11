import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import type { WebRouteDefinition } from "@brains/plugins";
import { AuthServicePlugin } from "@brains/auth-service";
import { h } from "preact";
import type { WidgetComponentProps } from "../src";
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
      expect(html).toContain("Identity");
      expect(html).toContain("dashboard:dashboard");
      expect(html).not.toContain("data-cms-frame");
    });

    it("should hide restricted endpoints and interactions from public visitors", async () => {
      const shell = harness.getMockShell();
      shell.registerEndpoint({
        label: "Public Site",
        url: "https://brain.test",
        pluginId: "webserver",
        priority: 10,
      });
      shell.registerEndpoint({
        label: "MCP",
        url: "/mcp",
        pluginId: "mcp",
        priority: 30,
        visibility: "trusted",
      });
      shell.registerInteraction({
        id: "a2a",
        label: "A2A",
        href: "/a2a",
        kind: "agent",
        pluginId: "a2a",
        priority: 20,
      });
      shell.registerInteraction({
        id: "cms",
        label: "CMS",
        href: "/cms",
        kind: "admin",
        pluginId: "cms",
        priority: 40,
        visibility: "anchor",
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard"),
      );
      const html = await response?.text();

      expect(html).toContain("Public Site");
      expect(html).toContain("A2A");
      expect(html).not.toContain("MCP");
      expect(html).not.toContain("CMS");
    });

    it("should show anchor endpoints and interactions to signed-in operators", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-auth-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createOperatorSession();
      const cookie = session.cookie.split(";")[0] ?? session.cookie;
      const shell = harness.getMockShell();
      shell.registerEndpoint({
        label: "MCP",
        url: "/mcp",
        pluginId: "mcp",
        priority: 30,
        visibility: "trusted",
      });
      shell.registerEndpoint({
        label: "CMS",
        url: "/cms",
        pluginId: "cms",
        priority: 40,
        visibility: "anchor",
      });
      shell.registerInteraction({
        id: "cms",
        label: "CMS",
        href: "/cms",
        kind: "admin",
        pluginId: "cms",
        priority: 40,
        visibility: "anchor",
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard", {
          headers: { Cookie: cookie },
        }),
      );
      const html = await response?.text();

      expect(html).toContain("MCP");
      expect(html).toContain("CMS");
      expect(html).not.toContain("restricted widget is hidden");
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

    it("should reject a custom renderer without a component", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "broken-widget",
        pluginId: "test-plugin",
        title: "Broken Widget",
        section: "secondary",
        priority: 14,
        rendererName: "BrokenWidget",
        dataProvider: async () => ({ ok: true }),
      });

      const registry = plugin.getWidgetRegistry();
      const testPluginWidgets =
        registry?.list().filter((w) => w.pluginId === "test-plugin") ?? [];
      expect(testPluginWidgets).toHaveLength(0);
    });

    it("should register and render a plugin-provided widget component", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "swot",
        pluginId: "swot",
        title: "SWOT",
        section: "secondary",
        priority: 14,
        rendererName: "SwotWidget",
        component: ({ data }: WidgetComponentProps) => {
          const input = data as {
            strengths: Array<{ title: string }>;
          };
          return h(
            "div",
            { "data-swot-widget": "true" },
            h("h3", {}, "Strengths"),
            h("p", {}, input.strengths[0]?.title ?? "—"),
          );
        },
        clientScript: "window.__swotBoot = true;",
        dataProvider: async () => ({
          strengths: [{ title: "Research & writing" }],
        }),
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard"),
      );
      const html = await response?.text();

      expect(html).toContain("data-swot-widget");
      expect(html).toContain("Strengths");
      expect(html).toContain("Research &amp; writing");
      expect(html).toContain("window.__swotBoot = true;");
    });
  });
});
