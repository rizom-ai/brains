import { createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it, spyOn } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import type { ZodType } from "@brains/utils/zod";
import { studioPlugin, type StudioPlugin } from "../src";

interface SessionMatrix {
  admin: string;
  trusted: string;
  public: string;
  invited: string;
  suspended: string;
}

interface RouteRequest {
  routePath: string;
  method?: WebRouteDefinition["method"];
  request: (cookie?: string) => Request;
}

function findRoute(
  plugin: StudioPlugin,
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === path && (candidate.method ?? "GET") === method,
    );
  if (!route) throw new Error(`Missing ${method} route: ${path}`);
  return route;
}

function request(
  path: string,
  options: {
    cookie?: string | undefined;
    method?: string;
    body?: unknown;
  } = {},
): Request {
  return new Request(`https://yeehaa.io${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body !== undefined
        ? {
            "Content-Type": "application/json",
            Origin: "https://yeehaa.io",
          }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}

function uploadRequest(cookie?: string): Request {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
      type: "image/png",
    }),
  );
  return new Request("https://yeehaa.io/studio/api/upload", {
    method: "POST",
    headers: cookie ? { Cookie: cookie, Origin: "https://yeehaa.io" } : {},
    body: form,
  });
}

function apiRouteRequests(): RouteRequest[] {
  return [
    {
      routePath: "/studio/api/types",
      request: (cookie) => request("/studio/api/types", { cookie }),
    },
    {
      routePath: "/studio/api/workspace",
      request: (cookie) => request("/studio/api/workspace", { cookie }),
    },
    {
      routePath: "/studio/api/workspace",
      method: "POST",
      request: (cookie) =>
        request("/studio/api/workspace", { cookie, method: "POST", body: {} }),
    },
    {
      routePath: "/studio/api/schema",
      request: (cookie) => request("/studio/api/schema", { cookie }),
    },
    {
      routePath: "/studio/api/entities",
      request: (cookie) => request("/studio/api/entities", { cookie }),
    },
    {
      routePath: "/studio/api/entities",
      method: "PUT",
      request: (cookie) =>
        request("/studio/api/entities", { cookie, method: "PUT", body: {} }),
    },
    {
      routePath: "/studio/api/entities",
      method: "POST",
      request: (cookie) =>
        request("/studio/api/entities", { cookie, method: "POST", body: {} }),
    },
    {
      routePath: "/studio/api/entities",
      method: "DELETE",
      request: (cookie) =>
        request("/studio/api/entities", { cookie, method: "DELETE" }),
    },
    {
      routePath: "/studio/api/upload",
      method: "POST",
      request: uploadRequest,
    },
    {
      routePath: "/studio/api/assist",
      method: "POST",
      request: (cookie) =>
        request("/studio/api/assist", { cookie, method: "POST", body: {} }),
    },
    {
      routePath: "/studio/api/agents",
      request: (cookie) => request("/studio/api/agents", { cookie }),
    },
    {
      routePath: "/studio/api/ask-agent",
      method: "POST",
      request: (cookie) =>
        request("/studio/api/ask-agent", {
          cookie,
          method: "POST",
          body: {},
        }),
    },
    {
      routePath: "/studio/api/sync-status",
      request: (cookie) => request("/studio/api/sync-status", { cookie }),
    },
  ];
}

async function createSessionMatrix(shell: MockShell): Promise<SessionMatrix> {
  const authPlugin = new AuthServicePlugin({
    storageDir: await createTempDataDir("brains-studio-permission-gate-"),
  });
  await authPlugin.register(shell);
  const service = authPlugin.getService();
  const admin = await service.createAuthSession();

  const trustedUser = await service.createUser({
    displayName: "Trusted editor",
    role: "trusted",
    status: "active",
  });
  const publicUser = await service.createUser({
    displayName: "Public reader",
    role: "public",
    status: "active",
  });
  const invitedUser = await service.createUser({
    displayName: "Invited editor",
    role: "trusted",
    status: "invited",
  });
  const suspendedUser = await service.createUser({
    displayName: "Suspended admin",
    role: "admin",
    status: "active",
  });

  const [trusted, publicSession, invited, suspended] = await Promise.all([
    service.createAuthSession(trustedUser.userId),
    service.createAuthSession(publicUser.userId),
    service.createAuthSession(invitedUser.userId),
    service.createAuthSession(suspendedUser.userId),
  ]);
  await service.suspendUser(suspendedUser.userId);

  return {
    admin: admin.cookie,
    trusted: trusted.cookie,
    public: publicSession.cookie,
    invited: invited.cookie,
    suspended: suspended.cookie,
  };
}

function enableChatCapability(shell: MockShell): void {
  const getPluginPackageName = shell.getPluginPackageName.bind(shell);
  shell.getPluginPackageName = (pluginId): string | undefined =>
    pluginId === "web-chat"
      ? "@brains/web-chat"
      : getPluginPackageName(pluginId);
}

async function setup(): Promise<{
  shell: MockShell;
  plugin: StudioPlugin;
  sessions: SessionMatrix;
}> {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const sessions = await createSessionMatrix(shell);
  const plugin = studioPlugin();
  await plugin.register(shell);
  return { shell, plugin, sessions };
}

describe("Studio active-session gate inversion", () => {
  // Chat is open to every level that reaches Studio at all. Studio's door
  // already requires an active session, so "public" here is every signed-in
  // visitor — and Chat is the surface one has least reason to be shut out of.
  it("discloses Chat to every active session, Public included", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const sessions = await createSessionMatrix(shell);
    enableChatCapability(shell);
    const plugin = studioPlugin();
    await plugin.register(shell);
    const route = findRoute(plugin, "/studio/api/types");

    const trustedResponse = await route.handler(
      request("/studio/api/types", { cookie: sessions.trusted }),
    );
    const trustedPayload = (await trustedResponse.json()) as {
      workspaces: Array<{ id: string }>;
    };
    const publicResponse = await route.handler(
      request("/studio/api/types", { cookie: sessions.public }),
    );
    const publicPayload = (await publicResponse.json()) as {
      workspaces: Array<{ id: string }>;
    };

    expect(trustedResponse.status).toBe(200);
    expect(trustedPayload.workspaces.map(({ id }) => id)).toContain(
      "web-chat:chat",
    );
    expect(publicResponse.status).toBe(200);
    expect(publicPayload.workspaces.map(({ id }) => id)).toContain(
      "web-chat:chat",
    );
  });

  it("inventories every API route under its exact capability floor", async () => {
    const { plugin, sessions } = await setup();
    const apiRoutes = apiRouteRequests();

    expect(
      plugin
        .getWebRoutes()
        .filter((route) => route.path.startsWith("/studio/api/"))
        .map((route) => `${route.method ?? "GET"} ${route.path}`),
    ).toEqual(
      apiRoutes.map((route) => `${route.method ?? "GET"} ${route.routePath}`),
    );

    for (const routeCase of apiRoutes) {
      const route = findRoute(
        plugin,
        routeCase.routePath,
        routeCase.method ?? "GET",
      );
      const adminResponse = await route.handler(
        routeCase.request(sessions.admin),
      );
      expect(adminResponse.status).not.toBe(401);

      const trustedResponse = await route.handler(
        routeCase.request(sessions.trusted),
      );
      expect(trustedResponse.status).not.toBe(401);
      if (routeCase.routePath === "/studio/api/sync-status") {
        expect(trustedResponse.status).toBe(403);
        expect(await trustedResponse.json()).toEqual({
          error: "Admin Studio capability required",
        });
      }

      const publicResponse = await route.handler(
        routeCase.request(sessions.public),
      );
      if (routeCase.routePath === "/studio/api/types") {
        expect(publicResponse.status).toBe(200);
        expect(await publicResponse.json()).toEqual({
          types: [],
          workspaces: [
            {
              id: "studio:account",
              pluginId: "studio",
              label: "Account",
              rendererName: "StudioAccountWorkspace",
              priority: 0,
              permission: "public",
              entityTypes: [],
            },
          ],
        });
      } else if (routeCase.routePath === "/studio/api/workspace") {
        // Workspace discovery and execution pass the active-session perimeter;
        // the registry applies each workspace's own floor before providers.
        expect(publicResponse.status).toBe(400);
      } else {
        expect(publicResponse.status).toBe(403);
        expect(await publicResponse.json()).toEqual({
          error:
            routeCase.routePath === "/studio/api/sync-status"
              ? "Admin Studio capability required"
              : "Trusted Studio capability required",
        });
      }

      for (const cookie of [undefined, sessions.invited, sessions.suspended]) {
        const response = await route.handler(routeCase.request(cookie));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          error: "Authentication required",
        });
      }
    }
  });

  it("keeps only static assets and legacy redirects as anonymous non-data exceptions", async () => {
    const { plugin } = await setup();

    const asset = await findRoute(plugin, "/studio/assets").handler(
      request("/studio/assets/app.js"),
    );
    expect([200, 404]).toContain(asset.status);

    const redirect = await findRoute(plugin, "/cms").handler(
      request("/cms/entities/note/example?view=edit"),
    );
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe(
      "/studio/entities/note/example?view=edit",
    );
  });

  it("admits every active session to shell entries", async () => {
    const { plugin, sessions } = await setup();
    const shellRoutes = [
      { routePath: "/studio", requestPath: "/studio" },
      {
        routePath: "/studio/entities",
        requestPath: "/studio/entities/post/shared-draft",
      },
      {
        routePath: "/studio/workspaces",
        requestPath: "/studio/workspaces/publishing",
      },
    ];

    for (const shellRoute of shellRoutes) {
      const route = findRoute(plugin, shellRoute.routePath);
      const adminResponse = await route.handler(
        request(shellRoute.requestPath, { cookie: sessions.admin }),
      );
      expect(adminResponse.status).toBe(200);

      const trustedResponse = await route.handler(
        request(shellRoute.requestPath, { cookie: sessions.trusted }),
      );
      expect(trustedResponse.status).toBe(200);
      expect(trustedResponse.headers.get("cache-control")).toBe("no-store");

      const publicResponse = await route.handler(
        request(shellRoute.requestPath, { cookie: sessions.public }),
      );
      expect(publicResponse.status).toBe(200);
      expect(publicResponse.headers.get("cache-control")).toBe("no-store");

      for (const cookie of [undefined, sessions.invited, sessions.suspended]) {
        const response = await route.handler(
          request(shellRoute.requestPath, { cookie }),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toStartWith(
          "/login?return_to=",
        );
      }
    }
  });

  it("keeps Account and administration behind the single Studio door", async () => {
    const { plugin, sessions } = await setup();
    const route = findRoute(plugin, "/studio");

    for (const cookie of [sessions.admin, sessions.trusted, sessions.public]) {
      const html = await (
        await route.handler(request("/studio", { cookie }))
      ).text();
      expect(html).toContain('href="/studio"');
      expect(html).not.toContain('data-console-surface="admin"');
      expect(html).not.toContain('data-console-surface="account"');
    }
  });

  it("denies Public editor requests before mutation or private capability code", async () => {
    const { shell, plugin, sessions } = await setup();
    let schemaLookups = 0;
    let workspaceAccessChecks = 0;
    let workspaceReads = 0;
    let workspaceActions = 0;
    let uploadPromotions = 0;
    let assistCalls = 0;

    const registry = shell.getEntityRegistry();
    const getSchema = registry.getEffectiveFrontmatterSchema.bind(registry);
    registry.getEffectiveFrontmatterSchema = (
      entityType,
    ): ReturnType<typeof getSchema> => {
      schemaLookups += 1;
      return getSchema(entityType);
    };

    const getEntitySpy = spyOn(shell.getEntityService(), "getEntity");

    registry.registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: async () => {
        uploadPromotions += 1;
        return {
          success: true,
          data: { entityId: "image-1", status: "created" },
        };
      },
    });
    shell.generateObject = async <T>(
      _prompt: string,
      schema: ZodType<T>,
    ): Promise<{ object: T }> => {
      assistCalls += 1;
      return { object: schema.parse({ suggestion: "Never reached" }) };
    };
    await shell.getMessageBus().send({
      type: "studio:register-workspace",
      sender: "test-workspace",
      payload: {
        id: "test-workspace",
        pluginId: "test-workspace",
        label: "Test workspace",
        rendererName: "DeclarativeOperatorWorkspace",
        priority: 1,
        accessHandler: () => {
          workspaceAccessChecks += 1;
          return true;
        },
        dataProvider: async () => {
          workspaceReads += 1;
          return {};
        },
        actionHandler: async () => {
          workspaceActions += 1;
          return {};
        },
      },
    });

    const publicRequests: Array<[WebRouteDefinition, Request]> = [
      [
        findRoute(plugin, "/studio/api/entities", "POST"),
        request("/studio/api/entities", {
          cookie: sessions.public,
          method: "POST",
          body: { entityType: "post", frontmatter: { title: "Draft" } },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "PUT"),
        request("/studio/api/entities", {
          cookie: sessions.public,
          method: "PUT",
          body: {
            entityType: "post",
            id: "shared-draft",
            frontmatter: { title: "Draft" },
          },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "DELETE"),
        request("/studio/api/entities?type=post&id=shared-draft", {
          cookie: sessions.public,
          method: "DELETE",
        }),
      ],
      [
        findRoute(plugin, "/studio/api/assist", "POST"),
        request("/studio/api/assist", {
          cookie: sessions.public,
          method: "POST",
          body: {
            entityType: "post",
            instruction: "Tighten",
            selection: "Draft body",
            body: "Draft body",
            frontmatter: { title: "Draft" },
          },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/upload", "POST"),
        uploadRequest(sessions.public),
      ],
      [
        findRoute(plugin, "/studio/api/workspace"),
        request("/studio/api/workspace?id=test-workspace", {
          cookie: sessions.public,
        }),
      ],
      [
        findRoute(plugin, "/studio/api/workspace", "POST"),
        request("/studio/api/workspace", {
          cookie: sessions.public,
          method: "POST",
          body: { id: "test-workspace", action: { type: "run" } },
        }),
      ],
    ];

    for (const [route, publicRequest] of publicRequests) {
      const response = await route.handler(publicRequest);
      expect(response.status).toBe(
        route.path === "/studio/api/workspace" ? 404 : 403,
      );
    }
    expect(getEntitySpy).not.toHaveBeenCalled();
    expect({
      schemaLookups,
      workspaceAccessChecks,
      workspaceReads,
      workspaceActions,
      uploadPromotions,
      assistCalls,
    }).toEqual({
      schemaLookups: 0,
      workspaceAccessChecks: 0,
      workspaceReads: 0,
      workspaceActions: 0,
      uploadPromotions: 0,
      assistCalls: 0,
    });
  });

  it("keeps repository sync metadata Admin-only after gate inversion", async () => {
    const { shell, plugin, sessions } = await setup();
    let syncReads = 0;
    shell.getMessageBus().subscribe("sync:status:request", async () => {
      syncReads += 1;
      return { success: true, data: {} };
    });

    for (const cookie of [sessions.public, sessions.trusted]) {
      const response = await findRoute(
        plugin,
        "/studio/api/sync-status",
      ).handler(request("/studio/api/sync-status", { cookie }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Admin Studio capability required",
      });
    }
    expect(syncReads).toBe(0);
  });

  it("rejects cross-origin requests on every cookie-authenticated mutation", async () => {
    const { plugin, sessions } = await setup();
    const mutationRequests: Array<[WebRouteDefinition, Request]> = [
      [
        findRoute(plugin, "/studio/api/workspace", "POST"),
        request("/studio/api/workspace", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "PUT"),
        request("/studio/api/entities", {
          cookie: sessions.admin,
          method: "PUT",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "POST"),
        request("/studio/api/entities", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/studio/api/entities", "DELETE"),
        request("/studio/api/entities?type=post&id=draft", {
          cookie: sessions.admin,
          method: "DELETE",
          body: { confirmed: true },
        }),
      ],
      [
        findRoute(plugin, "/studio/api/upload", "POST"),
        uploadRequest(sessions.admin),
      ],
      [
        findRoute(plugin, "/studio/api/assist", "POST"),
        request("/studio/api/assist", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/studio/api/ask-agent", "POST"),
        request("/studio/api/ask-agent", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
    ];

    for (const [route, crossOriginRequest] of mutationRequests) {
      crossOriginRequest.headers.set("Origin", "https://evil.example.com");
      const response = await route.handler(crossOriginRequest);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Same-origin request required",
      });
    }
  });
});
