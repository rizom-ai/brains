import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetProviderContext,
  type EntityCount,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createTempDir } from "@brains/test-utils";
import { AuthServicePlugin } from "@brains/auth-service";
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
        kind: "human",
        pluginId: "dashboard",
        visibility: "public",
      });
    });
  });

  describe("Web routes", () => {
    it("should expose the dashboard page and console jump routes", async () => {
      const routes = plugin.getWebRoutes();
      expect(routes).toHaveLength(4);
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
      expect(response?.headers.get("cache-control")).toBe("private, no-store");
      const html = await response?.text();
      expect(html).toContain("Test Owner");
      expect(html).toContain("What I hold");
      expect(html).toContain("What is this");
      expect(html).toContain("dashboard:dashboard");
      expect(html).not.toContain("data-studio-frame");
      expect(html).toMatch(
        /<link[^>]*data-dashboard-styles[^>]*href="\/dashboard\/assets\/dashboard\.[a-f0-9]{64}\.css"/,
      );
      expect(html).toMatch(
        /<script[^>]*data-dashboard-script[^>]*src="\/dashboard\/assets\/dashboard\.[a-f0-9]{64}\.js"/,
      );
      expect(html).not.toContain("<style data-dashboard-styles");

      // The external client bundle still ships the jump palette wired to ⌘K.
      const scriptPath = html?.match(
        /data-dashboard-script[^>]*src="([^"]+)"/,
      )?.[1];
      const scriptResponse = await plugin
        .getWebRoutes()
        .find((route) => route.path === scriptPath)
        ?.handler(new Request(`http://brain${scriptPath}`));
      expect(await scriptResponse?.text()).toContain("/api/console/jump");
    });

    it("should declare configured theme assets before the route snapshot", async () => {
      const themeCSS = ":root { --dashboard-accent: lime; }";
      const themedPlugin = new DashboardPlugin({ themeCSS });
      await harness.installPlugin(themedPlugin);

      const routes = themedPlugin.getWebRoutes();
      const pageRoute = routes.find((route) => route.path === "/dashboard");
      const pageResponse = await pageRoute?.handler(
        new Request("http://brain/dashboard"),
      );
      const html = await pageResponse?.text();
      const themePath = html?.match(
        /data-dashboard-theme[^>]*href="([^"]+)"/,
      )?.[1];

      expect(themePath).toMatch(
        /^\/dashboard\/assets\/theme\.[a-f0-9]{64}\.css$/,
      );
      const themeRoute = routes.find((route) => route.path === themePath);
      expect(themeRoute).toBeDefined();

      const themeResponse = await themeRoute?.handler(
        new Request(`http://brain${themePath}`),
      );
      expect(themeResponse?.status).toBe(200);
      expect(themeResponse?.headers.get("Content-Type")).toBe(
        "text/css; charset=utf-8",
      );
      expect(await themeResponse?.text()).toBe(themeCSS);
    });

    it("builds anonymous card holdings from public scope only", async () => {
      const requestedScopes: string[] = [];
      harness.getEntityService().getEntityCounts = async (
        scope,
      ): Promise<EntityCount[]> => {
        requestedScopes.push(typeof scope === "string" ? scope : "internal");
        return [{ entityType: "public-note", count: 2 }];
      };

      const response = await plugin
        .getWebRoutes()[0]
        ?.handler(new Request("http://brain/dashboard"));
      const html = await response?.text();

      expect(response?.status).toBe(200);
      expect(requestedScopes).toEqual(["public"]);
      expect(html).toContain("Public Notes");
      expect(html).toContain("What I hold");
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

    it("should require Admin access for the console jump", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-jump-trusted-"),
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
        storageDir: await createTempDir("dashboard-jump-auth-"),
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createAuthSession();
      const cookie = session.cookie.split(";")[0] ?? session.cookie;
      harness.getMockShell().registerPlugin({
        id: "studio",
        version: "1.0.0",
        type: "service" as const,
        packageName: "@brains/studio",
        // A real registration: the jump palette only reads getWebRoutes, but
        // registerPlugin takes a whole Plugin, and supplying one keeps this
        // checked against the interface instead of asserted past it.
        register: async () => ({
          tools: [],
          resources: [],
          commands: [],
          handlers: [],
        }),
        getWebRoutes: () => [
          {
            path: "/studio",
            method: "GET" as const,
            public: true,
            handler: async (): Promise<Response> => new Response("ok"),
          },
        ],
      });

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
      expect(tabs?.items.map((item) => item.href)).toEqual([
        "/dashboard#overview",
        "/dashboard#knowledge",
        "/dashboard#network",
      ]);
      expect(
        data.groups.find((group) => group.id === "surfaces")?.items,
      ).toContainEqual(
        expect.objectContaining({
          href: "/studio/workspaces/admin%3Apeople",
        }),
      );
      // No search hits in this harness, so there are no entity doors.
      expect(data.groups.find((group) => group.id === "entities")).toBe(
        undefined,
      );
    });

    it("should map search hits to Studio doors, falling back to ids", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-jump-entities-"),
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createAuthSession();
      const cookie = session.cookie.split(";")[0] ?? session.cookie;

      const shell = harness.getMockShell();
      shell.registerPlugin({
        id: "studio",
        version: "1.0.0",
        type: "service" as const,
        packageName: "@brains/studio",
        register: async () => ({
          tools: [],
          resources: [],
          commands: [],
          handlers: [],
        }),
        getWebRoutes: () => [
          {
            path: "/studio",
            method: "GET" as const,
            public: true,
            handler: async (): Promise<Response> => new Response("ok"),
          },
        ],
      });

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
          href: "/studio/entities/note/verdigris-pigments",
          tag: "edit in studio",
        },
        {
          id: "note/untitled-note",
          title: "untitled-note",
          sub: "note",
          href: "/studio/entities/note/untitled-note",
          tag: "edit in studio",
        },
      ]);
    });

    it("should degrade to tab doors alone when search fails", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-jump-degrade-"),
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
      // "net" matches the Network tab and is long enough to trigger the
      // (failing) entity search — the response degrades, never errors.
      const response = await route?.handler(
        new Request("http://brain/api/console/jump?q=net", {
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
      shell.registerEndpoint({
        label: "Member Studio endpoint",
        url: "/studio",
        pluginId: "studio",
        priority: 40,
        visibility: "public",
        requiresActiveSession: true,
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
        id: "studio",
        label: "Studio",
        href: "/studio",
        kind: "admin",
        pluginId: "studio",
        priority: 40,
        visibility: "public",
        requiresActiveSession: true,
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard"),
      );
      const html = await response?.text();

      expect(html).toContain("Public Site");
      expect(html).toContain("A2A");
      expect(html).not.toContain("MCP");
      expect(html).not.toContain("Member Studio Endpoint");
      expect(html).not.toContain(
        'interaction-link--admin" href="http://brain/studio"',
      );
    });

    it("shows the Studio operator door only to an active Public-rank person", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-public-session-auth-"),
      });
      await harness.installPlugin(authPlugin);
      const person = await authPlugin.getService().createUser({
        displayName: "Public member",
        role: "public",
        status: "active",
      });
      const session = await authPlugin
        .getService()
        .createAuthSession(person.userId);
      const shell = harness.getMockShell();
      shell.registerEndpoint({
        label: "Member Studio endpoint",
        url: "/studio",
        pluginId: "studio",
        priority: 40,
        visibility: "public",
        requiresActiveSession: true,
      });
      shell.registerInteraction({
        id: "studio",
        label: "Studio",
        href: "/studio",
        kind: "admin",
        pluginId: "studio",
        priority: 40,
        visibility: "public",
        requiresActiveSession: true,
      });
      shell.registerPlugin({
        id: "studio",
        version: "1.0.0",
        type: "service",
        packageName: "@brains/studio",
        register: async () => ({
          tools: [],
          resources: [],
          commands: [],
          handlers: [],
        }),
        getWebRoutes: (): WebRouteDefinition[] => [
          {
            path: "/studio",
            method: "GET",
            public: true,
            handler: async (): Promise<Response> => new Response("ok"),
          },
        ],
      });

      const pageRoute = plugin.getWebRoutes()[0];
      const anonymousResponse = await pageRoute?.handler(
        new Request("http://brain/dashboard"),
      );
      const anonymousHtml = await anonymousResponse?.text();
      expect(anonymousHtml).not.toContain('data-console-surface="studio"');
      expect(anonymousHtml).not.toContain("Operators → Studio");

      const response = await pageRoute?.handler(
        new Request("http://brain/dashboard", {
          headers: { Cookie: session.cookie },
        }),
      );
      const html = await response?.text();

      expect(html).toContain("Public member");
      expect(html).not.toContain("Member Studio Endpoint");
      expect(html).toContain('data-console-surface="studio"');
      expect(html).toContain('href="/studio"');
      expect(html).toContain("Operators → Studio");
    });

    it("should remove a tab when all widgets in that group are hidden", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "pipeline",
        pluginId: "content-pipeline",
        title: "Publication Pipeline",
        group: "publishing",
        section: "primary",
        priority: 10,
        rendererName: "DeclarativeOperatorWidget",
        visibility: "admin",
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

    it("should keep non-public widgets off the Dashboard for an Admin session", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-public-widgets-only-"),
      });
      await harness.installPlugin(authPlugin);
      const session = await authPlugin.getService().createAuthSession();
      let privateProviderCalls = 0;
      await harness.sendMessage("dashboard:register-widget", {
        id: "private-operations",
        pluginId: "operations",
        title: "Private operations",
        group: "system",
        section: "primary",
        priority: 10,
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
        visibility: "trusted",
        dataProvider: async () => {
          privateProviderCalls += 1;
          return { view: { blocks: [] } };
        },
      });

      const response = await plugin.getWebRoutes()[0]?.handler(
        new Request("http://brain/dashboard", {
          headers: { Cookie: session.cookie },
        }),
      );
      const html = await response?.text();

      expect(privateProviderCalls).toBe(0);
      expect(html).not.toContain("Private operations");
      expect(html).not.toContain("private console widget is hidden");
    });

    it("does not query or render operator diagnostics on the public card", async () => {
      let syncStatusCalls = 0;
      harness.subscribe("sync:status:request", async () => {
        syncStatusCalls += 1;
        return {
          success: true,
          data: {
            syncPath: "/private/content",
            isInitialized: true,
            watchEnabled: true,
          },
        };
      });

      const response = await plugin
        .getWebRoutes()[0]
        ?.handler(new Request("http://brain/dashboard"));
      const html = await response?.text();

      expect(syncStatusCalls).toBe(0);
      expect(html).not.toContain("/private/content");
      expect(html).not.toContain("Content sync");
      expect(html).not.toContain("Job queue");
      expect(html).not.toContain("Semantic index");
    });

    it("should retain the authenticated user's actual dashboard role", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-trusted-auth-"),
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
        label: "Studio",
        url: "/studio",
        pluginId: "studio",
        priority: 40,
        visibility: "admin",
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
      expect(html).not.toContain("MCP");
      expect(html).not.toContain('href="http://brain/studio"');
      expect(html).not.toContain('href="#people"');
    });

    it("keeps public providers anonymous while forwarding request cancellation", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: `/tmp/dashboard-declarative-auth-${Date.now()}`,
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
      const providerContexts: DashboardWidgetProviderContext[] = [];
      let hiddenProviderCalls = 0;

      await harness.sendMessage("dashboard:register-widget", {
        id: "declarative-reader",
        pluginId: "reader",
        group: "knowledge",
        title: "Reader widget",
        visibility: "public",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
        dataProvider: async (context: DashboardWidgetProviderContext) => {
          providerContexts.push(context);
          return {
            view: {
              title: "Reading <script>alert('nope')</script>",
              blocks: [
                {
                  type: "stats",
                  items: [{ label: "Saved", value: 3, tone: "good" }],
                },
                {
                  type: "links",
                  items: [
                    {
                      label: "Reading source",
                      target: {
                        kind: "external",
                        href: "https://reading.example/library",
                      },
                    },
                  ],
                },
              ],
            },
          };
        },
      });
      await harness.sendMessage("dashboard:register-widget", {
        id: "anchor-only",
        pluginId: "reader",
        group: "knowledge",
        title: "Anchor only",
        visibility: "admin",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
        dataProvider: async () => {
          hiddenProviderCalls += 1;
          return { view: { blocks: [] } };
        },
      });

      const route = plugin
        .getWebRoutes()
        .find((candidate) => candidate.path === "/dashboard");
      const abortController = new AbortController();
      const response = await route?.handler(
        new Request("http://brain/dashboard", {
          headers: { Cookie: cookie },
          signal: abortController.signal,
        }),
      );
      const html = await response?.text();

      expect(providerContexts).toHaveLength(1);
      expect(providerContexts[0]?.caller).toBeNull();
      expect(hiddenProviderCalls).toBe(0);
      expect(html).toContain("operator-view");
      expect(html).toContain(
        "Reading &lt;script&gt;alert(&#x27;nope&#x27;)&lt;/script&gt;",
      );
      expect(html).not.toContain("<script>alert('nope')</script>");
      expect(html).toContain('href="https://reading.example/library"');
      abortController.abort();
      expect(providerContexts[0]?.signal.aborted).toBeTrue();
    });

    it("keeps Admin-only descriptors out of the public card", async () => {
      const authPlugin = new AuthServicePlugin({
        storageDir: await createTempDir("dashboard-auth-"),
      });
      await harness.installPlugin(authPlugin);
      const adminUser = await authPlugin.getService().createUser({
        displayName: "Yeehaa",
        role: "admin",
        status: "active",
      });
      const session = await authPlugin
        .getService()
        .createAuthSession(adminUser.userId);
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
        label: "Studio",
        url: "/studio",
        pluginId: "studio",
        priority: 40,
        visibility: "admin",
      });
      shell.registerInteraction({
        id: "studio",
        label: "Studio",
        href: "/studio",
        kind: "admin",
        pluginId: "studio",
        priority: 40,
        visibility: "admin",
      });

      const routes = plugin.getWebRoutes();
      const response = await routes[0]?.handler(
        new Request("http://brain/dashboard", {
          headers: { Cookie: cookie },
        }),
      );
      const html = await response?.text();

      expect(html).toContain("Yeehaa");
      expect(html).toContain("Admin");
      expect(html).not.toContain("MCP");
      expect(html).toContain("Studio");
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
        rendererName: "DeclarativeOperatorWidget",
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
        group: "knowledge",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "DeclarativeOperatorWidget",
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
        rendererName: "DeclarativeOperatorWidget",
        dataProvider: async () => ({}),
      });

      await harness.sendMessage("dashboard:register-widget", {
        id: "widget-2",
        pluginId: "test-plugin",
        group: "knowledge",
        title: "Widget 2",
        section: "secondary",
        priority: 20,
        rendererName: "DeclarativeOperatorWidget",
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
        rendererName: "DeclarativeOperatorWidget",
        dataProvider: async () => ({ ok: true }),
      });

      const registry = plugin.getWidgetRegistry();
      const testPluginWidgets =
        registry?.list().filter((w) => w.pluginId === "test-plugin") ?? [];
      expect(testPluginWidgets).toHaveLength(0);
    });

    it("should reject nondeclarative renderer names", async () => {
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

    it("should reject plugin-owned browser assets", async () => {
      await harness.sendMessage("dashboard:register-widget", {
        id: "private-browser-widget",
        pluginId: "test-plugin",
        group: "knowledge",
        title: "Private browser widget",
        rendererName: "DeclarativeOperatorWidget",
        component: () => null,
        clientStyles: ".private-widget {}",
        clientScript: "window.privateWidget = true;",
        dataProvider: async () => ({ view: { blocks: [] } }),
      });

      expect(
        plugin
          .getWidgetRegistry()
          ?.get("test-plugin", "private-browser-widget"),
      ).toBeUndefined();
    });
  });
});
