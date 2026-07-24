import { describe, expect, it } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { CmsWorkspaceRegistry } from "../src/workspace-registry";

const frontmatterSchema = z.object({ title: z.string() });

class ReadFixtureAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: `${entityType} permission-aware read fixtures`,
      schema: baseEntitySchema,
      frontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content: markdown };
  }
}

const trustedPrincipal: AuthPrincipal = {
  userId: "usr_trusted",
  personId: "person_trusted",
  displayName: "Trusted editor",
  role: "trusted",
  status: "active",
  permissionLevel: "trusted",
  isAnchor: false,
  canonicalId: "user:trusted-editor",
};

function fixtureEntity(
  entityType: string,
  id: string,
  visibility: BaseEntity["visibility"],
): BaseEntity {
  return {
    id,
    entityType,
    content: `---\ntitle: ${id}\n---\n\n${id} body\n`,
    metadata: { title: id },
    visibility,
    contentHash: `${id}-hash`,
    created: "2026-07-01T00:00:00.000Z",
    updated: "2026-07-01T00:00:00.000Z",
  };
}

function createReadFixture(): {
  shell: MockShell;
  routes: WebRouteDefinition[];
} {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  for (const entityType of ["post", "empty-collab", "secret"]) {
    registry.registerEntityType(
      entityType,
      baseEntitySchema,
      new ReadFixtureAdapter(entityType),
    );
  }
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof frontmatterSchema | undefined =>
    ["post", "empty-collab", "secret"].includes(entityType)
      ? frontmatterSchema
      : undefined;

  shell.addEntities([
    fixtureEntity("post", "public-post", "public"),
    fixtureEntity("post", "shared-post", "shared"),
    fixtureEntity("post", "restricted-post", "restricted"),
    fixtureEntity("secret", "restricted-secret", "restricted"),
  ]);

  const permissionService = shell.getPermissionService();
  permissionService.assertEntityActionAllowed = (
    entityType,
    action,
    userLevel,
  ): void => {
    if (userLevel === "admin") return;
    if (
      userLevel === "trusted" &&
      ((entityType === "post" &&
        (action === "create" || action === "update")) ||
        (entityType === "empty-collab" && action === "create"))
    ) {
      return;
    }
    throw new Error(`${action} ${entityType} denied`);
  };
  shell.getPermissionService = (): typeof permissionService =>
    permissionService;

  const workspaceRegistry = new CmsWorkspaceRegistry();
  workspaceRegistry.register({
    id: "directory-sync",
    pluginId: "directory-sync",
    label: "Directory Sync",
    rendererName: "DirectorySyncWorkspace",
    priority: 10,
    dataProvider: async (): Promise<Record<string, never>> => ({}),
  });

  const context = createServicePluginContext(shell, "cms");
  const routes = createEditorRoutes({
    routePath: "/cms",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> => trustedPrincipal,
    minimumPermissionLevel: "trusted",
    getEntityDisplay: () => undefined,
    workspaceRegistry,
  });
  return { shell, routes };
}

function findRoute(
  routes: WebRouteDefinition[],
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = routes.find(
    (candidate) =>
      candidate.path === path && (candidate.method ?? "GET") === method,
  );
  expect(route).toBeDefined();
  return route as WebRouteDefinition;
}

function request(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Request {
  return new Request(`https://yeehaa.io${path}`, {
    method: options.method ?? "GET",
    ...(options.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }),
  });
}

