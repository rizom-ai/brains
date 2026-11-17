import type { AuthPrincipal } from "@brains/contracts";
import { generateFromSourcesContract } from "@brains/contracts";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import type { BaseEntity, WebRouteDefinition } from "@brains/plugins";
import { BaseEntityAdapter, baseEntitySchema } from "@brains/plugins";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { studioContextOn } from "./studio-plugins";

/**
 * Studio offers Refine on a collection whose entries another type's
 * generation uses up, to a caller who may delete those entries and create
 * that type. The route asks and confirms through the system's own
 * generation, as that caller.
 */

const frontmatter = z.object({ title: z.string() });

class FixtureAdapter extends BaseEntityAdapter<
  BaseEntity,
  Record<string, unknown>,
  z.infer<typeof frontmatter>
> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: `${entityType} refine fixtures`,
      schema: baseEntitySchema,
      frontmatterSchema: frontmatter,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return {
      entityType: this.entityType,
      content: markdown,
      metadata: this.parseFrontmatter(markdown),
    };
  }
}

type Level = "public" | "trusted" | "admin";

const principalFor = (permissionLevel: Level): AuthPrincipal => ({
  userId: `usr_${permissionLevel}`,
  personId: `person_${permissionLevel}`,
  displayName: `${permissionLevel} editor`,
  role: permissionLevel,
  status: "active",
  permissionLevel,
  isAnchor: permissionLevel === "admin",
});

const typesResponse = z.object({
  types: z.array(
    z.looseObject({
      entityType: z.string(),
      refinesInto: z
        .object({ entityType: z.string(), label: z.string() })
        .optional(),
    }),
  ),
});

async function fixture(
  level: Level,
  answer?: (request: unknown) => unknown,
): Promise<{
  shell: MockShell;
  routes: WebRouteDefinition[];
  asked: unknown[];
}> {
  const shell = createMockShell({ domain: "yeehaa.io" });
  const registry = shell.getEntityRegistry();
  registry.registerEntityType(
    "note",
    baseEntitySchema,
    new FixtureAdapter("note"),
  );
  registry.registerEntityType(
    "post",
    baseEntitySchema,
    new FixtureAdapter("post"),
  );
  registry.registerEntityType(
    "refined-note",
    baseEntitySchema,
    new FixtureAdapter("refined-note"),
    { consumesSources: ["note"] },
  );
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof frontmatter | undefined =>
    ["note", "post", "refined-note"].includes(entityType)
      ? frontmatter
      : undefined;
  // Trusted editors write notes and refined notes; only an admin deletes.
  const permissions = new PermissionService({
    entityActions: {
      "*": {
        create: "trusted",
        update: "trusted",
        delete: "admin",
        extract: "never",
        publish: "admin",
      },
    },
  });
  shell.getPermissionService = (): PermissionService => permissions;

  const asked: unknown[] = [];
  if (answer) {
    shell
      .getMessageBus()
      .subscribe(generateFromSourcesContract.name, async (message) => {
        asked.push(message.payload);
        return { success: true, data: answer(message.payload) };
      });
  }
  const context = await studioContextOn(shell);
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async (): Promise<AuthPrincipal> =>
      principalFor(level),
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
  });
  return { shell, routes, asked };
}

function route(
  routes: WebRouteDefinition[],
  path: string,
  method: "GET" | "POST",
): WebRouteDefinition {
  const found = routes.find(
    (candidate) => candidate.path === path && candidate.method === method,
  );
  if (!found) throw new Error(`Missing ${method} ${path}`);
  return found;
}

