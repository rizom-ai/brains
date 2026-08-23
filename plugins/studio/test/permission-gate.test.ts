import { createTempDataDir } from "@brains/plugins/test";
import { describe, expect, it, spyOn } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import { ServicePlugin, type WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { z, type ZodType } from "@brains/utils/zod";
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

class AdminSurfacePlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  constructor() {
    super("admin", { name: "admin", version: "1.0.0" }, {}, z.object({}));
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: "/admin",
        method: "GET",
        public: true,
        handler: async () => new Response("admin"),
      },
    ];
  }
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

describe("Studio Trusted rollout gate", () => {
  it("inventories every private API route under one access matrix", async () => {
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
      if (trustedResponse.status === 403) {
        expect(await trustedResponse.json()).not.toEqual({
          error: "Studio access forbidden",
        });
      }

      const publicResponse = await route.handler(
        routeCase.request(sessions.public),
      );
      expect(publicResponse.status).toBe(403);
      expect(await publicResponse.json()).toEqual({
        error: "Studio access forbidden",
      });

      for (const cookie of [undefined, sessions.invited, sessions.suspended]) {
        const response = await route.handler(routeCase.request(cookie));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          error: "Authentication required",
        });
      }
    }
  });

  it("admits Trusted shell entries while keeping Public users out", async () => {
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
      expect(publicResponse.status).toBe(403);
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

  it("renders the surface strip at the caller's own permission level", async () => {
    const { shell, plugin, sessions } = await setup();
    // A registered admin console route would appear in the strip for an
    // Admin caller; the strip must never show it to a Trusted caller.
    shell.registerPlugin(new AdminSurfacePlugin());
    const route = findRoute(plugin, "/studio");

    const adminHtml = await (
      await route.handler(request("/studio", { cookie: sessions.admin }))
    ).text();
    expect(adminHtml).toContain('href="/admin"');

    const trustedHtml = await (
      await route.handler(request("/studio", { cookie: sessions.trusted }))
    ).text();
    expect(trustedHtml).not.toContain('href="/admin"');
    // The Trusted caller keeps the Studio's own door.
    expect(trustedHtml).toContain('href="/studio"');
  });

  it("denies Public requests before mutation or private capability code", async () => {
    const { shell, plugin, sessions } = await setup();
    let schemaLookups = 0;
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
        accessHandler: () => true,
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
      expect((await route.handler(publicRequest)).status).toBe(403);
    }
    expect(getEntitySpy).not.toHaveBeenCalled();
    expect({
      schemaLookups,
      workspaceReads,
      workspaceActions,
      uploadPromotions,
      assistCalls,
    }).toEqual({
      schemaLookups: 0,
      workspaceReads: 0,
      workspaceActions: 0,
      uploadPromotions: 0,
      assistCalls: 0,
    });
  });

  it("keeps repository sync metadata Admin-only after Trusted rollout", async () => {
    const { shell, plugin, sessions } = await setup();
    let syncReads = 0;
    shell.getMessageBus().subscribe("sync:status:request", async () => {
      syncReads += 1;
      return { success: true, data: {} };
    });

    const response = await findRoute(plugin, "/studio/api/sync-status").handler(
      request("/studio/api/sync-status", { cookie: sessions.trusted }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Admin Studio capability required",
    });
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
