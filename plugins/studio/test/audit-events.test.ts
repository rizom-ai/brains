import { describe, expect, it } from "bun:test";
import type {
  AppendAuthAuditEventInput,
  AuthPrincipal,
} from "@brains/auth-service";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
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

class AuditAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "post",
      purpose: "Studio audit fixtures",
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

function principal(permissionLevel: "trusted" | "admin"): AuthPrincipal {
  return {
    userId: `usr_${permissionLevel}_auditor`,
    personId: `person_${permissionLevel}_auditor`,
    displayName: `${permissionLevel} auditor`,
    role: permissionLevel,
    status: "active",
    permissionLevel,
    isAnchor: false,
    canonicalId: `user:${permissionLevel}-auditor`,
  };
}

function setup(permissionLevel: "trusted" | "admin"): {
  shell: ReturnType<typeof createMockShell>;
  routes: WebRouteDefinition[];
  events: AppendAuthAuditEventInput[];
} {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  registry.registerEntityType("post", baseEntitySchema, new AuditAdapter());
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
  const events: AppendAuthAuditEventInput[] = [];
  return {
    shell,
    events,
    routes: createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      resolveAuthPrincipal: async () => principal(permissionLevel),
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
      recordAuditEvent: async (event) => {
        events.push(event);
      },
    }),
  };
}

function route(
  routes: WebRouteDefinition[],
  method: "POST" | "PUT" | "DELETE",
): WebRouteDefinition {
  const found = routes.find(
    (candidate) =>
      candidate.path === "/studio/api/entities" && candidate.method === method,
  );
  if (!found) throw new Error(`Missing ${method} entity route`);
  return found;
}

function request(
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  query = "",
): Request {
  return new Request(`https://yeehaa.io/studio/api/entities${query}`, {
    method,
    headers: {
      Origin: "https://yeehaa.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const createResponseSchema = z.object({ entityId: z.string() });

describe("Studio mutation audit events", () => {
  it("records content-free allowed events for create, update, and delete", async () => {
    const fixture = setup("admin");
    const created = await route(fixture.routes, "POST").handler(
      request("POST", {
        entityType: "post",
        frontmatter: { title: "Audit secret title" },
        body: "Audit secret body",
      }),
    );
    const { entityId } = createResponseSchema.parse(await created.json());
    const entity = await fixture.shell.getEntityService().getEntity({
      entityType: "post",
      id: entityId,
    });
    if (!entity) throw new Error("Created audit entity missing");

    const updated = await route(fixture.routes, "PUT").handler(
      request("PUT", {
        entityType: "post",
        id: entityId,
        frontmatter: { title: "Updated audit secret title" },
        body: "Updated audit secret body",
        baseContentHash: entity.contentHash,
      }),
    );
    const deleted = await route(fixture.routes, "DELETE").handler(
      request("DELETE", { confirmed: true }, `?type=post&id=${entityId}`),
    );

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(fixture.events).toEqual(
      ["create", "update", "delete"].map((operation) => ({
        actorUserId: "usr_admin_auditor",
        action: `studio.entity.${operation}.allowed`,
        targetType: "entity",
        targetId: entityId,
        metadata: {
          entityType: "post",
          interfaceType: "studio",
          outcome: "allowed",
        },
      })),
    );
    const serialized = JSON.stringify(fixture.events);
    expect(serialized).not.toContain("Audit secret title");
    expect(serialized).not.toContain("Audit secret body");
  });

  it("records policy denials without invoking private mutation code", async () => {
    const fixture = setup("trusted");
    await fixture.shell.getEntityService().createEntity({
      entity: {
        id: "existing-post",
        entityType: "post",
        content: "Existing private body",
        metadata: { title: "Existing private title" },
        visibility: "public",
      },
    });
    const existing = await fixture.shell.getEntityService().getEntity({
      entityType: "post",
      id: "existing-post",
    });
    if (!existing) throw new Error("Seed entity missing");

    const responses = await Promise.all([
      route(fixture.routes, "POST").handler(
        request("POST", {
          entityType: "post",
          frontmatter: { title: "Denied create title" },
          body: "Denied create body",
        }),
      ),
      route(fixture.routes, "PUT").handler(
        request("PUT", {
          entityType: "post",
          id: existing.id,
          frontmatter: { title: "Denied update title" },
          body: "Denied update body",
          baseContentHash: existing.contentHash,
        }),
      ),
      route(fixture.routes, "DELETE").handler(
        request("DELETE", { confirmed: true }, `?type=post&id=${existing.id}`),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403,
    ]);
    expect(fixture.events).toEqual(
      ["create", "update", "delete"].map((operation) => ({
        actorUserId: "usr_trusted_auditor",
        action: `studio.entity.${operation}.denied`,
        targetType: "entity",
        ...(operation === "create" ? {} : { targetId: existing.id }),
        metadata: {
          entityType: "post",
          interfaceType: "studio",
          outcome: "denied",
          reason: "entity-action-policy",
        },
      })),
    );
    const serialized = JSON.stringify(fixture.events);
    expect(serialized).not.toContain("Denied create body");
    expect(serialized).not.toContain("Existing private body");
  });
});
