import { describe, expect, spyOn, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import type { StudioContext } from "../src/studio-context";
import { studioContextOn } from "./studio-plugins";

// A collection is a type whose entries collect others. A series is chosen by
// people, through its Series group on the member; a topic is worked out by the
// brain, so its plugin answers. Projects collect nothing.
const schema = z.object({
  title: z.string().optional(),
  series: z.array(z.string()).max(1).optional(),
});
const TYPES = ["post", "note", "series", "topic", "project"];
class Adapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Collection members fixture",
      schema: baseEntitySchema,
      frontmatterSchema: schema,
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}

function entity(entityType: string, id: string, title: string): BaseEntity {
  return {
    id,
    entityType,
    content: `---\ntitle: ${title}\n---\nAbout ${title}.`,
    contentHash: `${id}-hash`,
    created: "2026-11-01T00:00:00.000Z",
    updated: "2026-11-02T00:00:00.000Z",
    visibility: "public",
    metadata: { title },
  };
}

interface Gathered {
  collections: { id: string; members: { entityType: string; id: string }[] }[];
}

// What the routes answer, as these tests read it.
const rowsSchema = z.object({
  entities: z.array(
    z.looseObject({
      id: z.string(),
      members: z.object({ count: z.number(), label: z.string() }).optional(),
    }),
  ),
});
const typesSchema = z.object({
  types: z.array(
    z.object({ entityType: z.string(), collection: z.boolean().optional() }),
  ),
});

