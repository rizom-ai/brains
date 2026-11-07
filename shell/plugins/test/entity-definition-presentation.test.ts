import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { siteBuildStagingContract } from "@brains/contracts";
import type {
  BaseEntity,
  DataSource,
  EntitySchema,
  IEntityService,
  ListEntitiesRequest,
} from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import {
  createTemplate,
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyDataSourceDeclaration,
  type AnyEntityDefinition,
  type Plugin,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const bookmarkMetadata = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.string().optional(),
});

const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page.",
  metadata: bookmarkMetadata,
});

async function install(
  entities: readonly AnyEntityDefinition[],
  dataSources: readonly AnyDataSourceDeclaration[] = [],
): Promise<{ harness: Harness; plugins: readonly Plugin[] }> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "reading", entities, dataSources }),
    {},
    { name: "@fixture/reading", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-presentation"),
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return { harness, plugins };
}

async function seedBookmarks(harness: Harness): Promise<void> {
  const entities = harness.getEntityService();
  await entities.createEntity({
    entity: {
      id: "first",
      entityType: "bookmark",
      content: "First page",
      metadata: { title: "First", slug: "first", status: "published" },
    },
  });
  await entities.createEntity({
    entity: {
      id: "second",
      entityType: "bookmark",
      content: "Second page",
      metadata: { title: "Second", slug: "second", status: "draft" },
    },
  });
  await entities.createEntity({
    entity: {
      id: "third",
      entityType: "bookmark",
      content: "Third page",
      metadata: { title: "Third", slug: "third", status: "published" },
    },
  });
}

function registered(harness: Harness, id: string): DataSource {
  const dataSource = harness.getDataSources().get(id);
  if (!dataSource?.fetch)
    throw new Error(`Data source ${id} was not registered`);
  return dataSource;
}

describe("declared templates", () => {
  it("registers templates under the entity's scope and follows package data sources", async () => {
    const guide = defineEntity({
      type: "guide",
      purpose: "A rendered guide.",
      metadata: z.object({ title: z.string() }),
      templates: {
        "guide-list": createTemplate({
          name: "guide-list",
          description: "Lists guides",
          schema: z.object({ titles: z.array(z.string()) }),
          requiredPermission: "public",
          dataSourceId: "guide-page",
        }),
        borrowed: createTemplate({
          name: "borrowed",
          description: "Reads another package's data source",
          schema: z.object({}),
          requiredPermission: "public",
          dataSourceId: "@fixture/other:entities",
        }),
      },
    });
    const { harness } = await install(
      [guide],
      [
        defineDataSource({
          id: "guide-page",
          name: "Guide page",
          description: "Data for the guide page",
          fetch: async () => ({ titles: [] }),
        }),
      ],
    );
    try {
      const templates = harness.getTemplates();
      expect(
        templates.get("@fixture/reading:guide:guide-list")?.dataSourceId,
      ).toBe("@fixture/reading:guide-page");
      expect(
        templates.get("@fixture/reading:guide:borrowed")?.dataSourceId,
      ).toBe("@fixture/other:entities");
    } finally {
      await harness.reset();
    }
  });

  it("registers no templates for a type that declares none", async () => {
    const { harness } = await install([
      defineEntity({
        type: "bare",
        purpose: "Declares no templates.",
        metadata: z.object({}),
      }),
    ]);
    try {
      expect(
        [...harness.getTemplates().keys()].filter((name) =>
          name.startsWith("@fixture/reading:bare:"),
        ),
      ).toEqual([]);
    } finally {
      await harness.reset();
    }
  });
});

