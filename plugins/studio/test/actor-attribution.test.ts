import { describe, expect, it, spyOn } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import type {
  BaseEntity,
  CreateExecutionContext,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
} from "@brains/plugins";
import { PermissionService } from "@brains/templates";
import { createMockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const frontmatterSchema = z.object({ title: z.string() });

class AttributionAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "post",
      purpose: "Studio actor-attribution fixtures",
      schema: baseEntitySchema,
      frontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return {
      entityType: "post",
      content: markdown,
      metadata: this.parseFrontmatter(markdown),
    };
  }
}

const principal: AuthPrincipal = {
  userId: "usr_studio_editor",
  personId: "person_studio_editor",
  displayName: "Studio editor",
  role: "admin",
  status: "active",
  permissionLevel: "admin",
  isAnchor: false,
  canonicalId: "user:studio-editor",
};

function setup(): {
  routes: WebRouteDefinition[];
  shell: ReturnType<typeof createMockShell>;
} {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  registry.registerEntityType(
    "post",
    baseEntitySchema,
    new AttributionAdapter(),
  );
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof frontmatterSchema | undefined =>
    entityType === "post" ? frontmatterSchema : undefined;
  const permissions = new PermissionService({
    entityActions: {
      post: {
        create: "admin",
        update: "admin",
        delete: "admin",
      },
    },
  });
  shell.getPermissionService = (): PermissionService => permissions;

  const context = createServicePluginContext(shell, "studio");
  return {
    shell,
    routes: createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      resolveAuthPrincipal: async (): Promise<AuthPrincipal> => principal,
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
    }),
  };
}

function route(
  routes: WebRouteDefinition[],
  path: string,
  method: "POST" | "PUT" | "DELETE",
): WebRouteDefinition {
  const found = routes.find(
    (candidate) => candidate.path === path && candidate.method === method,
  );
  if (!found) throw new Error(`Missing ${method} ${path} route`);
  return found;
}

function jsonRequest(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
): Request {
  return new Request(`https://yeehaa.io${path}`, {
    method,
    headers: {
      Origin: "https://yeehaa.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const expectedEventContext: CreateExecutionContext = {
  actor: {
    kind: "user",
    userId: principal.userId,
    canonicalId: "user:studio-editor",
  },
  interfaceType: "studio",
};

describe("Studio mutation actor attribution", () => {
  it("passes the authenticated user to create, update, and delete events", async () => {
    const { routes, shell } = setup();
    const entityService = shell.getEntityService();
    const createSpy = spyOn(entityService, "createEntity");
    const updateSpy = spyOn(entityService, "updateEntity");
    const deleteSpy = spyOn(entityService, "deleteEntity");

    const created = await route(routes, "/studio/api/entities", "POST").handler(
      jsonRequest("/studio/api/entities", "POST", {
        entityType: "post",
        frontmatter: { title: "Attributed post" },
        body: "Original body",
      }),
    );
    const createResponse = z
      .object({ entityId: z.string() })
      .parse(await created.json());
    const entityId = createResponse.entityId;
    const stored = await entityService.getEntity({
      entityType: "post",
      id: entityId,
    });
    if (!stored) throw new Error("Created entity missing");

    const updated = await route(routes, "/studio/api/entities", "PUT").handler(
      jsonRequest("/studio/api/entities", "PUT", {
        entityType: "post",
        id: entityId,
        frontmatter: { title: "Updated post" },
        body: "Updated body",
        baseContentHash: stored.contentHash,
      }),
    );
    const deleted = await route(
      routes,
      "/studio/api/entities",
      "DELETE",
    ).handler(
      jsonRequest(
        `/studio/api/entities?type=post&id=${encodeURIComponent(entityId)}`,
        "DELETE",
        { confirmed: true },
      ),
    );

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(200);
    for (const mutationSpy of [createSpy, updateSpy, deleteSpy]) {
      expect(mutationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { eventContext: expectedEventContext },
        }),
      );
    }
    expect(
      JSON.stringify({ content: stored.content, metadata: stored.metadata }),
    ).not.toContain(principal.userId);
    expect(
      JSON.stringify({ content: stored.content, metadata: stored.metadata }),
    ).not.toContain(principal.canonicalId);
  });

  it("passes the authenticated user to upload promotion", async () => {
    const { routes, shell } = setup();
    let executionContext: CreateExecutionContext | undefined;
    shell.getEntityRegistry().registerUploadSaveHandler({
      entityType: "post",
      mediaTypes: ["image/*"],
      handler: async (_input, context) => {
        executionContext = context;
        return {
          success: true,
          data: { entityId: "post-image", status: "created" },
        };
      },
    });
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "image.png", {
        type: "image/png",
      }),
    );

    const response = await route(routes, "/studio/api/upload", "POST").handler(
      new Request("https://yeehaa.io/studio/api/upload", {
        method: "POST",
        headers: { Origin: "https://yeehaa.io" },
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    expect(executionContext).toEqual({
      interfaceType: "studio",
      actor: expectedEventContext.actor,
    });
  });
});
