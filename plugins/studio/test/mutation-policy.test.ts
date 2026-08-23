import { describe, expect, it } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
} from "@brains/plugins";
import { PermissionService } from "@brains/templates";
import { createMockShell, type MockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const mutationFrontmatterSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]).optional(),
});

type MutationFrontmatter = z.infer<typeof mutationFrontmatterSchema>;

class MutationFixtureAdapter extends BaseEntityAdapter<
  BaseEntity,
  Record<string, unknown>,
  MutationFrontmatter
> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: `${entityType} Studio mutation policy fixtures`,
      schema: baseEntitySchema,
      frontmatterSchema: mutationFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    const frontmatter = this.parseFrontmatter(markdown);
    return {
      entityType: this.entityType,
      content: markdown,
      metadata:
        this.entityType === "smuggle"
          ? { ...frontmatter, visibility: "restricted" }
          : frontmatter,
      ...(this.entityType === "smuggle" ? { visibility: "restricted" } : {}),
    };
  }
}

type FixturePermissionLevel = "public" | "trusted" | "admin";

const principalFor = (
  permissionLevel: FixturePermissionLevel,
): AuthPrincipal => ({
  userId: `usr_${permissionLevel}`,
  personId: `person_${permissionLevel}`,
  displayName: `${permissionLevel} editor`,
  role: permissionLevel,
  status: "active",
  permissionLevel,
  isAnchor: permissionLevel === "admin",
});

function fixtureEntity(input: {
  id: string;
  entityType?: string;
  status?: "draft" | "published";
  visibility: BaseEntity["visibility"];
}): BaseEntity {
  const entityType = input.entityType ?? "post";
  const metadata = {
    title: input.id,
    ...(input.status ? { status: input.status } : {}),
  };
  const statusLine = input.status ? `status: ${input.status}\n` : "";
  return {
    id: input.id,
    entityType,
    content:
      `---\ntitle: ${input.id}\n${statusLine}` +
      `visibility: ${input.visibility}\n---\n\n${input.id} body\n`,
    metadata,
    visibility: input.visibility,
    contentHash: `${input.id}-hash`,
    created: "2026-07-01T00:00:00.000Z",
    updated: "2026-07-01T00:00:00.000Z",
  };
}

function createMutationFixture(
  permissionLevel: FixturePermissionLevel = "trusted",
): {
  shell: MockShell;
  routes: WebRouteDefinition[];
  setPermissionLevel: (level: FixturePermissionLevel) => void;
  permissionService: PermissionService;
} {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  for (const entityType of ["post", "secret", "never-note", "smuggle"]) {
    registry.registerEntityType(
      entityType,
      baseEntitySchema,
      new MutationFixtureAdapter(entityType),
      entityType === "post"
        ? { publish: { publishStatuses: ["published"] } }
        : {},
    );
  }
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof mutationFrontmatterSchema | undefined =>
    ["post", "secret", "never-note", "smuggle"].includes(entityType)
      ? mutationFrontmatterSchema
      : undefined;

  shell.addEntities([
    fixtureEntity({
      id: "shared-draft",
      status: "draft",
      visibility: "shared",
    }),
    fixtureEntity({
      id: "published-post",
      status: "published",
      visibility: "shared",
    }),
    fixtureEntity({
      id: "restricted-draft",
      status: "draft",
      visibility: "restricted",
    }),
    fixtureEntity({
      id: "never-note",
      entityType: "never-note",
      visibility: "restricted",
    }),
  ]);

  const permissionService = new PermissionService({
    entityActions: {
      "*": {
        create: "admin",
        update: "admin",
        delete: "admin",
        extract: "never",
        publish: "admin",
      },
      post: { create: "trusted", update: "trusted" },
      smuggle: { create: "trusted", update: "trusted" },
      "never-note": {
        create: "never",
        update: "never",
        delete: "never",
        publish: "never",
      },
    },
  });
  shell.getPermissionService = (): PermissionService => permissionService;

  let activePermissionLevel = permissionLevel;
  const context = createServicePluginContext(shell, "studio");
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> =>
      principalFor(activePermissionLevel),
    minimumPermissionLevel: "trusted",
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
  });
  return {
    shell,
    routes,
    setPermissionLevel: (level): void => {
      activePermissionLevel = level;
    },
    permissionService,
  };
}

