import { describe, expect, spyOn, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createServicePluginContext,
  type BaseEntity,
  type GetEntityRequest,
  type WebRouteDefinition,
} from "@brains/plugins";
import { decodeEntityIdPath } from "@brains/entity-service";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { EntityWriteConflictError } from "@brains/plugins";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const frontmatterSchema = z.object({ title: z.string().optional() });
class Adapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType = "section") {
    super({
      entityType,
      purpose: "Studio hierarchy fixture",
      schema: baseEntitySchema,
      frontmatterSchema,
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { id: "adapter-id", metadata: this.parseFrontmatter(content) };
  }
}
const entity: BaseEntity = {
  id: "book-1:intro",
  entityType: "section",
  content: "---\ntitle: Introduction\n---\n\nBody",
  metadata: { title: "Introduction" },
  visibility: "public",
  contentHash: "hash",
  created: "2026-09-13T00:00:00Z",
  updated: "2026-09-13T00:00:00Z",
};
function fixture(
  permissionLevel: "public" | "trusted" | "admin" = "trusted",
  entityType = "section",
): {
  shell: ReturnType<typeof createMockShell>;
  routes: WebRouteDefinition[];
} {
  const shell = createMockShell({ domain: "example.com" });
  shell
    .getEntityRegistry()
    .registerEntityType(entityType, baseEntitySchema, new Adapter(entityType));
  shell.getEntityRegistry().getEffectiveFrontmatterSchema = (
    type,
  ): typeof frontmatterSchema | undefined =>
    type === entityType ? frontmatterSchema : undefined;
  const context = createServicePluginContext(shell, "studio");
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    getEntityDisplay: () => undefined,
    resolveAuthPrincipal: async () => ({
      userId: "usr_editor",
      personId: "person_editor",
      displayName: "Editor",
      role: permissionLevel,
      status: "active",
      permissionLevel,
      isAnchor: false,
    }),
    workspaceRegistry: new StudioWorkspaceRegistry(),
  });
  return { shell, routes };
}
async function request(
  routes: WebRouteDefinition[],
  path: string,
  body?: unknown,
): Promise<Response> {
  const method = body === undefined ? "GET" : "POST";
  const route = routes.find(
    (row) =>
      row.path === `/studio/api/${path.split("?")[0]}` && row.method === method,
  );
  if (!route) throw new Error(`Missing ${method} ${path}`);
  return route.handler(
    new Request(`https://example.com/studio/api/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
  );
}
const pageSchema = z.object({
  prefix: z.array(z.string()).nullable(),
  folders: z.array(
    z.object({
      path: z.array(z.string()),
      name: z.string(),
      descendantCount: z.number(),
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string(),
      path: z.array(z.string()),
      displayTitle: z.string().optional(),
    }),
  ),
  total: z.number(),
});

describe("Studio hierarchy editor API", () => {
  test.each([
    { entityType: "note", path: ["book", "intro"], field: "prefix" },
    { entityType: "section", path: ["intro"], field: "segment" },
  ])(
    "refuses explicit placement denial for $entityType against $field",
    async ({ entityType, path, field }) => {
      const { shell, routes } = fixture("trusted", entityType);
      const create = spyOn(shell.getEntityService(), "createEntity");
      shell.getMessageBus().subscribe("sync:path:request", async () => ({
        success: true,
        data: {
          relativePath: "book/intro.md",
          leaf: null,
          writable: false,
          owner: { entityType: "book", id: "intro" },
        },
      }));
      const preview = await request(routes, "destination", {
        entityType,
        idPath: path,
        frontmatter: {},
      });
      expect(await preview.json()).toMatchObject({
        fileWritable: false,
        fileOwner: { entityType: "book", id: "intro" },
      });
      const response = await request(routes, "entities", {
        entityType,
        idPath: path,
        frontmatter: {},
        body: "Body",
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toMatchObject({ issues: [{ path: [field] }] });
      expect(JSON.stringify(body)).toContain("book/intro");
      expect(create).not.toHaveBeenCalled();
    },
  );

  test("an explicit false still refuses when an optional owner is absent", async () => {
    const { shell, routes } = fixture();
    shell.getMessageBus().subscribe("sync:path:request", async () => ({
      success: true,
      data: { relativePath: "section/intro.md", leaf: null, writable: false },
    }));
    expect(
      (
        await request(routes, "entities", {
          entityType: "section",
          idPath: ["intro"],
          frontmatter: {},
        })
      ).status,
    ).toBe(400);
  });

  test.each(["absent", "older", "writable"])(
    "allows creation with %s directory-sync admission",
    async (version) => {
      const { shell, routes } = fixture();
      if (version !== "absent")
        shell.getMessageBus().subscribe("sync:path:request", async () => ({
          success: true,
          data: {
            relativePath: "section/section/intro.md",
            leaf: null,
            ...(version === "writable" && {
              writable: true,
              owner: { entityType: "section", id: "section:intro" },
            }),
          },
        }));
      const response = await request(routes, "entities", {
        entityType: "section",
        idPath: ["section", "intro"],
        frontmatter: {},
        body: "Body",
      });
      expect(response.status).toBe(201);
    },
  );
  test("returns the server hierarchy and binds reads to caller visibility", async () => {
    const { shell, routes } = fixture();
    const query = spyOn(
      shell.getEntityService(),
      "queryEntityHierarchy",
    ).mockResolvedValue({
      prefix: ["book-1"],
      folders: [
        { path: ["book-1", "part-1"], name: "part-1", descendantCount: 3 },
      ],
      entities: [{ entity, path: ["book-1", "intro"] }],
      offset: 25,
      totalEntities: 26,
    });
    const params = new URLSearchParams({
      type: "section",
      prefix: JSON.stringify(["book-1"]),
      offset: "25",
      visibilityScope: "restricted",
      status: "draft",
    });
    const response = await request(routes, `hierarchy?${params}`);
    expect(response.status).toBe(200);
    const page = pageSchema.parse(await response.json());
    expect(page.folders).toEqual([
      { path: ["book-1", "part-1"], name: "part-1", descendantCount: 3 },
    ]);
    expect(page.entities).toEqual([
      {
        id: entity.id,
        path: ["book-1", "intro"],
        displayTitle: "Introduction",
      },
    ]);
    expect(page.total).toBe(26);
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      entityType: "section",
      prefix: ["book-1"],
      visibilityScope: "shared",
      offset: 25,
      filter: { metadata: { status: "draft" } },
    });
  });

  test("root navigation and folder-scoped search are explicit server requests", async () => {
    const { shell, routes } = fixture();
    const query = spyOn(
      shell.getEntityService(),
      "queryEntityHierarchy",
    ).mockResolvedValue({
      prefix: null,
      folders: [],
      entities: [],
      offset: 0,
      totalEntities: 0,
    });
    expect((await request(routes, "hierarchy?type=section")).status).toBe(200);
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      prefix: null,
      includeDescendants: false,
    });
    expect(
      (
        await request(
          routes,
          `hierarchy?type=section&prefix=${encodeURIComponent(JSON.stringify(["book-1"]))}&q=shared`,
        )
      ).status,
    ).toBe(200);
    expect(query.mock.calls[1]?.[0]).toMatchObject({
      prefix: ["book-1"],
      includeDescendants: true,
      filter: { contentContains: "shared" },
    });
    expect(
      (
        await request(
          routes,
          `hierarchy?type=section&prefix=${encodeURIComponent(JSON.stringify(["book-1"]))}&scope=collection&q=shared`,
        )
      ).status,
    ).toBe(200);
    expect(query.mock.calls[2]?.[0]).toMatchObject({
      prefix: null,
      includeDescendants: true,
      visibilityScope: "shared",
    });
  });

  test("rejects malformed navigation and denies public access before querying", async () => {
    const { shell, routes } = fixture();
    const query = spyOn(shell.getEntityService(), "queryEntityHierarchy");
    for (const prefix of ["not-json", "42", "[]", '["book",42]']) {
      expect(
        (
          await request(
            routes,
            `hierarchy?type=section&prefix=${encodeURIComponent(prefix)}`,
          )
        ).status,
      ).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
    const publicFixture = fixture("public");
    expect(
      (await request(publicFixture.routes, "hierarchy?type=section")).status,
    ).toBe(403);
  });

  test("direct entity reads keep the complete opaque ID", async () => {
    const { shell, routes } = fixture();
    const get = spyOn(
      shell.getEntityService(),
      "getEntityRaw",
    ).mockResolvedValue(entity);
    const id = "book:part/with%sign";
    expect(
      (
        await request(
          routes,
          `entities?type=section&id=${encodeURIComponent(id)}`,
        )
      ).status,
    ).toBe(200);
    expect(get).toHaveBeenCalledWith({
      entityType: "section",
      id,
      visibilityScope: "shared",
    });
  });

  test("creation encodes submitted segments server-side with an absent-write precondition", async () => {
    const { shell, routes } = fixture();
    const create = spyOn(
      shell.getEntityService(),
      "createEntity",
    ).mockResolvedValue({
      entityId: "book-1:part-1:chapter-2",
      jobId: "job",
      skipped: false,
    });
    const response = await request(routes, "entities", {
      entityType: "section",
      idPath: ["book-1", "part-1", "chapter-2"],
      frontmatter: { title: "Chapter 2" },
      body: "Text",
    });
    expect(response.status).toBe(201);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      entity: {
        id: "book-1:part-1:chapter-2",
        metadata: { title: "Chapter 2" },
      },
      options: {
        conditionalWrite: { expectedRevision: null },
        eventContext: { interfaceType: "studio" },
      },
    });
  });

  test("invalid leaf segments report against Segment and never write", async () => {
    const { shell, routes } = fixture();
    const create = spyOn(shell.getEntityService(), "createEntity");
    for (const segment of [
      "",
      "chapter:two",
      "../chapter",
      "chapter/2",
      "chapter\\2",
      ".",
      "..",
      "bad\0name",
    ]) {
      const response = await request(routes, "entities", {
        entityType: "section",
        idPath: ["book", segment],
        frontmatter: {},
        body: "Body",
      });
      expect(response.status).toBe(400);
      const result = z
        .object({
          issues: z.array(
            z.object({ path: z.array(z.union([z.string(), z.number()])) }),
          ),
        })
        .parse(await response.json());
      expect(result.issues.some((issue) => issue.path[0] === "segment")).toBe(
        true,
      );
    }
    expect(create).not.toHaveBeenCalled();
  });

  test("destination preview encodes identity on the server and asks its placement owner", async () => {
    const { shell, routes } = fixture();
    shell.getMessageBus().subscribe("sync:path:request", async () => ({
      success: true,
      data: {
        relativePath: "section/book/intro.md",
        leaf: { start: 13, end: 18 },
      },
    }));
    const response = await request(routes, "destination", {
      entityType: "section",
      idPath: ["book", "intro"],
      frontmatter: { title: "Intro" },
    });
    expect(response.status).toBe(200);
    const result = z
      .object({
        idPath: z.array(z.string()),
        entityId: z.string(),
        filePath: z.string().nullable(),
      })
      .parse(await response.json());
    expect(result).toEqual({
      idPath: ["book", "intro"],
      entityId: "book:intro",
      filePath: "section/book/intro.md",
    });
    const create = spyOn(shell.getEntityService(), "createEntity");
    const invalid = await request(routes, "destination", {
      entityType: "section",
      idPath: ["book", "intro:part"],
      frontmatter: {},
    });
    expect(invalid.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  test("previews adapter-derived metadata and serialized content, just like creation", async () => {
    const { shell, routes } = fixture();
    const adapter = shell.getEntityRegistry().getAdapter("section");
    spyOn(adapter, "fromMarkdown").mockReturnValue({
      metadata: { format: "png" },
    });
    const payloads: unknown[] = [];
    shell.getMessageBus().subscribe("sync:path:request", async (message) => {
      payloads.push(message.payload);
      return {
        success: true,
        data: {
          relativePath: "section/intro.png",
          leaf: { start: 8, end: 13 },
        },
      };
    });
    const response = await request(routes, "destination", {
      entityType: "section",
      idPath: ["intro"],
      frontmatter: { title: "Raw title" },
      body: "Source",
    });
    expect(response.status).toBe(200);
    expect(payloads[0]).toMatchObject({
      entityType: "section",
      entityId: "intro",
      metadata: { format: "png" },
    });
    const payload = z.object({ content: z.string() }).parse(payloads[0]);
    expect(payload.content).toContain("title: Raw title");
    expect(payload.content).toContain("Source");
  });

  test("does not guess a file path when directory-sync is absent", async () => {
    const { routes } = fixture();
    const response = await request(routes, "destination", {
      entityType: "section",
      idPath: ["book", "intro"],
      frontmatter: {},
    });
    expect(response.status).toBe(200);
    const result = z
      .object({ filePath: z.null() })
      .parse(await response.json());
    expect(result.filePath).toBeNull();
  });

  test("recognizes a conflict from a different bundle by its error name", async () => {
    const { shell, routes } = fixture();
    const conflict = new Error("Entity write conflict: section/book:intro");
    conflict.name = "EntityWriteConflictError";
    expect(conflict).not.toBeInstanceOf(EntityWriteConflictError);
    const create = spyOn(
      shell.getEntityService(),
      "createEntity",
    ).mockRejectedValue(conflict);
    const response = await request(routes, "entities", {
      entityType: "section",
      idPath: ["book", "intro"],
      frontmatter: {},
      body: "Body",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "An entry already exists at this destination.",
      issues: [{ path: ["segment"], message: "Choose a different segment." }],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("does not mistake an unrelated persistence error for a destination conflict", async () => {
    const { shell, routes } = fixture();
    const failure = new Error("Entity write conflict: section/book:intro");
    spyOn(shell.getEntityService(), "createEntity").mockRejectedValue(failure);
    const rejected = await request(routes, "entities", {
      entityType: "section",
      idPath: ["book", "intro"],
      frontmatter: {},
    }).catch((error: unknown) => error);
    expect(rejected).toBe(failure);
  });

  test("a conflicting destination reports 409 without renaming it", async () => {
    const { shell, routes } = fixture();
    const create = spyOn(
      shell.getEntityService(),
      "createEntity",
    ).mockRejectedValue(new EntityWriteConflictError("section", "book:intro"));
    expect(
      (
        await request(routes, "entities", {
          entityType: "section",
          idPath: ["book", "intro"],
          frontmatter: {},
          body: "Body",
        })
      ).status,
    ).toBe(409);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("Studio hierarchy of a container type", () => {
  const record = (
    entityType: string,
    id: string,
    title: string,
    updated = "2026-10-01T00:00:00Z",
  ): BaseEntity => ({
    id,
    entityType,
    content: `---\ntitle: ${title}\n---\n\nText`,
    metadata: { title },
    visibility: "public",
    contentHash: id,
    created: updated,
    updated,
  });
  const books = [record("book", "zara", "Also sprach Zarathustra")];
  const sections = [
    record("section", "zara:00001-vorrede", "Vorrede"),
    {
      ...record("section", "zara:00002-erster-theil:00003-reden", "Reden"),
      content: "---\ntitle: Reden\nheadings:\n  - Erster Theil\n---\n\nText",
    },
  ];
  /** A section names the folders it stands in by its headings. */
  class SectionAdapter extends Adapter {
    getFolderTitles(
      entity: Pick<BaseEntity, "content">,
    ): Array<string | undefined> {
      const { headings } = this.parseFrontMatter(
        entity.content,
        z.object({ headings: z.array(z.string()).default([]) }),
      );
      return [undefined, ...headings];
    }
  }

  /** Books contain sections; the store answers as the entity service would. */
  function containerFixture(): {
    shell: ReturnType<typeof createMockShell>;
    routes: WebRouteDefinition[];
  } {
    const shell = createMockShell({ domain: "example.com" });
    const registry = shell.getEntityRegistry();
    registry.registerEntityType("book", baseEntitySchema, new Adapter("book"));
    registry.registerEntityType(
      "section",
      baseEntitySchema,
      new SectionAdapter("section"),
      { containedIn: "book" },
    );
    registry.getEffectiveFrontmatterSchema = (): typeof frontmatterSchema =>
      frontmatterSchema;
    spyOn(shell.getEntityService(), "queryEntityHierarchy").mockImplementation(
      async (query) => {
        const prefix = query.prefix ? [...query.prefix] : [];
        const of = query.entityType === "book" ? books : sections;
        const within = of.filter((entity) =>
          prefix.every(
            (segment, depth) => entity.id.split(":")[depth] === segment,
          ),
        );
        const direct = query.includeDescendants
          ? within
          : within.filter(
              (entity) => entity.id.split(":").length === prefix.length + 1,
            );
        const folderNames = query.includeDescendants
          ? []
          : [
              ...new Set(
                within
                  .filter(
                    (entity) => entity.id.split(":").length > prefix.length + 1,
                  )
                  .map((entity) => entity.id.split(":")[prefix.length] ?? ""),
              ),
            ];
        const offset = query.offset ?? 0;
        return {
          prefix:
            prefix.length > 0 ? decodeEntityIdPath(prefix.join(":")) : null,
          folders: folderNames.map((name) => ({
            path: decodeEntityIdPath([...prefix, name].join(":")),
            name,
            descendantCount: within.filter(
              (entity) => entity.id.split(":")[prefix.length] === name,
            ).length,
          })),
          entities: direct
            .slice(offset, offset + (query.limit ?? 50))
            .map((entity) => ({
              entity,
              path: decodeEntityIdPath(entity.id),
            })),
          offset,
          totalEntities: direct.length,
        };
      },
    );
    spyOn(shell.getEntityService(), "getEntity").mockImplementation(
      async (request: GetEntityRequest): Promise<BaseEntity | null> =>
        [...books, ...sections].find(
          (entity) =>
            entity.entityType === request.entityType &&
            entity.id === request.id,
        ) ?? null,
    );
    const context = createServicePluginContext(shell, "studio");
    const routes = createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      getEntityDisplay: () => undefined,
      resolveAuthPrincipal: async () => ({
        userId: "usr_editor",
        personId: "person_editor",
        displayName: "Editor",
        role: "trusted",
        status: "active",
        permissionLevel: "trusted",
        isAnchor: false,
      }),
      workspaceRegistry: new StudioWorkspaceRegistry(),
    });
    return { shell, routes };
  }

  const containerPageSchema = z.object({
    folders: z.array(
      z.object({
        path: z.array(z.string()),
        title: z.string().optional(),
        descendantCount: z.number(),
      }),
    ),
    entities: z.array(z.object({ id: z.string(), entityType: z.string() })),
    total: z.number(),
    trail: z.array(z.string().nullable()).optional(),
  });

  test("reports which type a contained type lives in, and keeps containers flat", async () => {
    const { routes } = containerFixture();
    const response = await request(routes, "types");
    const { types } = z
      .object({
        types: z.array(
          z.object({
            entityType: z.string(),
            containedIn: z.string().optional(),
            hierarchy: z.object({ nested: z.boolean() }),
          }),
        ),
      })
      .parse(await response.json());

    expect(types.find((type) => type.entityType === "section")).toMatchObject({
      containedIn: "book",
    });
    expect(types.find((type) => type.entityType === "book")).toMatchObject({
      hierarchy: { nested: false },
    });
  });

  test("lists each container as a folder titled by its entity", async () => {
    const { routes } = containerFixture();
    const page = containerPageSchema.parse(
      await (await request(routes, "hierarchy?type=book")).json(),
    );

    expect(page.folders).toEqual([
      { path: ["zara"], title: "Also sprach Zarathustra", descendantCount: 2 },
    ]);
    expect(page.entities).toEqual([]);
  });

  test("opens a container on its own record, then its contents", async () => {
    const { routes } = containerFixture();
    const prefix = encodeURIComponent(JSON.stringify(["zara"]));
    const page = containerPageSchema.parse(
      await (
        await request(routes, `hierarchy?type=book&prefix=${prefix}`)
      ).json(),
    );

    expect(page.entities).toEqual([
      { id: "zara", entityType: "book" },
      { id: "zara:00001-vorrede", entityType: "section" },
    ]);
    expect(page.folders).toEqual([
      {
        path: ["zara", "00002-erster-theil"],
        title: "Erster Theil",
        descendantCount: 1,
      },
    ]);
    expect(page.total).toBe(2);
    expect(page.trail).toEqual(["Also sprach Zarathustra"]);
  });

  test("names a part by the headings its sections stand under", async () => {
    const { routes } = containerFixture();
    const prefix = encodeURIComponent(
      JSON.stringify(["zara", "00002-erster-theil"]),
    );
    const page = containerPageSchema.parse(
      await (
        await request(routes, `hierarchy?type=book&prefix=${prefix}`)
      ).json(),
    );

    expect(page.trail).toEqual(["Also sprach Zarathustra", "Erster Theil"]);
  });

  test("names folders by their entries' headings outside a container too", async () => {
    const { routes } = containerFixture();
    const prefix = encodeURIComponent(JSON.stringify(["zara"]));
    const page = containerPageSchema.parse(
      await (
        await request(routes, `hierarchy?type=section&prefix=${prefix}`)
      ).json(),
    );

    expect(page.folders).toEqual([
      {
        path: ["zara", "00002-erster-theil"],
        title: "Erster Theil",
        descendantCount: 1,
      },
    ]);
  });

  test("searches a container's contents as well as the containers", async () => {
    const { routes } = containerFixture();
    const page = containerPageSchema.parse(
      await (await request(routes, "hierarchy?type=book&q=Text")).json(),
    );

    expect(page.entities.map((entity) => entity.id)).toEqual([
      "zara",
      "zara:00001-vorrede",
      "zara:00002-erster-theil:00003-reden",
    ]);
    expect(page.total).toBe(3);
  });
});