describe("declared fetching data sources", () => {
  it("registers under the package scope and reads through definitions", async () => {
    const { harness } = await install(
      [bookmark],
      [
        defineDataSource({
          id: "shelf",
          name: "Shelf",
          description: "Bookmark titles, newest first",
          fetch: async (query, entities, context) => {
            const listed = await entities.list(bookmark, {
              sort: [{ field: "title", direction: "desc" }],
              limit: 10,
            });
            const first = await entities.get(bookmark, "first");
            return {
              query,
              titles: listed.map((entry) => entry.metadata.title),
              first: first?.metadata.slug ?? null,
              total: await entities.count(bookmark),
              publishedOnly: context.publishedOnly ?? null,
              frozen: Object.isFrozen(context),
            };
          },
        }),
      ],
    );
    try {
      await seedBookmarks(harness);
      const output = z.object({
        query: z.unknown(),
        titles: z.array(z.string()),
        first: z.string().nullable(),
        total: z.number(),
        publishedOnly: z.boolean().nullable(),
        frozen: z.boolean(),
      });
      expect(
        await registered(harness, "@fixture/reading:shelf").fetch?.(
          { page: 1 },
          output,
          { entityService: harness.getEntityService(), publishedOnly: true },
        ),
      ).toEqual({
        query: { page: 1 },
        titles: ["Third", "Second", "First"],
        first: "first",
        total: 3,
        publishedOnly: true,
        frozen: true,
      });
    } finally {
      await harness.reset();
    }
  });

  it("validates what it returns against the caller's schema", async () => {
    const { harness } = await install(
      [bookmark],
      [
        defineDataSource({
          id: "shelf",
          name: "Shelf",
          description: "Returns a number where a list belongs",
          fetch: async () => ({ titles: 3 }),
        }),
      ],
    );
    try {
      const refused = await registered(harness, "@fixture/reading:shelf")
        .fetch?.({}, z.object({ titles: z.array(z.string()) }), {
          entityService: harness.getEntityService(),
        })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(z.ZodError);
    } finally {
      await harness.reset();
    }
  });

  it("refuses an id that is not a local identifier", () => {
    expect(() =>
      defineDataSource({
        id: "@fixture/reading:shelf",
        name: "Shelf",
        description: "Names a scoped id itself",
        fetch: async () => ({}),
      }),
    ).toThrow();
  });

  it("refuses a declaration that both fetches and reads an entity", () => {
    const both = {
      id: "both",
      name: "Both",
      description: "Declares both forms",
      entity: bookmark,
      defaultSort: [],
      transform: (): null => null,
      list: (): { items: [] } => ({ items: [] }),
    };
    Object.assign(both, { fetch: async (): Promise<object> => ({}) });
    expect(() => defineDataSource(both)).toThrow("both or neither");
  });

  it("refuses two data sources with one id in a package", () => {
    const source = defineDataSource({
      id: "shared",
      name: "Shared",
      description: "Declared twice",
      fetch: async () => ({}),
    });
    expect(() =>
      defineEntityPackage({
        id: "reading",
        entities: [bookmark],
        dataSources: [source, source],
      }),
    ).toThrow("duplicate data source ids");
  });

  it("refuses data sources in a package without entities", () => {
    expect(() =>
      defineEntityPackage({
        id: "empty",
        entities: [],
        dataSources: [
          defineDataSource({
            id: "orphan",
            name: "Orphan",
            description: "Nothing installs it",
            fetch: async () => ({}),
          }),
        ],
      }),
    ).toThrow("declares data sources but no entities");
  });
});