function refine(
  routes: WebRouteDefinition[],
  body: unknown,
  origin = "https://yeehaa.io",
): Promise<Response> {
  return Promise.resolve(
    route(routes, "/studio/api/refine", "POST").handler(
      new Request("https://yeehaa.io/studio/api/refine", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

async function refinesInto(level: Level, entityType: string): Promise<unknown> {
  const { routes } = await fixture(level);
  const response = await route(routes, "/studio/api/types", "GET").handler(
    new Request("https://yeehaa.io/studio/api/types"),
  );
  return typesResponse
    .parse(await response.json())
    .types.find((type) => type.entityType === entityType)?.refinesInto;
}

const confirmation = {
  status: "confirm",
  summary: 'Generate refined-note from "A" and "B"? They will be removed.',
  completionSummary:
    'Generating refined-note from "A" and "B", which will be removed once it is saved.',
  preview: "Entity type: refined-note\nRemoves: note/a\nRemoves: note/b",
  approval: { operation: { kind: "prompt-from-source" }, confirmed: true },
};

describe("which collections Studio offers Refine on", () => {
  it("offers it on a type another type's generation uses up", async () => {
    expect(await refinesInto("admin", "note")).toEqual({
      entityType: "refined-note",
      label: "Refined Note",
    });
  });

  it("does not offer it on any other type", async () => {
    expect(await refinesInto("admin", "post")).toBeUndefined();
    expect(await refinesInto("admin", "refined-note")).toBeUndefined();
  });

  it("does not offer it to a caller who may not delete the entries", async () => {
    expect(await refinesInto("trusted", "note")).toBeUndefined();
  });
});

describe("the Studio refine route", () => {
  it("asks the system for the confirmation, as the caller", async () => {
    const { routes, asked } = await fixture("admin", () => confirmation);

    const response = await refine(routes, {
      entityType: "note",
      ids: ["a", "b"],
      direction: "  Focus on pricing  ",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "confirm",
      summary: confirmation.summary,
      approval: confirmation.approval,
    });
    expect(asked).toEqual([
      {
        entityType: "refined-note",
        source: { entityType: "note", entityIds: ["a", "b"] },
        prompt: "Focus on pricing",
        actor: { kind: "user", userId: "usr_admin" },
        interfaceType: "studio",
        userPermissionLevel: "admin",
      },
    ]);
  });

  it("runs it with the approval and says where the refined note is", async () => {
    const { routes, asked } = await fixture("admin", () => ({
      status: "queued",
      entityId: "a",
      jobId: "job-1",
    }));

    const response = await refine(routes, {
      entityType: "note",
      ids: ["a", "b"],
      approval: confirmation.approval,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "queued",
      entityType: "refined-note",
      entityId: "a",
    });
    expect(asked).toEqual([
      expect.objectContaining({ approval: confirmation.approval }),
    ]);
  });

  it.each([
    [
      {
        status: "refused",
        error: "Entity not found: note/a",
        code: "source-not-found",
      },
      404,
    ],
    [
      {
        status: "refused",
        error: "Deleting `note` requires Admin permission.",
      },
      422,
    ],
  ])("answers the system's refusal: %j", async (refusal, status) => {
    const { routes } = await fixture("admin", () => refusal);

    const response = await refine(routes, { entityType: "note", ids: ["a"] });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: refusal.error });
  });

  it("refuses a type nothing refines, without asking", async () => {
    const { routes, asked } = await fixture("admin", () => confirmation);

    const response = await refine(routes, { entityType: "post", ids: ["a"] });

    expect(response.status).toBe(400);
    expect(asked).toEqual([]);
  });

  it("refuses a caller who may not delete the entries, without asking", async () => {
    const { routes, asked } = await fixture("trusted", () => confirmation);

    const response = await refine(routes, { entityType: "note", ids: ["a"] });

    expect(response.status).toBe(403);
    expect(asked).toEqual([]);
  });

  it.each([
    ["no ids", { entityType: "note", ids: [] }],
    ["an id twice", { entityType: "note", ids: ["a", "a"] }],
    ["no type", { ids: ["a"] }],
  ])("refuses a request with %s", async (_case, body) => {
    const { routes, asked } = await fixture("admin", () => confirmation);

    expect((await refine(routes, body)).status).toBe(400);
    expect(asked).toEqual([]);
  });

  it("refuses a request from another origin", async () => {
    const { routes, asked } = await fixture("admin", () => confirmation);

    const response = await refine(
      routes,
      { entityType: "note", ids: ["a"] },
      "https://elsewhere.example",
    );

    expect(response.status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("says so when no system answers", async () => {
    const { routes } = await fixture("admin");

    const response = await refine(routes, { entityType: "note", ids: ["a"] });

    expect(response.status).toBe(503);
  });
});
