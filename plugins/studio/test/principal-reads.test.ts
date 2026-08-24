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
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

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

  const workspaceRegistry = new StudioWorkspaceRegistry();
  workspaceRegistry.register({
    id: "directory-sync",
    pluginId: "directory-sync",
    label: "Directory Sync",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 10,
    accessHandler: (actor) => actor.userPermissionLevel === "admin",
    dataProvider: async (): Promise<Record<string, never>> => ({}),
  });

  const context = createServicePluginContext(shell, "studio");
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> => trustedPrincipal,
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
  if (!route) throw new Error(`Missing ${method} route: ${path}`);
  return route;
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

describe("Studio principal-aware reads behind the rollout gate", () => {
  it("scopes counts, filters type discovery, and returns policy capabilities", async () => {
    const { routes } = createReadFixture();
    const response = await findRoute(routes, "/studio/api/types").handler(
      request("/studio/api/types"),
    );
    const payload = z
      .object({
        types: z.array(
          z.object({
            entityType: z.string(),
            count: z.number(),
            capabilities: z.record(z.string(), z.boolean()),
          }),
        ),
        workspaces: z.array(z.unknown()),
      })
      .parse(await response.json());

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
        findRoute(routes, "/studio/api/schema").handler(
          request("/studio/api/schema?type=post"),
        ),
        findRoute(routes, "/studio/api/schema").handler(
          request("/studio/api/schema?type=secret"),
        ),
        findRoute(routes, "/studio/api/schema").handler(
          request("/studio/api/schema?type=missing"),
        ),
        findRoute(routes, "/studio/api/entities").handler(
          request("/studio/api/entities?type=post"),
        ),
        findRoute(routes, "/studio/api/entities").handler(
          request("/studio/api/entities?type=post&id=shared-post"),
        ),
        findRoute(routes, "/studio/api/entities").handler(
          request("/studio/api/entities?type=post&id=restricted-post"),
        ),
      ]);

    expect(postSchema.status).toBe(200);
    const schemaPayload = z
      .object({
        fields: z.array(
          z.object({
            name: z.string(),
            options: z.array(z.string()).optional(),
          }),
        ),
      })
      .parse(await postSchema.json());
    expect(
      schemaPayload.fields.find((field) => field.name === "visibility")
        ?.options,
    ).toEqual(["public", "shared"]);
    expect(secretSchema.status).toBe(404);
    expect(unknownSchema.status).toBe(404);
    const listed = z
      .object({ entities: z.array(z.object({ id: z.string() })) })
      .parse(await list.json());
    const sharedEntity = z
      .object({ entity: z.object({ id: z.string() }) })
      .parse(await shared.json());
    expect(listed.entities.map((entity) => entity.id)).toEqual([
      "public-post",
      "shared-post",
    ]);
    expect(sharedEntity.entity.id).toBe("shared-post");
    expect(restricted.status).toBe(404);
  });
});
