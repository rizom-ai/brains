import { describe, expect, spyOn, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
  type BaseEntity,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { studioPlugin } from "../src";

const schema = z.object({ title: z.string().optional() });
const grouping = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["note", "post"],
};
class Adapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Grouping routes fixture",
      schema: baseEntitySchema,
      frontmatterSchema: schema,
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}
function fixture(role: "trusted" | "public" | null = "trusted"): {
  shell: ReturnType<typeof createMockShell>;
  routes: WebRouteDefinition[];
} {
  const shell = createMockShell();
  for (const type of grouping.types)
    shell
      .getEntityRegistry()
      .registerEntityType(type, baseEntitySchema, new Adapter(type));
  spyOn(
    shell.getEntityRegistry(),
    "getEffectiveFrontmatterSchema",
  ).mockReturnValue(schema);
  spyOn(shell.getEntityRegistry(), "getGroupings").mockReturnValue([grouping]);
  const context = createServicePluginContext(shell, "studio");
  return {
    shell,
    routes: createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
      resolveAuthPrincipal: async () =>
        role
          ? {
              userId: "user",
              personId: "person",
              displayName: "Reader",
              role,
              status: "active",
              permissionLevel: role,
              isAnchor: false,
            }
          : undefined,
    }),
  };
}
async function get(
  routes: WebRouteDefinition[],
  path: string,
): Promise<Response> {
  const route = routes.find(
    (candidate) =>
      candidate.path === `/studio/api/${path.split("?")[0]}` &&
      candidate.method === "GET",
  );
  if (!route) throw new Error(`Missing grouping route ${path}`);
  return route.handler(new Request(`https://example.com/studio/api/${path}`));
}

describe("Studio grouping declarations", () => {
  test("preflights all config before registering any grouping", async () => {
    const shell = createMockShell();
    const preflight = spyOn(
      shell.getEntityRegistry(),
      "validateGroupings",
    ).mockImplementation(() => {});
    const register = spyOn(
      shell.getEntityRegistry(),
      "registerGrouping",
    ).mockImplementation(() => {});
    const plugin = studioPlugin({ groupings: [grouping] });
    await plugin.register(shell);
    expect(register).not.toHaveBeenCalled();
    await plugin.finalizeRegistration();
    expect(preflight).toHaveBeenCalledWith([grouping]);
    expect(register).toHaveBeenCalledWith(grouping);
  });
  test("a failed preflight publishes no partial config", async () => {
    const shell = createMockShell();
    spyOn(shell.getEntityRegistry(), "validateGroupings").mockImplementation(
      () => {
        throw new Error("Conflicting field");
      },
    );
    const register = spyOn(shell.getEntityRegistry(), "registerGrouping");
    const plugin = studioPlugin({ groupings: [grouping] });
    await plugin.register(shell);
    const error = await plugin
      .finalizeRegistration()
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ message: "Conflicting field" });
    expect(register).not.toHaveBeenCalled();
  });
});

describe("Studio grouping read admission", () => {
  test("both endpoints return no-store initializing responses, then complete results", async () => {
    const { shell, routes } = fixture();
    spyOn(shell.getEntityService(), "countEntities").mockResolvedValue(1);
    const readiness = spyOn(
      shell.getEntityService(),
      "areGroupingsReady",
    ).mockReturnValue(false);
    const catalog = spyOn(
      shell.getEntityService(),
      "queryGroupingCatalog",
    ).mockResolvedValue({ values: [{ value: "Acme", count: 1 }], total: 1 });
    const members = spyOn(
      shell.getEntityService(),
      "queryGroupingMembers",
    ).mockResolvedValue({ entities: [], total: 0 });
    for (const path of [
      "groups/catalog?grouping=clients",
      "groups/members?grouping=clients&value=Acme",
    ]) {
      const response = await get(routes, path);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("1");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        code: "groupings_initializing",
      });
    }
    expect(catalog).not.toHaveBeenCalled();
    expect(members).not.toHaveBeenCalled();
    readiness.mockReturnValue(true);
    expect(
      await (await get(routes, "groups/catalog?grouping=clients")).json(),
    ).toMatchObject({ values: [{ value: "Acme", count: 1 }], total: 1 });
    expect(
      (await get(routes, "groups/members?grouping=clients&value=Acme")).status,
    ).toBe(200);
  });
  test("authentication and trusted access precede initialization status", async () => {
    for (const role of [null, "public"] as const) {
      const { shell, routes } = fixture(role);
      const ready = spyOn(
        shell.getEntityService(),
        "areGroupingsReady",
      ).mockReturnValue(false);
      for (const path of [
        "groups/catalog?grouping=clients",
        "groups/members?grouping=clients&value=Acme",
      ])
        expect((await get(routes, path)).status).toBe(role ? 403 : 401);
      expect(ready).not.toHaveBeenCalled();
    }
  });
  test("forwards bounded filters and full member identities", async () => {
    const { shell, routes } = fixture();
    spyOn(shell.getEntityService(), "countEntities").mockResolvedValue(1);
    const query = spyOn(
      shell.getEntityService(),
      "queryGroupingMembers",
    ).mockResolvedValue({
      total: 1,
      entities: [
        {
          id: "\ufefflegacy\u0000:id",
          entityType: "post",
          content: "---\ntitle: Example\n---\n\nBody",
          metadata: { title: "Example" },
          visibility: "shared",
          contentHash: "hash",
          created: "2026-09-17T00:00:00Z",
          updated: "2026-09-17T00:00:00Z",
        },
      ],
    });
    const response = await get(
      routes,
      "groups/members?grouping=clients&value=Acme&type=post&q=Example&sort=created-asc&offset=2&limit=10",
    );
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        grouping: "clients",
        entityTypes: ["post"],
        value: "Acme",
        q: "Example",
        sort: "created-asc",
        offset: 2,
        limit: 10,
        visibilityScope: "shared",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await response.json()).toMatchObject({
      total: 1,
      entities: [
        {
          id: "\ufefflegacy\u0000:id",
          entityType: "post",
          displayTitle: "Example",
        },
      ],
    });
    expect(
      (
        await get(
          routes,
          "groups/members?grouping=clients&value=Acme&limit=101",
        )
      ).status,
    ).toBe(400);
  });
});
