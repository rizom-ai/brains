import { describe, expect, spyOn, test } from "bun:test";
import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
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
      getGroupingDefinitions: () => ({
        groupings: {
          clients: { label: "Clients", types: grouping.types, multiple: true },
        },
        issues: [],
      }),
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

describe("Studio document-owned groupings", () => {
  test("rejects old configuration instead of silently stripping or converting it", () => {
    for (const groupings of [[], [grouping]]) {
      expect(() => {
        Reflect.apply(studioPlugin, undefined, [{ groupings }]);
      }).toThrow("System → Structure → Groupings");
    }
  });
  test("installs definitions after contributors and never registers the vocabulary document", async () => {
    const shell = createMockShell();
    const registry = EntityRegistry.createFresh(createSilentLogger());
    spyOn(shell, "getEntityRegistry").mockReturnValue(registry);
    spyOn(shell.getEntityService(), "getEntityTypes").mockImplementation(() =>
      registry.getAllEntityTypes(),
    );
    const plugin = studioPlugin();
    await plugin.register(shell);
    expect(registry.hasEntityType("grouping-definitions")).toBe(false);
    registry.registerEntityType("note", baseEntitySchema, new Adapter("note"));
    const validators = spyOn(registry, "registerPersistValidator");
    await plugin.finalizeRegistration();
    expect(registry.hasEntityType("grouping-definitions")).toBe(true);
    expect(registry.hasEntityType("grouping-vocabulary")).toBe(false);
    expect(registry.getGroupingSourceType()).toBe("grouping-definitions");
    expect(validators).toHaveBeenCalledWith("note", expect.any(Function));
  });
  test("refuses a second declaration owner without replacing existing registrations", async () => {
    const shell = createMockShell();
    spyOn(shell.getEntityRegistry(), "getGroupings").mockReturnValue([
      grouping,
    ]);
    const replace = spyOn(shell.getEntityRegistry(), "replaceGroupings");
    const plugin = studioPlugin();
    await plugin.register(shell);
    const error = await plugin
      .finalizeRegistration()
      .catch((cause: unknown): unknown => cause);
    expect(error).toMatchObject({
      message: expect.stringContaining("Groupings document"),
    });
    expect(replace).not.toHaveBeenCalled();
    expect(
      shell.getEntityRegistry().hasEntityType("grouping-definitions"),
    ).toBe(false);
  });
});

describe("Studio grouping read admission", () => {
  test("all grouping endpoints return no-store initializing responses, then complete results", async () => {
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
    const usage = spyOn(
      shell.getEntityService(),
      "queryGroupingUsage",
    ).mockResolvedValue({
      entries: 1,
      values: [{ value: "Acme", count: 1 }],
    });
    for (const path of [
      "groups/usage?grouping=clients&value=Acme",
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
    expect(usage).not.toHaveBeenCalled();
    readiness.mockReturnValue(true);
    expect(
      await (
        await get(routes, "groups/usage?grouping=clients&value=Acme")
      ).json(),
    ).toEqual({
      entries: 1,
      values: [{ value: "Acme", count: 1 }],
    });
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
        "groups/usage?grouping=clients",
        "groups/catalog?grouping=clients",
        "groups/members?grouping=clients&value=Acme",
      ])
        expect((await get(routes, path)).status).toBe(role ? 403 : 401);
      expect(ready).not.toHaveBeenCalled();
    }
  });
  test("usage forwards exact requested values and only admitted contributor types", async () => {
    const { shell, routes } = fixture();
    spyOn(
      shell.getEntityRegistry(),
      "getEffectiveFrontmatterSchema",
    ).mockImplementation((type) => (type === "note" ? schema : undefined));
    spyOn(shell.getEntityService(), "countEntities").mockResolvedValue(1);
    const usage = spyOn(
      shell.getEntityService(),
      "queryGroupingUsage",
    ).mockResolvedValue({ entries: 2, values: [] });
    const values = [" Acme ", "a,b", "Client\u0000name", "\ufeffClient", ""];
    const params = new URLSearchParams({ grouping: "clients" });
    for (const value of values) params.append("value", value);
    expect((await get(routes, `groups/usage?${params}`)).status).toBe(200);
    expect(usage).toHaveBeenLastCalledWith({
      grouping: "clients",
      entityTypes: ["note"],
      values,
      visibilityScope: "shared",
      signal: expect.any(AbortSignal),
    });
    expect((await get(routes, `groups/usage?${params}&type=post`)).status).toBe(
      200,
    );
    expect(usage).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityTypes: [] }),
    );
    const calls = usage.mock.calls.length;
    for (const query of [
      "grouping=missing",
      `grouping=clients&${"value=x&".repeat(101)}`,
      `grouping=clients&value=${"x".repeat(10001)}`,
    ]) {
      expect((await get(routes, `groups/usage?${query}`)).status).toBe(
        query === "grouping=missing" ? 404 : 400,
      );
    }
    expect(usage.mock.calls).toHaveLength(calls);
    spyOn(
      shell.getEntityRegistry(),
      "getEffectiveFrontmatterSchema",
    ).mockReturnValue(undefined);
    expect((await get(routes, "groups/usage?grouping=clients")).status).toBe(
      404,
    );
    expect(usage.mock.calls).toHaveLength(calls);
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

describe("Studio grouping definition surface", () => {
  const fieldNames = z.object({
    fields: z.array(z.object({ name: z.string() })),
  });

  test("the definitions schema offers no visibility control; it is always shared", async () => {
    const { shell, routes } = fixture("trusted");
    shell
      .getEntityRegistry()
      .registerEntityType(
        "grouping-definitions",
        baseEntitySchema,
        new Adapter("grouping-definitions"),
      );
    const response = await get(routes, "schema?type=grouping-definitions");
    expect(response.status).toBe(200);
    const vocabulary = fieldNames.parse(await response.json());
    expect(vocabulary.fields.map((field) => field.name)).not.toContain(
      "visibility",
    );
    // Ordinary types keep the control.
    const note = fieldNames.parse(
      await (await get(routes, "schema?type=note")).json(),
    );
    expect(note.fields.map((field) => field.name)).toContain("visibility");
  });
});
