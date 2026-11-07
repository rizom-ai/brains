import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestDirectory,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createEntityReader } from "../src/entity/entity-reader";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import type { OwnedEntityWriter } from "../src/service/service-definition-contract";
import {
  EntityPlugin,
  defineDataSource,
  defineEntity,
  defineEntityAnalyticsReport,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityCheckResult,
  type EntityCreateResolution,
  type EntityReader,
  type Plugin,
  type PluginCapabilities,
  type ToolContext,
} from "../src";

// A body that a read must hand back as stored: no frontmatter, and an image
// reference left as the reference rather than resolved to its data.
const BODY = "A card about tides.\n\n![cover](entity://image/cover-1)";
const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const frontmatter = z.object({ heading: z.string(), tone: z.string() });
const cardMetadata = z.object({
  title: z.string(),
  tone: z.enum(["plain", "warm"]),
});
// The codec renames the frontmatter, so a read that skipped it would show.
const card = defineEntity({
  type: "card",
  purpose: "A card whose frontmatter is not its metadata",
  metadata: cardMetadata,
  markdown: {
    decode: ({ content, frontmatter: raw }) => {
      const { heading, tone } = frontmatter.parse(raw);
      return {
        content,
        metadata: { title: heading, tone: tone === "warm" ? "warm" : "plain" },
      };
    },
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: { heading: metadata.title, tone: metadata.tone },
    }),
  },
  inbox: {
    sourceId: "card-review",
    displayName: "Cards",
    list: async ({ records }) =>
      (await records.list()).map((record) => ({
        id: record.id,
        title: record.metadata.title,
        receivedAt: record.created,
        urgency: "normal",
        // A summary is trimmed when the Inbox validates it.
        summary: record.content.trim(),
        actions: [{ id: "keep", label: "Keep" }],
      })),
    resolveDetail: async (id, { records }) => ({
      kind: "plain",
      text: (await records.get(id))?.content ?? "",
      truncated: false,
    }),
    act: async (id, _action, { records, edits }) => {
      const record = await records.get(id);
      if (!record) throw new Error("Missing card");
      await edits.update(record, { metadata: record.metadata });
    },
  },
  analyticsReports: [
    defineEntityAnalyticsReport({
      type: "card-body",
      description: "The body of one card",
      params: z.object({ id: z.string() }),
      report: async (
        { id },
        { entities },
      ): Promise<{ content: string | null }> => ({
        content: (await entities.get(card, id))?.content ?? null,
      }),
    }),
  ],
  checks: [
    {
      id: "card-body",
      cadence: "daily",
      run: async ({ entities }): Promise<EntityCheckResult> => ({
        alerts: (await entities.list(card)).map((record) => ({
          dedupeKey: record.id,
          title: record.metadata.title,
          body: record.content,
        })),
      }),
    },
  ],
  evals: {
    body: async (_input, { entities }): Promise<unknown> =>
      (await entities.get(card, "tide"))?.content,
  },
  create: {
    fromContent: {
      resolve: async ({
        entities,
      }): Promise<EntityCreateResolution<typeof cardMetadata>> => {
        const existing = await entities.get(card, "tide");
        if (!existing) return { refuse: "No card" };
        return {
          update: {
            id: existing.id,
            content: existing.content,
            metadata: existing.metadata,
          },
        };
      },
    },
  },
});
// A type a service owns, written back through its own entities.
const memo = defineEntity({
  type: "memo",
  purpose: "A memo the service keeps",
  metadata: z.object({ title: z.string() }),
});
const image = defineEntity({
  type: "image",
  purpose: "The image a card shows",
  metadata: z.object({}),
});

let memos: (EntityReader & OwnedEntityWriter<typeof memo>) | undefined;
const memoService = defineServicePlugin(
  { id: "memos", config: z.object({}), entities: [memo] },
  {
    tools: ({ entities }) => {
      memos = entities;
      return [];
    },
  },
);

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "service", serviceId: "test" },
  userPermissionLevel: "admin",
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

interface Storage {
  readonly service: EntityService;
  readonly shell: MockShell;
  readonly evals: Map<string, (input: unknown) => Promise<unknown>>;
  /** The stored markdown's hash: equal hashes are byte-identical files. */
  storedHash(id: string, entityType?: string): Promise<string | undefined>;
}

