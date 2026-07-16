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

    it("should advertise the dashboard endpoint and interaction", () => {
      const shell = harness.getMockShell();
      const dashboardEndpoint = shell
        .listEndpoints()
        .find((endpoint) => endpoint.pluginId === "dashboard");
      const dashboardInteraction = shell
        .listInteractions()
        .find((interaction) => interaction.id === "dashboard");

      expect(dashboardEndpoint).toMatchObject({
        label: "Dashboard",
        url: "/dashboard",
        pluginId: "dashboard",
        visibility: "public",
      });
      expect(dashboardInteraction).toMatchObject({
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        kind: "admin",
        pluginId: "dashboard",
        visibility: "public",
      });
    });
  });

  describe("Web routes", () => {
    it("should expose the dashboard page and console jump routes", async () => {
      const routes = plugin.getWebRoutes();
      expect(routes).toHaveLength(2);
      const pageRoute = routes.find((route) => route.path === "/dashboard");
      expect(pageRoute).toMatchObject({
        path: "/dashboard",
        method: "GET",
        public: true,
      } satisfies Partial<WebRouteDefinition>);
      expect(
        routes.find((route) => route.path === "/api/console/jump"),
      ).toBeDefined();

      const response = await pageRoute?.handler(
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
      // The jump palette ships with the page, wired to the strip's ⌘K.
      expect(html).toContain("/api/console/jump");
    });

    it("should require an authenticated session for the console jump", async () => {
      const route = plugin
        .getWebRoutes()
        .find((r) => r.path === "/api/console/jump");

      const response = await route?.handler(
        new Request("http://brain/api/console/jump?q=verd"),
      );

      expect(response?.status).toBe(401);
    });

    it("should require Anchor access for the console jump", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-jump-trusted-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const trusted = await authPlugin.getService().createUser({
        displayName: "Trusted user",
        role: "trusted",
      });
      const session = await authPlugin
        .getService()
        .createAuthSession(trusted.userId);
      const cookie = session.cookie.split(";")[0] ?? session.cookie;
      const route = plugin
        .getWebRoutes()
        .find((r) => r.path === "/api/console/jump");

      const response = await route?.handler(
        new Request("http://brain/api/console/jump?q=system", {
          headers: { Cookie: cookie },
        }),
      );

      expect(response?.status).toBe(403);
    });

    it("should return grouped jump doors for an authenticated user", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-jump-auth-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createAuthSession();
      const cookie = session.cookie.split(";")[0] ?? session.cookie;
      harness.getMockShell().registerPlugin({
        id: "admin",
        getWebRoutes: () => [
          {
            path: "/admin",
            method: "GET",
            public: true,
            handler: async (): Promise<Response> => new Response("ok"),
          },
        ],
      } as unknown as Parameters<
        ReturnType<typeof harness.getMockShell>["registerPlugin"]
      >[0]);

      const route = plugin
        .getWebRoutes()
        .find((r) => r.path === "/api/console/jump");
      const response = await route?.handler(
        new Request("http://brain/api/console/jump?q=", {
          headers: { Cookie: cookie },
        }),
      );

      expect(response?.status).toBe(200);
      const data = (await response?.json()) as {
        groups: Array<{ id: string; items: Array<{ href: string }> }>;
      };
      const tabs = data.groups.find((group) => group.id === "tabs");
      expect(tabs?.items.map((item) => item.href)).toContain(
        "/dashboard#system",
      );
      expect(
        data.groups.find((group) => group.id === "surfaces")?.items,
      ).toContainEqual(expect.objectContaining({ href: "/admin" }));
      // No CMS plugin in this harness → entity doors have no destination.
      expect(data.groups.find((group) => group.id === "entities")).toBe(
        undefined,
      );
    });

    it("should map search hits to CMS doors, falling back to ids", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-jump-entities-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createAuthSession();
      const cookie = session.cookie.split(";")[0] ?? session.cookie;

      const shell = harness.getMockShell();
      shell.registerPlugin({
        id: "cms",
        getWebRoutes: () => [
          {
            path: "/cms",
            method: "GET",
            public: true,
            handler: async (): Promise<Response> => new Response("ok"),
          },
        ],
      } as unknown as Parameters<typeof shell.registerPlugin>[0]);

      const entityService = shell.getEntityService();
      entityService.search = (async () => [
        {
          entity: {
            id: "verdigris-pigments",
            entityType: "note",
            title: "Verdigris pigments",
            content: "",
            created: "",
            updated: "",
            contentHash: "",
          },
          score: 1,
          excerpt: "",
        },
        {
          entity: {
            id: "untitled-note",
            entityType: "note",
            content: "",
            created: "",
            updated: "",
            contentHash: "",
          },
          score: 0.5,
          excerpt: "",
        },
      ]) as typeof entityService.search;

      const route = plugin
        .getWebRoutes()
        .find((r) => r.path === "/api/console/jump");
      const response = await route?.handler(
        new Request("http://brain/api/console/jump?q=verd", {
          headers: { Cookie: cookie },
        }),
      );

      expect(response?.status).toBe(200);
      const data = (await response?.json()) as {
        groups: Array<{
          id: string;
          items: Array<Record<string, string>>;
        }>;
      };
      const entities = data.groups.find((group) => group.id === "entities");
      expect(entities?.items).toEqual([
        {
          id: "note/verdigris-pigments",
          title: "Verdigris pigments",
          sub: "note",
          href: "/cms#/note/verdigris-pigments",
          tag: "edit in cms",
        },
        {
          id: "note/untitled-note",
          title: "untitled-note",
          sub: "note",
          href: "/cms#/note/untitled-note",
          tag: "edit in cms",
        },
      ]);
    });

    it("should degrade to tab doors alone when search fails", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-jump-degrade-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createAuthSession();
      const cookie = session.cookie.split(";")[0] ?? session.cookie;

      const shell = harness.getMockShell();
      const entityService = shell.getEntityService();
      entityService.search = (async () => {
        throw new Error("index warming");
      }) as typeof entityService.search;

      const route = plugin
        .getWebRoutes()
        .find((r) => r.path === "/api/console/jump");
      // "sys" matches the System tab and is long enough to trigger the
      // (failing) entity search — the response degrades, never errors.
      const response = await route?.handler(
        new Request("http://brain/api/console/jump?q=sys", {
          headers: { Cookie: cookie },
        }),
      );

      expect(response?.status).toBe(200);
      const data = (await response?.json()) as {
        groups: Array<{ id: string }>;
      };
      expect(data.groups.find((group) => group.id === "entities")).toBe(
        undefined,
      );
      expect(data.groups.find((group) => group.id === "tabs")).toBeDefined();
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
      expect(html).not.toContain(
        'interaction-link--admin" href="http://brain/cms"',
      );
    });

    it("should remove a tab when all widgets in that group are hidden", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "pipeline",
        pluginId: "content-pipeline",
        title: "Publication Pipeline",
        group: "publishing",
        section: "primary",
        priority: 10,
        rendererName: "PipelineWidget",
        visibility: "anchor",
        dataProvider: async () => ({ summary: {}, items: [] }),
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard"),
      );
      const html = await response?.text();

      expect(html).toContain('href="#overview"');
      expect(html).not.toContain('href="#publishing"');
      expect(html).not.toContain("Publication Pipeline");
    });

    it("should render recent entity and job progress events", async () => {
      harness.subscribe("sync:status:request", async () => ({
        success: true,
        data: {
          syncPath: "/brain/content",
          isInitialized: true,
          watchEnabled: true,
          lastSync: "2026-07-08T09:30:00.000Z",
          totalFiles: 2,
          byEntityType: { note: 2 },
        },
      }));
      (
        harness.getEntityService() as unknown as {
          awaitIndexReady: () => Promise<{
            ready: boolean;
            degraded: boolean;
            activeEmbeddingJobs: number;
            missingEmbeddings: number;
            staleEmbeddings: number;
            failedEmbeddings: number;
          }>;
        }
      ).awaitIndexReady = async (): Promise<{
        ready: boolean;
        degraded: boolean;
        activeEmbeddingJobs: number;
        missingEmbeddings: number;
        staleEmbeddings: number;
        failedEmbeddings: number;
      }> => ({
        ready: true,
        degraded: false,
        activeEmbeddingJobs: 0,
        missingEmbeddings: 0,
        staleEmbeddings: 0,
        failedEmbeddings: 0,
      });

      await harness.sendMessage("entity:updated", {
        entityType: "note",
        entityId: "project-plan",
      });
      await harness.sendMessage("job-progress", {
        id: "job-1",
        type: "job",
        status: "processing",
        progress: { current: 1, total: 3, percentage: 33 },
        jobDetails: { jobType: "site:build", priority: 0, retryCount: 0 },
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard"),
      );
      const html = await response?.text();

      expect(html).toContain("note/project-plan");
      expect(html).toContain("site:build");
      expect(html).toContain("1/3");
      expect(html).toContain("/brain/content");
      expect(html).toContain("2 files");
      expect(html).toContain("note 2");
      expect(html).toContain("Content sync");
      expect(html).toContain("Semantic index · ready · 0 active");
    });

    it("should retain the authenticated user's actual dashboard role", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-trusted-auth-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const trustedUser = await authPlugin.getService().createUser({
        displayName: "Mira Reyes",
        role: "trusted",
        status: "active",
      });
      const session = await authPlugin
        .getService()
        .createAuthSession(trustedUser.userId);
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

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard", {
          headers: { Cookie: cookie },
        }),
      );
      const html = await response?.text();

      expect(html).toContain("Mira Reyes");
      expect(html).toContain("Trusted");
      expect(html).toContain("MCP");
      expect(html).not.toContain("CMS");
      expect(html).not.toContain('href="#people"');
    });

    it("should show anchor endpoints and interactions without embedding People", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-auth-${Date.now()}`,
      });
      await harness.installPlugin(authPlugin);
      const anchorUser = await authPlugin.getService().createUser({
        displayName: "Yeehaa",
        role: "anchor",
        status: "active",
      });
      const session = await authPlugin
        .getService()
        .createAuthSession(anchorUser.userId);
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

      expect(html).toContain("Yeehaa");
      expect(html).toContain("Anchor");
      expect(html).toContain("MCP");
      expect(html).toContain("CMS");
      expect(html).not.toContain('href="#people"');
      expect(html).not.toContain('id="people"');
      expect(html).not.toContain("/auth/admin/users");
      expect(html).not.toContain("restricted widget is hidden");
    });
  });

  describe("Widget Registration via Messaging", () => {
    it("should register widget when receiving dashboard:register-widget message", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-plugin",
        group: "knowledge",
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

    it("normalizes deprecated attention counts received over messaging", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "legacy-attention-widget",
        pluginId: "legacy-plugin",
        group: "knowledge",
        title: "Legacy Attention Widget",
        rendererName: "StatsWidget",
        needsOperator: 2,
        dataProvider: async () => ({}),
      });

      expect(
        plugin
          .getWidgetRegistry()
          ?.get("legacy-plugin", "legacy-attention-widget"),
      ).toMatchObject({ needsAttention: 2 });
    });

    it("should unregister widget when receiving dashboard:unregister-widget message", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "test-widget",
        pluginId: "test-plugin",
        group: "knowledge",
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
        group: "knowledge",
        title: "Widget 1",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      });

      await harness.sendMessage("dashboard:register-widget", {
        id: "widget-2",
        pluginId: "test-plugin",
        group: "knowledge",
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

    it("should return a structured error for a malformed unregister payload", async () => {
      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: "dashboard:unregister-widget",
          payload: { widgetId: 42 },
          sender: "test",
        });

      expect(response).toEqual({
        success: false,
        error: "Widget unregistration failed",
      });
    });

    it("should reject a widget registration without a group", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "legacy-widget",
        pluginId: "test-plugin",
        title: "Legacy Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ ok: true }),
      });

      const registry = plugin.getWidgetRegistry();
      const testPluginWidgets =
        registry?.list().filter((w) => w.pluginId === "test-plugin") ?? [];
      expect(testPluginWidgets).toHaveLength(0);
    });

    it("should reject a custom renderer without a component", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "broken-widget",
        pluginId: "test-plugin",
        group: "knowledge",
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
        group: "knowledge",
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