function findRoute(
  routes: WebRouteDefinition[],
  method: "POST" | "PUT" | "DELETE",
): WebRouteDefinition {
  const route = routes.find(
    (candidate) =>
      candidate.path === "/studio/api/entities" && candidate.method === method,
  );
  if (!route) throw new Error(`Missing ${method} entity route`);
  return route;
}

function mutationRequest(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  options: {
    origin?: string | null;
    contentType?: string;
  } = {},
): Request {
  const origin =
    options.origin === undefined ? "https://yeehaa.io" : options.origin;
  return new Request(`https://yeehaa.io${path}`, {
    method,
    headers: {
      ...(origin === null ? {} : { Origin: origin }),
      "Content-Type": options.contentType ?? "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createPayload(input: {
  entityType: string;
  title: string;
  visibility: "public" | "shared" | "restricted";
}): Record<string, unknown> {
  return {
    entityType: input.entityType,
    frontmatter: {
      title: input.title,
      status: "draft",
      visibility: input.visibility,
    },
    body: `${input.title} body`,
  };
}

function updatePayload(input: {
  id: string;
  status: "draft" | "published";
  visibility?: "public" | "shared" | "restricted";
  baseContentHash?: string;
}): Record<string, unknown> {
  return {
    entityType: "post",
    id: input.id,
    frontmatter: {
      title: `${input.id} updated`,
      status: input.status,
      visibility: input.visibility ?? "shared",
    },
    body: `${input.id} updated body`,
    ...(input.baseContentHash
      ? { baseContentHash: input.baseContentHash }
      : {}),
  };
}

describe("Studio entity mutation policy", () => {
  it("honours wildcard defaults, type overrides, and never for creates", async () => {
    const trusted = createMutationFixture("trusted");
    const trustedCreate = findRoute(trusted.routes, "POST");

    const allowed = await trustedCreate.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Shared collaboration",
          visibility: "shared",
        }),
      ),
    );
    const wildcardDenied = await trustedCreate.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "secret",
          title: "Admin machinery",
          visibility: "shared",
        }),
      ),
    );

    const admin = createMutationFixture("admin");
    const neverDenied = await findRoute(admin.routes, "POST").handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "never-note",
          title: "Never",
          visibility: "restricted",
        }),
      ),
    );

    expect(allowed.status).toBe(201);
    const allowedEntityId = z
      .object({ entityId: z.string() })
      .parse(await allowed.json()).entityId;
    expect(
      (
        await trusted.shell.getEntityService().getEntity({
          entityType: "post",
          id: allowedEntityId,
        })
      )?.visibility,
    ).toBe("shared");
    expect(wildcardDenied.status).toBe(403);
    expect(neverDenied.status).toBe(403);
    expect(
      await trusted.shell.getEntityService().listEntities({
        entityType: "post",
        options: { filter: { visibilityScope: "shared" } },
      }),
    ).toHaveLength(3);
  });

  it("caps adapter-derived visibility and hides unreadable mutation targets", async () => {
    const { shell, routes } = createMutationFixture("trusted");
    const createRoute = findRoute(routes, "POST");
    const updateRoute = findRoute(routes, "PUT");

    const restrictedCreate = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Restricted create",
          visibility: "restricted",
        }),
      ),
    );
    const restrictedUpdate = await updateRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({
          id: "shared-draft",
          status: "draft",
          visibility: "restricted",
        }),
      ),
    );
    const unreadableUpdate = await updateRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "restricted-draft", status: "draft" }),
      ),
    );
    const invalidVisibility = await createRoute.handler(
      mutationRequest("/studio/api/entities", "POST", {
        entityType: "post",
        frontmatter: {
          title: "Invalid visibility",
          status: "draft",
          visibility: "classified",
        },
        body: "Invalid visibility body",
      }),
    );
    const adapterSmuggle = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "smuggle",
          title: "Adapter smuggle",
          visibility: "shared",
        }),
      ),
    );

    expect(restrictedCreate.status).toBe(403);
    expect(restrictedUpdate.status).toBe(403);
    expect(unreadableUpdate.status).toBe(404);
    expect(invalidVisibility.status).toBe(400);
    expect(adapterSmuggle.status).toBe(201);
    const smuggledId = z
      .object({ entityId: z.string() })
      .parse(await adapterSmuggle.json()).entityId;
    const smuggledEntity = await shell.getEntityService().getEntity({
      entityType: "smuggle",
      id: smuggledId,
    });
    expect(smuggledEntity?.visibility).toBe("shared");
    expect(smuggledEntity?.metadata["visibility"]).toBeUndefined();
    expect(
      (
        await shell.getEntityService().getEntity({
          entityType: "post",
          id: "shared-draft",
        })
      )?.visibility,
    ).toBe("shared");
  });

  it("requires publish permission when entering or remaining published", async () => {
    const trusted = createMutationFixture("trusted");
    const route = findRoute(trusted.routes, "PUT");

    const draftEdit = await route.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "draft" }),
      ),
    );
    const publish = await route.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "published" }),
      ),
    );
    const publishedEdit = await route.handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "published-post", status: "published" }),
      ),
    );

    const admin = createMutationFixture("admin");
    const adminPublish = await findRoute(admin.routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "published" }),
      ),
    );

    expect(draftEdit.status).toBe(200);
    expect(publish.status).toBe(403);
    expect(publishedEdit.status).toBe(403);
    expect(adminPublish.status).toBe(200);
  });

  it("rechecks action policy immediately before persistence", async () => {
    const fixture = createMutationFixture("trusted");
    const assertAllowed =
      fixture.permissionService.assertEntityActionAllowed.bind(
        fixture.permissionService,
      );
    let updateChecks = 0;
    fixture.permissionService.assertEntityActionAllowed = (
      entityType,
      action,
      userLevel,
    ): void => {
      assertAllowed(entityType, action, userLevel);
      if (entityType === "post" && action === "update") {
        updateChecks += 1;
        if (updateChecks === 2) throw new Error("Policy changed before write");
      }
    };

    const response = await findRoute(fixture.routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "draft" }),
      ),
    );

    expect(response.status).toBe(403);
    expect(updateChecks).toBe(2);
    expect(
      (
        await fixture.shell.getEntityService().getEntity({
          entityType: "post",
          id: "shared-draft",
        })
      )?.content,
    ).toContain("shared-draft body");
  });

  it("preserves stale-write checks after authorization", async () => {
    const { routes } = createMutationFixture("trusted");
    const response = await findRoute(routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({
          id: "shared-draft",
          status: "draft",
          baseContentHash: "stale-hash",
        }),
      ),
    );

    expect(response.status).toBe(409);
  });

  it("re-resolves changed roles and enforces wildcard delete policy", async () => {
    const fixture = createMutationFixture("trusted");
    const deleteRoute = findRoute(fixture.routes, "DELETE");

    const trustedDelete = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=post&id=shared-draft",
        "DELETE",
        {
          confirmed: true,
        },
      ),
    );
    fixture.setPermissionLevel("public");
    const afterDemotion = await findRoute(fixture.routes, "PUT").handler(
      mutationRequest(
        "/studio/api/entities",
        "PUT",
        updatePayload({ id: "shared-draft", status: "draft" }),
      ),
    );

    expect(trustedDelete.status).toBe(403);
    expect(afterDemotion.status).toBe(403);
    expect(
      await fixture.shell.getEntityService().getEntity({
        entityType: "post",
        id: "shared-draft",
      }),
    ).not.toBeNull();
  });

  it("requires same-origin JSON and explicit delete confirmation", async () => {
    const admin = createMutationFixture("admin");
    const createRoute = findRoute(admin.routes, "POST");
    const deleteRoute = findRoute(admin.routes, "DELETE");

    const missingOrigin = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Missing origin",
          visibility: "restricted",
        }),
        { origin: null },
      ),
    );
    const crossOrigin = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Cross origin",
          visibility: "restricted",
        }),
        { origin: "https://evil.example.com" },
      ),
    );
    const nonJson = await createRoute.handler(
      mutationRequest(
        "/studio/api/entities",
        "POST",
        createPayload({
          entityType: "post",
          title: "Wrong content type",
          visibility: "restricted",
        }),
        { contentType: "text/plain" },
      ),
    );
    const unconfirmed = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=post&id=shared-draft",
        "DELETE",
        {
          confirmed: false,
        },
      ),
    );
    const confirmed = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=post&id=shared-draft",
        "DELETE",
        {
          confirmed: true,
        },
      ),
    );
    const neverDelete = await deleteRoute.handler(
      mutationRequest(
        "/studio/api/entities?type=never-note&id=never-note",
        "DELETE",
        { confirmed: true },
      ),
    );

    expect(missingOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(nonJson.status).toBe(415);
    expect(unconfirmed.status).toBe(400);
    expect(confirmed.status).toBe(200);
    expect(neverDelete.status).toBe(403);
  });
});