/** A real entity service behind a test shell with these declared types. */
async function realShell(
  entities: readonly AnyEntityDefinition[],
): Promise<{ service: EntityService; shell: MockShell }> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "linked", entities }),
    {},
    { name: "@fixture/linked", version: "0.1.0" },
  );
  for (const plugin of plugins) {
    if (plugin instanceof EntityPlugin) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const real = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await real.initialize();
  close = async (): Promise<void> => {
    real.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = real;
  const shell = createMockShell({ logger, entityService });
  for (const plugin of plugins) await plugin.register(shell);
  return { service: real, shell };
}

/** A real entity service behind a test shell, with the cards installed. */
async function storage(): Promise<Storage> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = [
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({
        id: "cards",
        entities: [card, image],
        dataSources: [
          defineDataSource({
            id: "card-body",
            name: "Card body",
            description: "The body of the tide card",
            fetch: async (_query, entities) => ({
              content: (await entities.get(card, "tide"))?.content ?? null,
            }),
          }),
        ],
      }),
      {},
      { name: "@fixture/cards", version: "0.1.0" },
    ),
    ...instantiatePluginPackageDefinition(
      memoService,
      {},
      {
        name: "@fixture/memos",
        version: "0.1.0",
      },
    ),
  ];
  for (const plugin of plugins) {
    if (plugin instanceof EntityPlugin) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
      );
    }
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const real = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await real.initialize();
  close = async (): Promise<void> => {
    real.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = real;
  const shell = createMockShell({ logger, entityService });
  const evals = new Map<string, (input: unknown) => Promise<unknown>>();
  shell.registerEvalHandler = (_pluginId, id, handler): void => {
    evals.set(id, handler);
  };
  await plugins.reduce<Promise<PluginCapabilities[]>>(
    async (done, plugin: Plugin) => [
      ...(await done),
      await plugin.register(shell),
    ],
    Promise.resolve([]),
  );
  shell.getInboxRegistry().finalize();
  await real.createEntity({
    entity: {
      id: "cover-1",
      entityType: "image",
      content: DATA_URL,
      metadata: {},
    },
  });
  await real.createEntity({
    entity: {
      id: "tide",
      entityType: "card",
      content: BODY,
      metadata: { title: "Tide", tone: "warm" },
    },
  });
  await real.createEntity({
    entity: {
      id: "note",
      entityType: "memo",
      content: BODY,
      metadata: { title: "Note" },
    },
  });
  return {
    service: real,
    shell,
    evals,
    storedHash: async (id, entityType = "card") =>
      (
        await real.getEntityRaw({
          entityType,
          id,
          visibilityScope: "restricted",
        })
      )?.contentHash,
  };
}

describe("a definition-typed record carries the body as stored", () => {
  it("reads the body through the type's codec, for get and list alike", async () => {
    const { service } = await storage();
    const reader = createEntityReader(service, "restricted");

    expect((await reader.get(card, "tide"))?.content).toBe(BODY);
    expect((await reader.list(card)).map(({ content }) => content)).toEqual([
      BODY,
    ]);
    expect(await reader.get(card, "tide")).toMatchObject({
      metadata: { title: "Tide", tone: "warm" },
    });
  });

  it("hands the body to every declared slot that reads records", async () => {
    const { service, shell, evals } = await storage();

    const source = shell
      .getDataSourceRegistry()
      .get("@fixture/cards:card-body");
    expect(
      await source?.fetch?.({}, z.object({ content: z.string().nullable() }), {
        entityService: service,
      }),
    ).toEqual({ content: BODY });

    const inbox = shell.getInboxRegistry().getSource("card-review");
    expect((await inbox?.list())?.map(({ summary }) => summary)).toEqual([
      BODY.trim(),
    ]);
    expect(
      await inbox?.resolveDetail?.(
        "tide",
        { permissionLevel: "admin" },
        new AbortController().signal,
      ),
    ).toMatchObject({ text: BODY });

    expect(
      await shell.getAnalyticsRegistry().run({
        type: "card-body",
        params: { id: "tide" },
        permission: "admin",
        entityService: service,
      }),
    ).toEqual({ content: BODY });

    const check = shell.getRecurringCheck("@fixture/cards:card:card-body");
    expect(
      (await check?.run({ signal: new AbortController().signal }))?.alerts,
    ).toEqual([{ dedupeKey: "tide", title: "Tide", body: BODY }]);

    expect(await evals.get("body")?.({})).toBe(BODY);
  });
});

