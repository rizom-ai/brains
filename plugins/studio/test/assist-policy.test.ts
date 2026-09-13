import { createMockShell } from "@brains/plugins/test";
import { describe, expect, it, spyOn } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import type { ZodType } from "@brains/utils/zod";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
} from "@brains/plugins";
import { PermissionService } from "@brains/templates";

import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const frontmatterSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
});

class AssistAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "post",
      purpose: "Studio assist policy fixtures",
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

const trustedPrincipal: AuthPrincipal = {
  userId: "usr_assistant",
  personId: "person_assistant",
  displayName: "Trusted assistant",
  role: "trusted",
  status: "active",
  permissionLevel: "trusted",
  isAnchor: false,
  canonicalId: "user:trusted-assistant",
};

async function setup(updatePermission: "trusted" | "admin"): Promise<{
  shell: ReturnType<typeof createMockShell>;
  routes: WebRouteDefinition[];
}> {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  registry.registerEntityType("post", baseEntitySchema, new AssistAdapter());
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof frontmatterSchema | undefined =>
    entityType === "post" ? frontmatterSchema : undefined;
  const permissions = new PermissionService({
    entityActions: { post: { update: updatePermission } },
  });
  shell.getPermissionService = (): PermissionService => permissions;
  await shell.getEntityService().createEntity({
    entity: {
      id: "public-post",
      entityType: "post",
      content: "---\ntitle: Stored title\n---\nStored visible body.",
      metadata: { title: "Stored title" },
      visibility: "public",
    },
  });
  await shell.getEntityService().createEntity({
    entity: {
      id: "restricted-post",
      entityType: "post",
      content: "---\ntitle: Restricted title\n---\nRestricted body.",
      metadata: { title: "Restricted title" },
      visibility: "restricted",
    },
  });
  const context = createServicePluginContext(shell, "studio");
  return {
    shell,
    routes: createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      resolveAuthPrincipal: async () => trustedPrincipal,
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
    }),
  };
}

function route(
  routes: WebRouteDefinition[],
  path: "/studio/api/assist" | "/studio/api/agents" | "/studio/api/ask-agent",
  method: "GET" | "POST",
): WebRouteDefinition {
  const found = routes.find(
    (candidate) => candidate.path === path && candidate.method === method,
  );
  if (!found) throw new Error(`Missing ${method} ${path} route`);
  return found;
}

function post(path: string, body: unknown): Request {
  return new Request(`https://yeehaa.io${path}`, {
    method: "POST",
    headers: {
      Origin: "https://yeehaa.io",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function assistBody(id: string): Record<string, unknown> {
  return {
    entityType: "post",
    id,
    instruction: "Tighten this",
    selection: "Stored visible body.",
    body: "Forged client-only body",
    frontmatter: { title: "Forged client-only title" },
  };
}

describe("Studio assist policy", () => {
  it("loads visible server content and enforces update permission", async () => {
    const fixture = await setup("trusted");
    // The shared fake parses whatever it returns through the caller's schema,
    // so the suggestion has to be supplied here rather than left empty.
    const generate = spyOn(fixture.shell, "generateObject").mockImplementation(
      async <T>(
        _prompt: string,
        schema: ZodType<T>,
      ): Promise<{ object: T }> => ({
        object: schema.parse({ suggestion: "A tighter body." }),
      }),
    );

    const response = await route(
      fixture.routes,
      "/studio/api/assist",
      "POST",
    ).handler(post("/studio/api/assist", assistBody("public-post")));

    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = generate.mock.calls[0]?.[0];
    expect(prompt).toContain("Stored visible body.");
    expect(prompt).toContain("Stored title");
    expect(prompt).not.toContain("Forged client-only body");
    expect(prompt).not.toContain("Forged client-only title");
  });

  it("returns policy and visibility denials before calling AI", async () => {
    const denied = await setup("admin");
    const deniedGenerate = spyOn(denied.shell, "generateObject");
    const deniedResponse = await route(
      denied.routes,
      "/studio/api/assist",
      "POST",
    ).handler(post("/studio/api/assist", assistBody("public-post")));
    expect(deniedResponse.status).toBe(403);
    expect(await deniedResponse.json()).toEqual({
      error:
        "Updating `post` requires Admin permission; your current permission is Trusted.",
    });
    expect(deniedGenerate).not.toHaveBeenCalled();

    const hidden = await setup("trusted");
    const hiddenGenerate = spyOn(hidden.shell, "generateObject");
    const hiddenResponse = await route(
      hidden.routes,
      "/studio/api/assist",
      "POST",
    ).handler(post("/studio/api/assist", assistBody("restricted-post")));
    expect(hiddenResponse.status).toBe(404);
    expect(hiddenGenerate).not.toHaveBeenCalled();
  });

  it("binds agent discovery and requests to the same visible entity", async () => {
    const fixture = await setup("trusted");
    const calls: unknown[] = [];
    fixture.shell
      .getMessageBus()
      .subscribe("a2a:call:agents", async (message) => {
        calls.push(message.payload);
        return {
          success: true,
          data: { agents: [{ id: "reviewer", label: "Reviewer" }] },
        };
      });
    fixture.shell
      .getMessageBus()
      .subscribe("a2a:call:request", async (message) => {
        calls.push(message.payload);
        return {
          success: true,
          data: { state: "completed", response: "Looks accurate." },
        };
      });

    const agents = await route(
      fixture.routes,
      "/studio/api/agents",
      "GET",
    ).handler(
      new Request(
        "https://yeehaa.io/studio/api/agents?type=post&id=public-post",
      ),
    );
    const answer = await route(
      fixture.routes,
      "/studio/api/ask-agent",
      "POST",
    ).handler(
      post("/studio/api/ask-agent", {
        entityType: "post",
        id: "public-post",
        agent: "reviewer",
        instruction: "Check this",
        selection: "Stored visible body.",
      }),
    );

    expect(agents.status).toBe(200);
    expect(answer.status).toBe(200);
    expect(calls).toEqual([
      {
        entityType: "post",
        entityId: "public-post",
        actor: {
          kind: "user",
          userId: trustedPrincipal.userId,
          canonicalId: trustedPrincipal.canonicalId,
        },
        interfaceType: "studio",
      },
      {
        agent: "reviewer",
        instruction: "Check this",
        selection: "Stored visible body.",
        entityType: "post",
        entityId: "public-post",
        actor: {
          kind: "user",
          userId: trustedPrincipal.userId,
          canonicalId: trustedPrincipal.canonicalId,
        },
        interfaceType: "studio",
      },
    ]);
  });
});