async function fixture(options: {
  topicAnswer?: Gathered;
  readable?: string[];
}): Promise<{
  shell: ReturnType<typeof createMockShell>;
  routes: WebRouteDefinition[];
  asked: unknown[];
}> {
  const shell = createMockShell();
  for (const type of TYPES)
    shell
      .getEntityRegistry()
      .registerEntityType(
        type,
        baseEntitySchema,
        new Adapter(type),
        type === "series"
          ? { memberGroup: { label: "Series", multiple: false } }
          : {},
      );
  spyOn(
    shell.getEntityRegistry(),
    "getEffectiveFrontmatterSchema",
  ).mockImplementation((type: string) =>
    (options.readable ?? TYPES).includes(type) ? schema : undefined,
  );
  spyOn(shell.getEntityService(), "areGroupingsReady").mockReturnValue(true);
  const base = await studioContextOn(shell);
  const asked: unknown[] = [];
  const context: StudioContext = {
    ...base,
    messaging: {
      request: base.messaging.request,
      // Each plugin's answer goes through the contract, as the bus sends it.
      gather: async (contract, payload) => {
        asked.push(payload);
        const answer =
          contract.name === "collections:types"
            ? { types: ["topic"] }
            : (options.topicAnswer ?? { collections: [] });
        return {
          status: "answered",
          answers: [contract.response.parse(answer)],
          failures: [],
        };
      },
    },
  };
  return {
    shell,
    asked,
    routes: createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      getEntityDisplay: () => undefined,
      getGroupingDefinitions: () => ({
        excludedTypes: [],
        groupings: {
          series: {
            label: "Series",
            types: ["post"],
            excludeTypes: ["note", "series", "topic", "project"],
            multiple: false,
          },
        },
        issues: [],
      }),
      workspaceRegistry: new StudioWorkspaceRegistry(),
      resolveAuthPrincipal: async () => ({
        userId: "user",
        personId: "person",
        displayName: "Reader",
        role: "trusted",
        status: "active",
        permissionLevel: "trusted",
        isAnchor: false,
      }),
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
  if (!route) throw new Error(`Missing route ${path}`);
  return route.handler(new Request(`https://example.com/studio/api/${path}`));
}

describe("Studio collections", () => {
  test("marks the types that collect entries, from their registrations", async () => {
    const { routes } = await fixture({});
    const body = typesSchema.parse(await (await get(routes, "types")).json());
    expect(
      body.types
        .filter((type) => type.collection)
        .map((type) => type.entityType)
        .sort(),
    ).toEqual(["series", "topic"]);
  });

  test("counts a series' posts on its row, through the Series group", async () => {
    const { shell, routes } = await fixture({});
    spyOn(shell.getEntityService(), "listEntities").mockResolvedValue([
      entity("series", "cities", "Cities"),
      entity("series", "rivers", "Rivers"),
    ]);
    spyOn(shell.getEntityService(), "countEntities").mockResolvedValue(2);
    const usage = spyOn(
      shell.getEntityService(),
      "queryGroupingUsage",
    ).mockResolvedValue({
      entries: 4,
      values: [
        { value: "Cities", count: 3 },
        { value: "Rivers", count: 1 },
      ],
    });
    const body = rowsSchema.parse(
      await (await get(routes, "entities?type=series")).json(),
    );
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({
        grouping: "series",
        entityTypes: ["post"],
        values: ["Cities", "Rivers"],
      }),
    );
    expect(body.entities.map((row) => [row.id, row.members])).toEqual([
      ["cities", { count: 3, label: "3 posts" }],
      ["rivers", { count: 1, label: "1 post" }],
    ]);
  });

  test("counts a topic's entries on its row, as its plugin answers, leaving out what the viewer cannot read", async () => {
    const { shell, routes, asked } = await fixture({
      readable: ["post", "series", "topic"],
      topicAnswer: {
        collections: [
          {
            id: "ethics",
            members: [
              { entityType: "post", id: "a" },
              { entityType: "post", id: "b" },
              { entityType: "secret", id: "c" },
            ],
          },
        ],
      },
    });
    spyOn(shell.getEntityService(), "listEntities").mockResolvedValue([
      entity("topic", "ethics", "Ethics"),
      entity("topic", "design", "Design"),
    ]);
    spyOn(shell.getEntityService(), "countEntities").mockResolvedValue(2);
    const body = rowsSchema.parse(
      await (await get(routes, "entities?type=topic")).json(),
    );
    expect(asked).toContainEqual({
      entityType: "topic",
      ids: ["ethics", "design"],
      visibilityScope: expect.any(String),
    });
    expect(body.entities.map((row) => [row.id, row.members])).toEqual([
      ["ethics", { count: 2, label: "2 posts" }],
      ["design", { count: 0, label: "No entries" }],
    ]);
  });

  test("counts a series' posts on its row in the folder list too", async () => {
    const { shell, routes } = await fixture({});
    spyOn(shell.getEntityService(), "queryEntityHierarchy").mockResolvedValue({
      prefix: null,
      folders: [],
      entities: [
        { entity: entity("series", "cities", "Cities"), path: ["cities"] },
      ],
      offset: 0,
      totalEntities: 1,
    });
    spyOn(shell.getEntityService(), "queryGroupingUsage").mockResolvedValue({
      entries: 2,
      values: [{ value: "Cities", count: 2 }],
    });
    const body = rowsSchema.parse(
      await (await get(routes, "hierarchy?type=series")).json(),
    );
    expect(body.entities.map((row) => [row.id, row.members])).toEqual([
      ["cities", { count: 2, label: "2 posts" }],
    ]);
  });

  test("leaves rows of other types without a count", async () => {
    const { shell, routes } = await fixture({});
    spyOn(shell.getEntityService(), "listEntities").mockResolvedValue([
      entity("project", "atlas", "Atlas"),
    ]);
    spyOn(shell.getEntityService(), "countEntities").mockResolvedValue(1);
    const body = rowsSchema.parse(
      await (await get(routes, "entities?type=project")).json(),
    );
    expect(body.entities[0]).not.toHaveProperty("members");
  });

  test("lists a series' posts as its members", async () => {
    const { shell, routes } = await fixture({});
    spyOn(shell.getEntityService(), "getEntityRaw").mockResolvedValue(
      entity("series", "cities", "Cities"),
    );
    const members = spyOn(
      shell.getEntityService(),
      "queryGroupingMembers",
    ).mockResolvedValue({
      entities: [entity("post", "harbor", "Harbor")],
      total: 1,
    });
    const response = await get(
      routes,
      "collection-members?type=series&id=cities",
    );
    expect(response.status).toBe(200);
    expect(members).toHaveBeenCalledWith(
      expect.objectContaining({
        grouping: "series",
        entityTypes: ["post"],
        value: "Cities",
      }),
    );
    expect(await response.json()).toMatchObject({
      total: 1,
      label: "1 post",
      entities: [{ id: "harbor", entityType: "post", displayTitle: "Harbor" }],
    });
  });

  test("lists a topic's entries as its plugin answers, each read at the viewer's visibility", async () => {
    const { shell, routes } = await fixture({
      topicAnswer: {
        collections: [
          {
            id: "ethics",
            members: [
              { entityType: "post", id: "a" },
              { entityType: "note", id: "gone" },
            ],
          },
        ],
      },
    });
    // The topic itself, then its members in the order the plugin named them.
    spyOn(shell.getEntityService(), "getEntityRaw")
      .mockResolvedValueOnce(entity("topic", "ethics", "Ethics"))
      .mockResolvedValueOnce(entity("post", "a", "Alpha"))
      .mockResolvedValueOnce(null);
    const response = await get(
      routes,
      "collection-members?type=topic&id=ethics",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      total: 1,
      label: "1 post",
      entities: [{ id: "a", entityType: "post", displayTitle: "Alpha" }],
    });
  });

  test("refuses members of a type that collects nothing", async () => {
    const { routes } = await fixture({});
    expect(
      (await get(routes, "collection-members?type=project&id=atlas")).status,
    ).toBe(404);
  });
});