describe("a record read and written back unchanged is stored byte for byte", () => {
  it("through an Inbox action", async () => {
    const { shell, storedHash } = await storage();
    const before = await storedHash("tide");
    await shell
      .getInboxRegistry()
      .getSource("card-review")
      ?.act("tide", "keep", { permissionLevel: "admin" });
    expect(await storedHash("tide")).toBe(before);
  });

  it("through a create route's update", async () => {
    const { shell, storedHash } = await storage();
    const before = await storedHash("tide");
    const interceptor = shell
      .getEntityRegistry()
      .getCreateInterceptor(card.type);
    if (!interceptor) throw new Error("No create interceptor");
    expect(
      await interceptor(
        { entityType: card.type, content: "Keep it", title: "Tide" },
        {
          interfaceType: "mcp",
          actor: admin.actor,
          userPermissionLevel: "admin",
        },
      ),
    ).toMatchObject({ kind: "handled" });
    expect(await storedHash("tide")).toBe(before);
  });

  it("for a body that ends in a newline", async () => {
    const { service, storedHash } = await storage();
    if (!memos) throw new Error("The memo service was not set up");
    await service.createEntity({
      entity: {
        id: "lined",
        entityType: "memo",
        content: "Ends in a newline\n",
        metadata: { title: "Lined" },
      },
    });
    const before = await storedHash("lined", "memo");
    const read = await memos.get(memo, "lined");
    if (!read) throw new Error("Missing memo");
    await memos.update(memo, read, { content: read.content });
    expect(await storedHash("lined", "memo")).toBe(before);
  });

  it("through a service's owned writes, content or metadata alone", async () => {
    const { storedHash } = await storage();
    if (!memos) throw new Error("The memo service was not set up");
    const before = await storedHash("note", "memo");

    const read = await memos.get(memo, "note");
    if (!read) throw new Error("Missing memo");
    expect(read.content).toBe(BODY);
    await memos.update(memo, read, { content: read.content });
    expect(await storedHash("note", "memo")).toBe(before);

    const again = await memos.get(memo, "note");
    if (!again) throw new Error("Missing memo");
    await memos.update(memo, again, { metadata: again.metadata });
    expect(await storedHash("note", "memo")).toBe(before);
    expect((await memos.get(memo, "note"))?.content).toBe(BODY);
  });
});

describe("a generation links into a declared target through the real service", () => {
  const targetType = "post";
  const render = defineEntity({
    type: "render-post",
    purpose: "A render linked into its source",
    metadata: z.object({ title: z.string() }),
    generation: {
      input: z.object({ mode: z.enum(["cover", "list"]) }),
      generate: async ({ input }) => ({
        success: true,
        id: `render-${input.mode}`,
        content: "rendered",
        metadata: { title: "Render" },
        linkInto:
          input.mode === "cover"
            ? {
                entityType: targetType,
                entityId: "essay",
                field: "coverImageId",
              }
            : {
                entityType: targetType,
                entityId: "essay",
                list: "renders",
                replaces: ["render-stale"],
              },
      }),
    },
  });
  // The linked fields are the type's own metadata, as a declared type's
  // frontmatter is.
  const post = defineEntity({
    type: "post",
    purpose: "Holds a cover and a list of renders",
    metadata: z.object({
      title: z.string(),
      coverImageId: z.string().optional(),
      renders: z.array(z.object({ id: z.string() })).default([]),
    }),
    coverImage: true,
  });

  it("sets the cover and extends the list in the target's metadata", async () => {
    const { service, shell } = await realShell([post, render]);
    await service.createEntity({
      entity: {
        id: "essay",
        entityType: "post",
        content: "Body",
        metadata: {
          title: "Essay",
          renders: [{ id: "render-stale" }, { id: "kept" }],
        },
      },
    });
    const handler = shell
      .getJobQueueService()
      .getHandler("render-post:generation");
    if (!handler) throw new Error("No generation handler");
    const run = async (mode: "cover" | "list"): Promise<void> => {
      const data = handler.validateAndParse({ mode });
      if (data === null) throw new Error("Refused job data");
      await handler.process(
        data,
        `job-${mode}`,
        createMockProgressReporter(),
        new AbortController().signal,
      );
    };

    await run("cover");
    await run("list");
    const essay = await service.getEntityRaw({
      entityType: "post",
      id: "essay",
      visibilityScope: "restricted",
    });
    expect(essay?.metadata).toMatchObject({
      coverImageId: "render-cover",
      renders: [{ id: "kept" }, { id: "render-list" }],
    });
    expect(essay?.content).toBe("Body");
  });
});

describe("a generation refuses a link its declared target cannot hold", () => {
  const plain = defineEntity({
    type: "plain",
    purpose: "Declares no list of renders",
    metadata: z.object({ title: z.string() }),
  });
  const renderPlain = defineEntity({
    type: "render-plain",
    purpose: "A render linked into a plain target",
    metadata: z.object({ title: z.string() }),
    generation: {
      input: z.object({}),
      generate: async () => ({
        success: true,
        id: "render-plain-1",
        content: "rendered",
        metadata: { title: "Render" },
        linkInto: { entityType: "plain", entityId: "page", list: "renders" },
      }),
    },
  });

  it("before anything is saved", async () => {
    const { service, shell } = await realShell([plain, renderPlain]);
    await service.createEntity({
      entity: {
        id: "page",
        entityType: "plain",
        content: "Body",
        metadata: { title: "Page" },
      },
    });
    const handler = shell
      .getJobQueueService()
      .getHandler("render-plain:generation");
    const data = handler?.validateAndParse({});
    if (!handler || data === null || data === undefined) {
      throw new Error("No generation handler");
    }
    expect(
      await handler.process(
        data,
        "job-plain",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    ).toEqual({
      success: false,
      error:
        "Entity type 'plain' declares no metadata field 'renders' to link into",
    });
    expect(
      await service.getEntityRaw({
        entityType: "render-plain",
        id: "render-plain-1",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });
});