describe("declared entity data sources", () => {
  const listSchema = z.object({
    titles: z.array(z.string()),
    page: z.number().nullable(),
  });

  const bookmarks = defineDataSource({
    id: "bookmarks",
    name: "Bookmarks",
    description: "Lists bookmarks and shows one",
    entity: bookmark,
    defaultSort: [{ field: "title", direction: "asc" }],
    enableNavigation: true,
    filter: (query) =>
      query["status"] === "published"
        ? { metadata: { status: "published" } }
        : undefined,
    transform: (entity) => ({
      slug: entity.metadata.slug,
      title: entity.metadata.title,
    }),
    list: (items, pagination) => ({
      titles: items.map(({ title }) => title),
      page: pagination?.currentPage ?? null,
    }),
    detail: async ({ item, navigation, siblings, entities }) => ({
      title: item.title,
      previous: navigation?.prev?.title ?? null,
      next: navigation?.next?.title ?? null,
      siblings: siblings.map(({ slug }) => slug),
      total: await entities.count(bookmark),
    }),
  });

  it("derives the entity schema from the definition", async () => {
    const { harness } = await install([bookmark], [bookmarks]);
    try {
      // The entity service leaves out a row its type cannot read, so the
      // source's own check is shown on a service that hands one over anyway.
      const now = new Date().toISOString();
      const broken: BaseEntity = {
        id: "broken",
        entityType: "bookmark",
        content: "Missing its slug",
        contentHash: "broken",
        metadata: { title: "Broken" },
        visibility: "public",
        created: now,
        updated: now,
      };
      function listEntities(
        request: ListEntitiesRequest,
      ): Promise<BaseEntity[]>;
      function listEntities<T extends BaseEntity>(
        request: ListEntitiesRequest,
        schema: EntitySchema<T>,
      ): Promise<T[]>;
      async function listEntities(
        _request: ListEntitiesRequest,
        schema?: EntitySchema<BaseEntity>,
      ): Promise<BaseEntity[]> {
        return schema ? [schema.parse(broken)] : [broken];
      }
      const entityService: IEntityService = {
        ...harness.getEntityService(),
        listEntities,
      };
      const refused = await registered(harness, "@fixture/reading:bookmarks")
        .fetch?.({}, listSchema, { entityService })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(z.ZodError);
    } finally {
      await harness.reset();
    }
  });

  it("lists in its default order, pages and filters through the runtime's reads", async () => {
    const { harness } = await install([bookmark], [bookmarks]);
    try {
      await seedBookmarks(harness);
      const source = registered(harness, "@fixture/reading:bookmarks");
      const context = { entityService: harness.getEntityService() };
      expect(await source.fetch?.({}, listSchema, context)).toEqual({
        titles: ["First", "Second", "Third"],
        page: null,
      });
      expect(
        await source.fetch?.(
          { query: { page: 2, pageSize: 1 } },
          listSchema,
          context,
        ),
      ).toEqual({ titles: ["Second"], page: 2 });
      expect(
        await source.fetch?.(
          { query: { status: "published" } },
          listSchema,
          context,
        ),
      ).toEqual({ titles: ["First", "Third"], page: null });
    } finally {
      await harness.reset();
    }
  });

  it("shows one entity by slug with its neighbors and siblings", async () => {
    const { harness } = await install([bookmark], [bookmarks]);
    try {
      await seedBookmarks(harness);
      expect(
        await registered(harness, "@fixture/reading:bookmarks").fetch?.(
          { query: { id: "second" } },
          z.object({
            title: z.string(),
            previous: z.string().nullable(),
            next: z.string().nullable(),
            siblings: z.array(z.string()),
            total: z.number(),
          }),
          { entityService: harness.getEntityService() },
        ),
      ).toEqual({
        title: "Second",
        previous: "First",
        next: "Third",
        siblings: ["first", "second", "third"],
        total: 3,
      });
    } finally {
      await harness.reset();
    }
  });

  it("refuses a detail query when it declares no detail view", async () => {
    const { harness } = await install(
      [bookmark],
      [
        defineDataSource({
          id: "bookmarks",
          name: "Bookmarks",
          description: "Lists bookmarks",
          entity: bookmark,
          defaultSort: [{ field: "title", direction: "asc" }],
          transform: (entity) => entity.metadata.title,
          list: (items) => ({ titles: [...items] }),
        }),
      ],
    );
    try {
      await seedBookmarks(harness);
      const refused = await registered(harness, "@fixture/reading:bookmarks")
        .fetch?.({ query: { id: "first" } }, z.unknown(), {
          entityService: harness.getEntityService(),
        })
        .catch((error: unknown) => error);
      expect(String(refused)).toContain("declares no detail view");
    } finally {
      await harness.reset();
    }
  });

  it("refuses an entity data source for a type outside its package", () => {
    const stranger = defineEntity({
      type: "stranger",
      purpose: "Not in the package.",
      metadata: z.object({ title: z.string() }),
    });
    expect(() =>
      defineEntityPackage({
        id: "reading",
        entities: [bookmark],
        dataSources: [
          defineDataSource({
            id: "strangers",
            name: "Strangers",
            description: "Reads a type the package does not declare",
            entity: stranger,
            defaultSort: [{ field: "title", direction: "asc" }],
            lookupField: "id",
            transform: (entity) => entity.metadata.title,
            list: (items) => ({ titles: [...items] }),
          }),
        ],
      }),
    ).toThrow("reads an entity outside its package");
  });
});

