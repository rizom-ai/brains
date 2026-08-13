import { createTempDataDir } from "@brains/plugins/test";
import { afterEach, describe, expect, it } from "bun:test";
import { AuthServicePlugin } from "@brains/auth-service";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
  type CmsWorkspaceRegistration,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { cmsPlugin, type CmsPlugin } from "../src";

const authPlugins: AuthServicePlugin[] = [];

afterEach(async () => {
  for (const plugin of authPlugins.splice(0).reverse()) {
    await plugin.shutdown?.();
  }
});

class NoteTestAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "note",
      purpose: "Test notes",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({ title: z.string().optional() }),
    });
  }

  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  public override fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: "note", content: markdown };
  }
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
  if (!route) throw new Error(`Missing ${method} route: ${path}`);
  return route;
}

async function createSessionCookie(shell: MockShell): Promise<string> {
  const authPlugin = new AuthServicePlugin({
    storageDir: await createTempDataDir("brains-cms-workspace-auth-"),
  });
  await authPlugin.register(shell);
  authPlugins.push(authPlugin);
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

async function registerWorkspace(
  shell: MockShell,
  registration: CmsWorkspaceRegistration,
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
    const payload = z
      .object({ workspaces: z.array(z.unknown()).optional() })
      .parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.workspaces).toEqual([]);
  });

  it("registers universal CMS follow-ups at a non-default mount", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    shell
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new NoteTestAdapter());
    const plugin = cmsPlugin({ routePath: "/studio" });
    await plugin.register(shell);
    shell.getInboxFollowUpRegistry().finalize();

    expect(
      await shell.getInboxFollowUpRegistry().resolveUniversal({
        sourceId: "email-triage",
        actor: { permissionLevel: "admin" },
        item: {
          id: "mail-1",
          title: "Review the proposal",
          summary: "Classifier summary must not be copied.",
          receivedAt: "2026-08-13T08:00:00.000Z",
          urgency: "high",
          entityRef: { entityType: "note", entityId: "new" },
          actions: [],
        },
      }),
    ).toEqual([
      {
        kind: "capture-as-note",
        label: "Capture as note",
        href: "/studio/entities/note?mode=create",
        state: {
          cmsCreatePrefill: {
            version: 1,
            entityType: "note",
            title: "Review the proposal",
            backlink: "entity://note/new",
          },
        },
      },
      {
        kind: "open-entity",
        label: "Open source entity",
        href: "/studio/entities/note/new",
      },
    ]);
  });

  it("hides note capture when the note entity capability is absent", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();
    await plugin.register(shell);
    shell.getInboxFollowUpRegistry().finalize();

    const resolved = await shell.getInboxFollowUpRegistry().resolveUniversal({
      sourceId: "recurring-checks",
      actor: { permissionLevel: "admin" },
      item: {
        id: "alert-1",
        title: "Check the import",
        receivedAt: "2026-08-13T08:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "operation-status", entityId: "sync-1" },
        actions: [],
      },
    });

    expect(resolved.map((entry) => entry.kind)).toEqual(["open-entity"]);
  });

  it("hides note capture when entity policy forbids creation", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    shell
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new NoteTestAdapter());
    const permissionService = new PermissionService({
      entityActions: { note: { create: "never" } },
    });
    shell.getPermissionService = (): PermissionService => permissionService;
    const plugin = cmsPlugin();
    await plugin.register(shell);
    shell.getInboxFollowUpRegistry().finalize();

    const resolved = await shell.getInboxFollowUpRegistry().resolveUniversal({
      sourceId: "email-triage",
      actor: { permissionLevel: "admin" },
      item: {
        id: "mail-1",
        title: "Review the proposal",
        receivedAt: "2026-08-13T08:00:00.000Z",
        urgency: "high",
        entityRef: { entityType: "mail-item", entityId: "mail-1" },
        actions: [],
      },
    });

    expect(resolved.map((entry) => entry.kind)).toEqual(["open-entity"]);
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
      accessHandler: () => true,
      dataProvider: async () => ({ summary: { queued: 2 } }),
    });

    expect(response).toEqual({
      success: true,
      data: { workspaceUrl: "/studio/workspaces/publishing" },
    });
  });

  it("accepts the typed Email Triage workspace renderer", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();
    await plugin.register(shell);

    const response = await registerWorkspace(shell, {
      id: "email-triage",
      pluginId: "email-triage",
      label: "Email Triage",
      rendererName: "EmailTriageWorkspace",
      priority: 30,
      entityTypes: ["mail-item"],
      accessHandler: (actor) => actor.userPermissionLevel === "admin",
      dataProvider: async () => ({ items: [] }),
    });

    expect(response).toEqual({
      success: true,
      data: { workspaceUrl: "/cms/workspaces/email-triage" },
    });
  });

  it("accepts the typed Unified Inbox workspace renderer", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const plugin = cmsPlugin();
    await plugin.register(shell);

    const response = await registerWorkspace(shell, {
      id: "inbox",
      pluginId: "unified-inbox",
      label: "Inbox",
      rendererName: "UnifiedInboxWorkspace",
      priority: 20,
      accessHandler: (actor) => actor.userPermissionLevel === "admin",
      dataProvider: async () => ({ entries: [] }),
    });

    expect(response).toEqual({
      success: true,
      data: { workspaceUrl: "/cms/workspaces/inbox" },
    });
  });

  it("exposes URL query capability only for opted-in workspaces", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);
    await registerWorkspace(shell, {
      id: "inbox",
      pluginId: "unified-inbox",
      label: "Inbox",
      rendererName: "UnifiedInboxWorkspace",
      priority: 20,
      urlQuery: true,
      accessHandler: () => true,
      dataProvider: async () => ({ entries: [] }),
    });
    await registerWorkspace(shell, {
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
      accessHandler: () => true,
      dataProvider: async () => ({ queue: [] }),
    });

    const response = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );

    expect(await response.json()).toMatchObject({
      workspaces: [{ id: "inbox", urlQuery: true }, { id: "publishing" }],
    });
    const payload = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    const descriptors = z
      .object({ workspaces: z.array(z.record(z.string(), z.unknown())) })
      .parse(await payload.json()).workspaces;
    expect(descriptors[1]).not.toHaveProperty("urlQuery");
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
      accessHandler: () => true,
      dataProvider: async () => ({ summary: { queued: 2 } }),
    });

    const typesResponse = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    const typesPayload = z
      .object({ workspaces: z.array(z.unknown()) })
      .parse(await typesResponse.json());
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

  it("resolves actor-aware entityTypes when listing descriptors", async () => {
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
      // Providers with per-actor publishable types resolve them against the
      // real caller instead of disclosing the full registered list.
      entityTypes: (actor) =>
        actor.userPermissionLevel === "admin" ? ["post", "newsletter"] : [],
      accessHandler: () => true,
      dataProvider: async () => ({ summary: { queued: 2 } }),
    });

    const typesResponse = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    const typesPayload = z
      .object({
        workspaces: z.array(z.object({ entityTypes: z.array(z.string()) })),
      })
      .parse(await typesResponse.json());
    expect(typesPayload.workspaces).toEqual([
      { entityTypes: ["post", "newsletter"] },
    ]);
  });

  it("passes authorized workspace query parameters to the provider", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);
    const queries: unknown[] = [];
    await registerWorkspace(shell, {
      id: "inbox",
      pluginId: "unified-inbox",
      label: "Inbox",
      rendererName: "UnifiedInboxWorkspace",
      priority: 20,
      accessHandler: () => true,
      dataProvider: async (_actor, query) => {
        queries.push(query);
        return { entries: [] };
      },
    });

    const response = await findRoute(plugin, "/cms/api/workspace").handler(
      request(
        "/cms/api/workspace?id=inbox&sourceId=mail-items&urgency=high&offset=50&limit=50",
        { cookie },
      ),
    );

    expect(response.status).toBe(200);
    expect(queries).toEqual([
      {
        sourceId: "mail-items",
        urgency: "high",
        offset: "50",
        limit: "50",
      },
    ]);
  });

  it("access-checks and failure-isolates workspace badges", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const cookie = await createSessionCookie(shell);
    const plugin = cmsPlugin();
    await plugin.register(shell);
    let deniedBadgeCalls = 0;
    await registerWorkspace(shell, {
      id: "inbox",
      pluginId: "unified-inbox",
      label: "Inbox",
      rendererName: "UnifiedInboxWorkspace",
      priority: 20,
      accessHandler: () => true,
      dataProvider: async () => ({}),
      badgeProvider: async () => 7,
    });
    await registerWorkspace(shell, {
      id: "broken",
      pluginId: "broken-plugin",
      label: "Broken",
      rendererName: "DirectorySyncWorkspace",
      priority: 21,
      accessHandler: () => true,
      dataProvider: async () => ({}),
      badgeProvider: async () => {
        throw new Error("private badge failure");
      },
    });
    await registerWorkspace(shell, {
      id: "denied",
      pluginId: "denied-plugin",
      label: "Denied",
      rendererName: "DirectorySyncWorkspace",
      priority: 22,
      accessHandler: () => false,
      dataProvider: async () => ({}),
      badgeProvider: async () => {
        deniedBadgeCalls += 1;
        return 99;
      },
    });

    const response = await findRoute(plugin, "/cms/api/types").handler(
      request("/cms/api/types", { cookie }),
    );
    const payload = await response.json();

    expect(payload).toMatchObject({
      workspaces: [{ id: "inbox", badge: 7 }, { id: "broken" }],
    });
    expect(JSON.stringify(payload)).not.toContain("private badge failure");
    expect(JSON.stringify(payload)).not.toContain("denied");
    expect(deniedBadgeCalls).toBe(0);
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
      accessHandler: () => true,
      dataProvider: async () => ({}),
    });
    await registerWorkspace(shell, {
      id: "sync",
      pluginId: "directory-sync",
      label: "Sync",
      rendererName: "DirectorySyncWorkspace",
      priority: 60,
      accessHandler: () => true,
      dataProvider: async () => ({}),
    });
    await registerWorkspace(shell, {
      id: "publishing",
      pluginId: "content-pipeline",
      label: "Publishing",
      rendererName: "PublishingWorkspace",
      priority: 40,
      accessHandler: () => true,
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
      accessHandler: () => true,
      dataProvider: async () => ({ source: "original" }),
    });
    const duplicate = await registerWorkspace(shell, {
      id: "site",
      pluginId: "other-plugin",
      label: "Other site",
      rendererName: "SiteWorkspace",
      priority: 10,
      accessHandler: () => true,
      dataProvider: async () => ({ source: "duplicate" }),
    });

    expect(duplicate).toEqual({
      success: false,
      error: "CMS workspace already registered: site",
    });
  });

  it("derives the authenticated CMS actor for registered actions", async () => {
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
      accessHandler: () => true,
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
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      action: { type: "retry" },
      actor: expect.objectContaining({
        interfaceType: "cms",
        actor: expect.objectContaining({ kind: "user" }),
        userPermissionLevel: "admin",
        visibilityScope: "restricted",
        isAnchor: true,
      }),
    });
  });
});
