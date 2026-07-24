import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, spyOn } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { cmsPlugin, type CmsPlugin } from "../src";

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
  plugin: CmsPlugin,
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === path && (candidate.method ?? "GET") === method,
    );
  expect(route).toBeDefined();
  return route as WebRouteDefinition;
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
  return new Request("https://yeehaa.io/cms/api/upload", {
    method: "POST",
    headers: cookie ? { Cookie: cookie, Origin: "https://yeehaa.io" } : {},
    body: form,
  });
}

function apiRouteRequests(): RouteRequest[] {
  return [
    {
      routePath: "/cms/api/types",
      request: (cookie) => request("/cms/api/types", { cookie }),
    },
    {
      routePath: "/cms/api/workspace",
      request: (cookie) => request("/cms/api/workspace", { cookie }),
    },
    {
      routePath: "/cms/api/workspace",
      method: "POST",
      request: (cookie) =>
        request("/cms/api/workspace", { cookie, method: "POST", body: {} }),
    },
    {
      routePath: "/cms/api/schema",
      request: (cookie) => request("/cms/api/schema", { cookie }),
    },
    {
      routePath: "/cms/api/entities",
      request: (cookie) => request("/cms/api/entities", { cookie }),
    },
    {
      routePath: "/cms/api/entities",
      method: "PUT",
      request: (cookie) =>
        request("/cms/api/entities", { cookie, method: "PUT", body: {} }),
    },
    {
      routePath: "/cms/api/entities",
      method: "POST",
      request: (cookie) =>
        request("/cms/api/entities", { cookie, method: "POST", body: {} }),
    },
    {
      routePath: "/cms/api/entities",
      method: "DELETE",
      request: (cookie) =>
        request("/cms/api/entities", { cookie, method: "DELETE" }),
    },
    {
      routePath: "/cms/api/upload",
      method: "POST",
      request: uploadRequest,
    },
    {
      routePath: "/cms/api/assist",
      method: "POST",
      request: (cookie) =>
        request("/cms/api/assist", { cookie, method: "POST", body: {} }),
    },
    {
      routePath: "/cms/api/agents",
      request: (cookie) => request("/cms/api/agents", { cookie }),
    },
    {
      routePath: "/cms/api/ask-agent",
      method: "POST",
      request: (cookie) =>
        request("/cms/api/ask-agent", {
          cookie,
          method: "POST",
          body: {},
        }),
    },
    {
      routePath: "/cms/api/sync-status",
      request: (cookie) => request("/cms/api/sync-status", { cookie }),
    },
  ];
}

async function createSessionMatrix(shell: MockShell): Promise<SessionMatrix> {
  const authPlugin = new AuthServicePlugin({
    storageDir: await mkdtemp(join(tmpdir(), "brains-cms-permission-gate-")),
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
  plugin: CmsPlugin;
  sessions: SessionMatrix;
}> {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const sessions = await createSessionMatrix(shell);
  const plugin = cmsPlugin();
  await plugin.register(shell);
  return { shell, plugin, sessions };
}

describe("CMS Admin rollout gate", () => {
  it("inventories every private API route under one access matrix", async () => {
    const { plugin, sessions } = await setup();
    const apiRoutes = apiRouteRequests();

    expect(
      plugin
        .getWebRoutes()
        .filter((route) => route.path.startsWith("/cms/api/"))
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

      for (const cookie of [sessions.trusted, sessions.public]) {
        const response = await route.handler(routeCase.request(cookie));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
          error: "CMS access forbidden",
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

  it("keeps every shell entry Admin-only during lower-level policy work", async () => {
    const { plugin, sessions } = await setup();
    const shellRoutes = [
      { routePath: "/cms", requestPath: "/cms" },
      {
        routePath: "/cms/entities",
        requestPath: "/cms/entities/post/shared-draft",
      },
      {
        routePath: "/cms/workspaces",
        requestPath: "/cms/workspaces/publishing",
      },
    ];

    for (const shellRoute of shellRoutes) {
      const route = findRoute(plugin, shellRoute.routePath);
      const adminResponse = await route.handler(
        request(shellRoute.requestPath, { cookie: sessions.admin }),
      );
      expect(adminResponse.status).toBe(200);

      for (const cookie of [sessions.trusted, sessions.public]) {
        const response = await route.handler(
          request(shellRoute.requestPath, { cookie }),
        );
        expect(response.status).toBe(403);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }

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

  it("denies Trusted requests before direct mutation or private capability code", async () => {
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
    shell.generateObject = async <T>(): Promise<{ object: T }> => {
      assistCalls += 1;
      return { object: { suggestion: "Never reached" } as T };
    };
    await shell.getMessageBus().send({
      type: "cms:register-workspace",
      sender: "test-workspace",
      payload: {
        id: "test-workspace",
        pluginId: "test-workspace",
        label: "Test workspace",
        rendererName: "PublishingWorkspace",
        priority: 1,
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

    const trustedRequests: Array<[WebRouteDefinition, Request]> = [
      [
        findRoute(plugin, "/cms/api/entities", "POST"),
        request("/cms/api/entities", {
          cookie: sessions.trusted,
          method: "POST",
          body: { entityType: "post", frontmatter: { title: "Draft" } },
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "PUT"),
        request("/cms/api/entities", {
          cookie: sessions.trusted,
          method: "PUT",
          body: {
            entityType: "post",
            id: "shared-draft",
            frontmatter: { title: "Draft" },
          },
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "DELETE"),
        request("/cms/api/entities?type=post&id=shared-draft", {
          cookie: sessions.trusted,
          method: "DELETE",
        }),
      ],
      [
        findRoute(plugin, "/cms/api/assist", "POST"),
        request("/cms/api/assist", {
          cookie: sessions.trusted,
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
        findRoute(plugin, "/cms/api/upload", "POST"),
        uploadRequest(sessions.trusted),
      ],
      [
        findRoute(plugin, "/cms/api/workspace"),
        request("/cms/api/workspace?id=test-workspace", {
          cookie: sessions.trusted,
        }),
      ],
      [
        findRoute(plugin, "/cms/api/workspace", "POST"),
        request("/cms/api/workspace", {
          cookie: sessions.trusted,
          method: "POST",
          body: { id: "test-workspace", action: { type: "run" } },
        }),
      ],
    ];

    for (const [route, trustedRequest] of trustedRequests) {
      expect((await route.handler(trustedRequest)).status).toBe(403);
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

  it("rejects cross-origin requests on every cookie-authenticated mutation", async () => {
    const { plugin, sessions } = await setup();
    const mutationRequests: Array<[WebRouteDefinition, Request]> = [
      [
        findRoute(plugin, "/cms/api/workspace", "POST"),
        request("/cms/api/workspace", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "PUT"),
        request("/cms/api/entities", {
          cookie: sessions.admin,
          method: "PUT",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "POST"),
        request("/cms/api/entities", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/cms/api/entities", "DELETE"),
        request("/cms/api/entities?type=post&id=draft", {
          cookie: sessions.admin,
          method: "DELETE",
          body: { confirmed: true },
        }),
      ],
      [
        findRoute(plugin, "/cms/api/upload", "POST"),
        uploadRequest(sessions.admin),
      ],
      [
        findRoute(plugin, "/cms/api/assist", "POST"),
        request("/cms/api/assist", {
          cookie: sessions.admin,
          method: "POST",
          body: {},
        }),
      ],
      [
        findRoute(plugin, "/cms/api/ask-agent", "POST"),
        request("/cms/api/ask-agent", {
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
