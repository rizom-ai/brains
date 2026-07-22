import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { cmsPlugin, type CmsPlugin } from "../src";

interface TestWorkspaceRegistration {
  id: string;
  pluginId: string;
  label: string;
  rendererName:
    "PublishingWorkspace" | "SiteWorkspace" | "DirectorySyncWorkspace";
  priority: number;
  entityTypes?: string[];
  dataProvider: () => Promise<unknown>;
  actionHandler?: (action: unknown, actor: unknown) => Promise<unknown>;
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

async function createSessionCookie(shell: MockShell): Promise<string> {
  const authPlugin = new AuthServicePlugin({
    storageDir: await mkdtemp(join(tmpdir(), "brains-cms-workspace-auth-")),
  });
  await authPlugin.register(shell);
  return (await authPlugin.getService().createAuthSession()).cookie;
}

function request(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown } = {},
): Request {
  return new Request(`https://yeehaa.io${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}

async function registerWorkspace(
  shell: MockShell,
  registration: TestWorkspaceRegistration,
): Promise<unknown> {
  return shell.getMessageBus().send({
    type: "cms:register-workspace",
    payload: registration,
    sender: registration.pluginId,
  });
}

describe("optional CMS workspaces", () => {
  it("keeps the CMS workspace list empty when no provider registers", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);

    const response = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    const payload = (await response.json()) as { workspaces?: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.workspaces).toEqual([]);
  });

  it("registers a workspace and returns its configured CMS URL", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin({ routePath: "/studio" });
    await plugin.register(shell);

    const response = await registerWorkspace(shell, {
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
      entityTypes: ["post", "newsletter"],
      dataProvider: async () => ({ summary: { queued: 2 } }),
    });

    expect(response).toEqual({
      success: true,
      data: { workspaceUrl: "/studio/workspaces/publishing" },
    });
  });

  it("exposes registered descriptors and provider data to the browser", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);
    await registerWorkspace(shell, {
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
      entityTypes: ["post"],
      dataProvider: async () => ({ summary: { queued: 2 } }),
    });

    const typesResponse = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    const typesPayload = (await typesResponse.json()) as {
      workspaces: unknown[];
    };
    expect(typesPayload.workspaces).toEqual([
      {
        id: "publishing",
        pluginId: "content-pipeline",
        label: "Publishing",
        rendererName: "PublishingWorkspace",
        priority: 40,
        entityTypes: ["post"],
      },
    ]);

    const route = findRoute(plugin, "/cms/api/workspace");
    const denied = await route.handler(
      request("/cms/api/workspace?id=publishing"),
    );
    expect(denied.status).toBe(401);

    const response = await route.handler(
      request("/cms/api/workspace?id=publishing", { cookie }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspace: {
        id: "publishing",
        rendererName: "PublishingWorkspace",
        data: { summary: { queued: 2 } },
      },
    });
  });

  it("orders multiple workspaces deterministically", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);

    await registerWorkspace(shell, {
      id: "site",
      pluginId: "site-builder",
      label: "Site",
      rendererName: "SiteWorkspace",
      priority: 50,
      dataProvider: async () => ({}),
    });
    await registerWorkspace(shell, {
      id: "sync",
      pluginId: "directory-sync",
      label: "Sync",
      rendererName: "DirectorySyncWorkspace",
      priority: 60,
      dataProvider: async () => ({}),
    });
    await registerWorkspace(shell, {
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
      dataProvider: async () => ({}),
    });

    const response = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    expect(await response.json()).toMatchObject({
      workspaces: [{ id: "publishing" }, { id: "site" }, { id: "sync" }],
    });
  });

  it("rejects duplicate workspace ids without replacing the provider", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();
    await plugin.register(shell);

    await registerWorkspace(shell, {
      id: "site",
      pluginId: "site-builder",
      label: "Site",
      rendererName: "SiteWorkspace",
      priority: 50,
      dataProvider: async () => ({ source: "original" }),
    });
    const duplicate = await registerWorkspace(shell, {
      id: "site",
      pluginId: "other-plugin",
      label: "Other site",
      rendererName: "SiteWorkspace",
      priority: 10,
      dataProvider: async () => ({ source: "duplicate" }),
    });

    expect(duplicate).toEqual({
      success: false,
      error: "CMS workspace already registered: site",
    });
  });

  it("derives an admin CMS actor for registered actions", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);
    const calls: Array<{ action: unknown; actor: unknown }> = [];
    await registerWorkspace(shell, {
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
      dataProvider: async () => ({}),
      actionHandler: async (action, actor) => {
        calls.push({ action, actor });
        return { accepted: true };
      },
    });

    const route = findRoute(plugin, "/cms/api/workspace", "POST");
    const denied = await route.handler(
      request("/cms/api/workspace", {
        method: "POST",
        body: { id: "publishing", action: { type: "retry" } },
      }),
    );
    expect(denied.status).toBe(401);

    const response = await route.handler(
      request("/cms/api/workspace", {
        cookie,
        method: "POST",
        body: { id: "publishing", action: { type: "retry" } },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { accepted: true } });
    expect(calls).toEqual([
      {
        action: { type: "retry" },
        actor: {
          interfaceType: "cms",
          userId: "operator",
          userPermissionLevel: "admin",
        },
      },
    ]);
  });
});