describe("declared feeds", () => {
  let outputDir = "";
  const failures: string[] = [];

  const bookmark = defineEntity({
    type: "bookmark",
    purpose: "A saved page that syndicates.",
    metadata: bookmarkMetadata,
    feed: {
      path: "reading/bookmarks.xml",
      routePrefix: "bookmarks",
      toItem: (entity) =>
        entity.metadata.title === "Skip"
          ? null
          : {
              title: entity.metadata.title,
              slug: entity.metadata.slug,
              description: `Saved: ${entity.metadata.title}`,
              content: entity.content,
              author: "Reader",
              publishedAt: entity.created,
            },
    },
  });

  function stage(
    harness: Harness,
    environment: "preview" | "production",
  ): Promise<unknown> {
    return harness.sendMessage(
      siteBuildStagingContract.name,
      {
        outputDir,
        environment,
        routesBuilt: 1,
        siteConfig: { title: "Reader", url: "https://reader.example/" },
        generateEntityUrl: (entityType: string, slug: string): string =>
          `/${entityType}s/${slug}`,
        reportFailure: (detail: string): void => {
          failures.push(detail);
        },
      },
      "site-builder",
      true,
    );
  }

  beforeEach(async () => {
    failures.length = 0;
    outputDir = await mkdtemp(join(tmpdir(), "entity-feed-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("writes the published entities into the staged build", async () => {
    const { harness } = await install([bookmark]);
    try {
      await seedBookmarks(harness);
      await stage(harness, "production");
      const xml = await readFile(
        join(outputDir, "reading/bookmarks.xml"),
        "utf8",
      );
      expect(failures).toEqual([]);
      expect(xml).toContain("<title>Reader</title>");
      expect(xml).toContain("<link>https://reader.example/bookmarks</link>");
      expect(xml).toContain(
        '<atom:link href="https://reader.example/reading/bookmarks.xml"',
      );
      expect(xml).toContain(
        "<link>https://reader.example/bookmarks/first</link>",
      );
      expect(xml).not.toContain("/bookmarks/second<");
    } finally {
      await harness.reset();
    }
  });

  it("carries unpublished entities in a preview build", async () => {
    const { harness } = await install([bookmark]);
    try {
      await seedBookmarks(harness);
      await stage(harness, "preview");
      const xml = await readFile(
        join(outputDir, "reading/bookmarks.xml"),
        "utf8",
      );
      expect(xml).toContain("/bookmarks/second<");
    } finally {
      await harness.reset();
    }
  });

  it("writes nothing when no entity becomes an item", async () => {
    const { harness } = await install([bookmark]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "skipped",
          entityType: "bookmark",
          content: "Not for the feed",
          metadata: { title: "Skip", slug: "skipped", status: "published" },
        },
      });
      await stage(harness, "production");
      expect(failures).toEqual([]);
      expect(
        await stat(join(outputDir, "reading/bookmarks.xml")).catch(() => null),
      ).toBeNull();
    } finally {
      await harness.reset();
    }
  });

  it("fails the build when an item is malformed", async () => {
    const malformed = defineEntity({
      type: "bookmark",
      purpose: "Returns an item a reader cannot use.",
      metadata: bookmarkMetadata,
      feed: {
        path: "bookmarks.xml",
        routePrefix: "bookmarks",
        toItem: (entity) => ({
          title: "",
          slug: entity.metadata.slug,
          description: "",
          content: entity.content,
          author: "Reader",
          publishedAt: entity.created,
        }),
      },
    });
    const { harness } = await install([malformed]);
    try {
      await seedBookmarks(harness);
      await stage(harness, "production");
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain("bookmark feed");
    } finally {
      await harness.reset();
    }
  });

  it("stops answering the build once the plugin shuts down", async () => {
    const { harness, plugins } = await install([bookmark]);
    try {
      await seedBookmarks(harness);
      await Promise.all(
        plugins.map(async (plugin): Promise<void> => plugin.shutdown?.()),
      );
      await stage(harness, "production");
      expect(
        await stat(join(outputDir, "reading/bookmarks.xml")).catch(() => null),
      ).toBeNull();
    } finally {
      await harness.reset();
    }
  });

  for (const path of [
    "/feed.xml",
    "../feed.xml",
    "reading/../../feed.xml",
    "",
  ]) {
    it(`refuses a feed path outside the build: ${JSON.stringify(path)}`, () => {
      expect(() =>
        createEntityPackagePlugins(
          [
            defineEntity({
              type: "bookmark",
              purpose: "Writes outside the build.",
              metadata: bookmarkMetadata,
              feed: {
                path,
                routePrefix: "bookmarks",
                toItem: () => null,
              },
            }),
          ],
          [],
          { name: "@fixture/reading", version: "0.1.0" },
          (id) => `@fixture/reading:${id}`,
        ),
      ).toThrow();
    });
  }
});