describe("CMS principal-aware reads behind the rollout gate", () => {
  it("scopes counts, filters type discovery, and returns policy capabilities", async () => {
    const { routes } = createReadFixture();
    const response = await findRoute(routes, "/cms/api/types").handler(
      request("/cms/api/types"),
    );
    const payload = (await response.json()) as {
      types: Array<{
        entityType: string;
        count: number;
        capabilities: Record<string, boolean>;
      }>;
      workspaces: unknown[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.types.map((type) => type.entityType)).toEqual([
      "post",
      "empty-collab",
    ]);
    expect(payload.types.find((type) => type.entityType === "post")).toEqual(
      expect.objectContaining({
        count: 2,
        capabilities: {
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: false,
          canExtract: false,
          canPublish: false,
          canAssist: true,
        },
      }),
    );
    expect(
      payload.types.find((type) => type.entityType === "empty-collab"),
    ).toEqual(
      expect.objectContaining({
        count: 0,
        capabilities: expect.objectContaining({
          canRead: true,
          canCreate: true,
          canUpdate: false,
        }),
      }),
    );
    expect(payload.workspaces).toEqual([]);
  });

  it("allows only visible schemas, lists, and entity details", async () => {
    const { routes } = createReadFixture();

    const [postSchema, secretSchema, unknownSchema, list, shared, restricted] =
      await Promise.all([
        findRoute(routes, "/cms/api/schema").handler(
          request("/cms/api/schema?type=post"),
        ),
        findRoute(routes, "/cms/api/schema").handler(
          request("/cms/api/schema?type=secret"),
        ),
        findRoute(routes, "/cms/api/schema").handler(
          request("/cms/api/schema?type=missing"),
        ),
        findRoute(routes, "/cms/api/entities").handler(
          request("/cms/api/entities?type=post"),
        ),
        findRoute(routes, "/cms/api/entities").handler(
          request("/cms/api/entities?type=post&id=shared-post"),
        ),
        findRoute(routes, "/cms/api/entities").handler(
          request("/cms/api/entities?type=post&id=restricted-post"),
        ),
      ]);

    expect(postSchema.status).toBe(200);
    expect(secretSchema.status).toBe(404);
    expect(unknownSchema.status).toBe(404);
    expect(
      ((await list.json()) as { entities: Array<{ id: string }> }).entities.map(
        (entity) => entity.id,
      ),
    ).toEqual(["public-post", "shared-post"]);
    expect(
      ((await shared.json()) as { entity: { id: string } }).entity.id,
    ).toBe("shared-post");
    expect(restricted.status).toBe(404);
  });

  it("keeps unfinished capabilities Admin-only under a Trusted read gate", async () => {
    const { routes, shell } = createReadFixture();
    let workspaceReads = 0;
    let assists = 0;
    shell.getMessageBus().subscribe("sync:status:request", async () => {
      workspaceReads += 1;
      return { success: true, data: {} };
    });
    shell.generateObject = async <T>(): Promise<{ object: T }> => {
      assists += 1;
      return { object: { suggestion: "not reached" } as T };
    };

    const guardedRequests: Array<{
      path: string;
      method?: WebRouteDefinition["method"];
      request: Request;
    }> = [
      {
        path: "/cms/api/upload",
        method: "POST",
        request: request("/cms/api/upload", { method: "POST" }),
      },
      {
        path: "/cms/api/assist",
        method: "POST",
        request: request("/cms/api/assist", { method: "POST", body: {} }),
      },
      { path: "/cms/api/agents", request: request("/cms/api/agents") },
      {
        path: "/cms/api/ask-agent",
        method: "POST",
        request: request("/cms/api/ask-agent", {
          method: "POST",
          body: {},
        }),
      },
      {
        path: "/cms/api/workspace",
        request: request("/cms/api/workspace?id=directory-sync"),
      },
      {
        path: "/cms/api/workspace",
        method: "POST",
        request: request("/cms/api/workspace", { method: "POST", body: {} }),
      },
      {
        path: "/cms/api/sync-status",
        request: request("/cms/api/sync-status"),
      },
    ];

    for (const guarded of guardedRequests) {
      const response = await findRoute(
        routes,
        guarded.path,
        guarded.method ?? "GET",
      ).handler(guarded.request);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Admin CMS capability required",
      });
    }
    expect({ workspaceReads, assists }).toEqual({
      workspaceReads: 0,
      assists: 0,
    });
  });
});
