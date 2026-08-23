import { describe, expect, expectTypeOf, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createMockProgressReporter,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import {
  createEntityPackagePlugins,
  deriveProjectionUpserts,
} from "../src/entity/declarative-entity-plugin";
import type { PublishMediaData } from "@brains/contracts";
import type { JobHandler } from "@brains/job-queue";
import type { EvalHandler } from "@brains/ai-evaluation";
import type {
  EntityGenerationJobDeclaration,
  EntityGenerationResult,
  EntityJobDeclaration,
} from "../src";
import type { JobHandlerContext } from "../src/job/job-context-contract";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  CreateInterceptor,
  CreateResultAttachment,
  UploadSaveHandlerRegistration,
} from "@brains/entity-service";
import {
  AtprotoProjectionRegistry,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import type { AttachmentProvider } from "../src";
import {
  SYSTEM_CHANNELS,
  createTemplate,
  defineDataSource,
  defineEntity,
  defineEntityDataSource,
  defineEntityDashboardWidget,
  defineEntityPackage,
  defineDashboardWidget,
  defineProjection,
  defineProjectionRule,
  instantiatePluginPackageDefinition,
  type EntityOf,
} from "../src";

const executionContext: CreateExecutionContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "tester" },
};

describe("entity package definitions", () => {
  it("infers domain entities and creates a scoped package definition", async () => {
    const bookmark = defineEntity({
      type: "bookmark",
      purpose: "A saved page.",
      metadata: z.object({ tags: z.array(z.string()).default([]) }),
    });
    const digest = defineEntity({
      type: "digest",
      purpose: "A derived digest.",
      metadata: z.object({ sourceId: z.string() }),
    });
    const projection = defineProjection({
      id: "bookmark-digest",
      source: bookmark,
      target: digest,
      async project({ source, target }) {
        expectTypeOf(source.metadata.tags).toEqualTypeOf<string[]>();
        await target.upsert({
          id: source.id,
          content: source.content,
          visibility: source.visibility,
          metadata: { sourceId: source.id },
        });
      },
    });
    expect(
      await deriveProjectionUpserts(
        projection,
        {
          id: "saved-page",
          entityType: "bookmark",
          content: "Useful page",
          visibility: "shared",
          metadata: { tags: ["reference"] },
          contentHash: "hash",
          created: "2025-01-01T00:00:00.000Z",
          updated: "2025-01-01T00:00:00.000Z",
        },
        new AbortController().signal,
      ),
    ).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "saved-page",
          entityType: "digest",
          content:
            "---\nsourceId: saved-page\nvisibility: shared\n---\nUseful page\n",
          visibility: "shared",
          metadata: { sourceId: "saved-page" },
        },
      },
    ]);

    const definition = defineEntityPackage({
      id: "reading-library",
      entities: [bookmark, digest],
      projections: [projection],
    });

    expectTypeOf<
      EntityOf<typeof bookmark>["entityType"]
    >().toEqualTypeOf<"bookmark">();
    expect(definition).toMatchObject({
      family: "entity",
      id: "reading-library",
      entities: [bookmark, digest],
      projections: [projection],
    });

    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/reading-entities", version: "0.1.0" },
    );
    expect(
      plugins.map(({ id, packageName, version, type }) => ({
        id,
        packageName,
        version,
        type,
      })),
    ).toEqual([
      {
        id: "@fixture/reading-entities:bookmark",
        packageName: "@fixture/reading-entities",
        version: "0.1.0",
        type: "entity",
      },
      {
        id: "@fixture/reading-entities:digest",
        packageName: "@fixture/reading-entities",
        version: "0.1.0",
        type: "entity",
      },
    ]);

    const runtimePlugins = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/reading-entities", version: "0.1.0" },
      (id) => `@fixture/reading-entities:${id}`,
    );
    const bookmarkPlugin = runtimePlugins[0];
    if (!bookmarkPlugin) {
      throw new Error("Bookmark entity plugin was not created");
    }
    const entity = bookmarkPlugin.schema.parse({
      id: "saved-page",
      entityType: "bookmark",
      content: "Useful page",
      visibility: "public",
      metadata: {},
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });
    expect(entity.metadata).toEqual({ tags: [] });
    const markdown = bookmarkPlugin.adapter.toMarkdown(entity);
    expect(bookmarkPlugin.adapter.fromMarkdown(markdown)).toEqual({
      content: "Useful page",
      metadata: { tags: [] },
    });

    const harness = createPluginHarness({
      logger: createSilentLogger("declarative-entity-test"),
    });
    const capabilities = await harness.installPlugin(bookmarkPlugin);
    const digestPlugin = runtimePlugins[1];
    if (!digestPlugin) throw new Error("Digest entity plugin was not created");
    await harness.installPlugin(digestPlugin);
    expect(harness.getEntityService().getEntityTypes()).toEqual([
      "bookmark",
      "digest",
    ]);
    expect(capabilities.projectionRules?.map(({ id }) => id)).toEqual([
      "@fixture/reading-entities:bookmark-digest",
    ]);
  });

  it("supports typed custom markdown codecs without adapter boilerplate", () => {
    const article = defineEntity({
      type: "article",
      purpose: "A custom markdown article.",
      metadata: z.object({ title: z.string() }),
      markdown: {
        decode: ({ content, frontmatter }) => ({
          content,
          metadata: {
            title: z.string().parse(frontmatter["display_title"]),
          },
        }),
        encode: ({ content, metadata }) => ({
          content,
          frontmatter: { display_title: metadata.title },
        }),
      },
    });
    const definition = defineEntityPackage({
      id: "articles",
      entities: [article],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/articles", version: "0.1.0" },
      (id) => `@fixture/articles:${id}`,
    )[0];
    if (!plugin) throw new Error("Article entity plugin was not created");

    const entity = plugin.schema.parse({
      id: "hello",
      entityType: "article",
      content: "Article body",
      visibility: "public",
      metadata: { title: "Hello" },
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });
    const markdown = plugin.adapter.toMarkdown(entity);
    expect(markdown).toContain("display_title: Hello");
    expect(plugin.adapter.fromMarkdown(markdown)).toEqual({
      content: "Article body",
      metadata: { title: "Hello" },
    });
  });

  it("registers declared templates with the shell", async () => {
    // Without a declarative slot for templates, an entity package that
    // renders anything has to extend EntityPlugin and override
    // getTemplates(), which is what keeps 12 of the entity packages on
    // the private @brains/plugins import.
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
        }),
      },
    });
    const definition = defineEntityPackage({
      id: "guides",
      entities: [guide],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-template-test"),
    });
    await harness.installPlugin(plugin);

    expect([...harness.getTemplates().keys()]).toContain(
      "@fixture/guides:guide:guide-list",
    );

    harness.reset();
  });

  it("registers a declared entity data source and serves list queries", async () => {
    // The author declares config plus pure transform/build functions. The
    // runtime keeps every entity read on its own side, so nothing about
    // entityService, DataSource, or BaseDataSourceContext has to reach the
    // public surface — those types drag the runtime across the published
    // declaration boundary and cannot be promoted.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide backed by a data source.",
      metadata: z.object({ title: z.string() }),
      dataSources: [
        defineEntityDataSource({
          id: "entities",
          name: "Guide entities",
          description: "Lists guides for templates",
          entityType: "guide",
          defaultSort: [{ field: "created", direction: "desc" }],
          transform: (entity) => ({ id: entity.id }),
          list: (items) => ({ guides: items }),
        }),
      ],
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-datasource-test"),
    });
    await harness.installPlugin(plugin);

    // Scoped by the runtime, so two packages may each declare "entities".
    const dataSource = harness.getDataSources().get("@fixture/guides:entities");
    if (!dataSource?.fetch) throw new Error("Data source was not registered");

    await harness.getEntityService().createEntity({
      entity: {
        id: "first",
        entityType: "guide",
        content: "A guide",
        metadata: { title: "First" },
      },
    });

    expect(
      await dataSource.fetch(
        {},
        z.object({ guides: z.array(z.object({ id: z.string() })) }),
        { entityService: harness.getEntityService() },
      ),
    ).toEqual({ guides: [{ id: "first" }] });

    harness.reset();
  });

  it("serves a declared data source that reads more than one entity type", async () => {
    // Not every data source is one entity type with list and detail views.
    // The general form hands the author a narrow entity reader instead of
    // the entity service, so reading across types costs nothing on the
    // public surface.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide.",
      metadata: z.object({ title: z.string() }),
    });
    const notice = defineEntity({
      type: "notice",
      purpose: "A site-wide notice.",
      metadata: z.object({ body: z.string() }),
      dataSources: [
        defineDataSource({
          id: "page",
          name: "Guide page",
          description: "Guides plus the current notice",
          fetch: async (_query, entities) => {
            const [guides, notices] = await Promise.all([
              entities.listEntities({ entityType: "guide" }),
              entities.listEntities({
                entityType: "notice",
                options: { limit: 1 },
              }),
            ]);
            return {
              guides: guides.map(({ id }) => id),
              notice: notices[0]?.id ?? null,
            };
          },
        }),
      ],
    });
    const definition = defineEntityPackage({
      id: "guides",
      entities: [guide, notice],
    });
    const plugins = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    );

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-multi-datasource-test"),
    });
    for (const plugin of plugins) await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      entity: {
        id: "first",
        entityType: "guide",
        content: "A guide",
        metadata: { title: "First" },
      },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "banner",
        entityType: "notice",
        content: "Notice",
        metadata: { body: "Hello" },
      },
    });

    const dataSource = harness.getDataSources().get("@fixture/guides:page");
    if (!dataSource?.fetch) throw new Error("Data source was not registered");

    expect(
      await dataSource.fetch(
        {},
        z.object({
          guides: z.array(z.string()),
          notice: z.string().nullable(),
        }),
        { entityService: harness.getEntityService() },
      ),
    ).toEqual({ guides: ["first"], notice: "banner" });

    harness.reset();
  });

  it("registers a declared generation handler under the entity type", async () => {
    // Eight packages override createGenerationHandler to build a JobHandler
    // from the plugin context. Declared, it is an input schema plus one
    // function over a narrowed context: AI generation and entity access,
    // with the runtime owning job registration and input validation.
    const guide = defineEntity({
      type: "guide",
      purpose: "A generated guide.",
      metadata: z.object({ title: z.string() }),
      generation: {
        input: z.object({ topic: z.string() }),
        generate: async ({ input, ai }) => {
          const generated = await ai.generate<{ title: string }>({
            prompt: `Write about ${input.topic}`,
            templateName: "guide",
          });
          return {
            success: true as const,
            content: "A guide",
            metadata: { title: generated.title },
          };
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-generation-test"),
    });
    const handlers = new Map<string, JobHandler>();
    const mockShell = harness.getMockShell();
    const jobQueue = mockShell.getJobQueueService();
    const trackingJobQueue = {
      ...jobQueue,
      registerHandler: (type: string, handler: JobHandler): void => {
        handlers.set(type, handler);
      },
    };
    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > => trackingJobQueue;

    await harness.installPlugin(plugin);

    const handler = handlers.get("guide:generation");
    if (!handler) throw new Error("Generation handler was not registered");

    // Input is validated by the declared schema, not by the author.
    expect(handler.validateAndParse({ nope: true })).toBeNull();
    expect(handler.validateAndParse({ topic: "rivers" })).toEqual({
      topic: "rivers",
    });

    harness.reset();
  });

  it("exposes declared projection rules and registers an atproto projection", async () => {
    // Some entities are derived from every other type rather than from one
    // named source, which defineProjection cannot express: it pairs a
    // single source definition with a single target. Such an entity
    // declares a projection rule instead, and the runtime surfaces it as
    // one of the plugin's capabilities.
    const rule = defineProjectionRule({
      id: "guide-projection",
      version: "1",
      sources: [{ kind: "entity", types: ["*"], excludeTypes: ["guide"] }],
      targetType: "guide",
      inputSchema: z.object({ titles: z.array(z.string()) }),
      selectInput: async () => ({ titles: [] }),
      derive: async () => [],
    });
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide derived from everything else.",
      metadata: z.object({ title: z.string() }),
      projectionRules: [rule],
      atproto: {
        entityType: "guide",
        collection: "ai.rizom.brain.series",
        lexicon: canonicalAtprotoLexicons["ai.rizom.brain.series"],
        buildRecord: async () => ({ $type: "ai.rizom.brain.series" }),
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-projection-test"),
    });
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.projectionRules?.map(({ id }) => id)).toEqual([
      "guide-projection",
    ]);
    expect(
      AtprotoProjectionRegistry.getInstance().get("guide")?.collection,
    ).toBe("ai.rizom.brain.series");

    // The runtime owns teardown, so the registry does not leak across
    // plugin lifecycles.
    await plugin.shutdown?.();
    expect(
      AtprotoProjectionRegistry.getInstance().get("guide"),
    ).toBeUndefined();

    harness.reset();
  });

  it("registers declared eval handlers with the same context generation gets", async () => {
    // Nine packages register eval handlers from onRegister. Declared, they
    // are named functions over the shared entity capability context, so
    // registration is the runtime's job rather than each package's.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide with evals.",
      metadata: z.object({ title: z.string() }),
      evals: {
        summarize: async (input, { entities }) => {
          const guides = await entities.listEntities({ entityType: "guide" });
          return { input, count: guides.length };
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-eval-test"),
    });
    const handlers = new Map<string, EvalHandler>();
    const mockShell = harness.getMockShell();
    mockShell.registerEvalHandler = (
      _pluginId: string,
      handlerId: string,
      handler: EvalHandler,
    ): void => {
      handlers.set(handlerId, handler);
    };

    await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      entity: {
        id: "first",
        entityType: "guide",
        content: "A guide",
        metadata: { title: "First" },
      },
    });

    const handler = handlers.get("summarize");
    if (!handler) throw new Error("Eval handler was not registered");
    expect(await handler({ topic: "rivers" })).toEqual({
      input: { topic: "rivers" },
      count: 1,
    });

    harness.reset();
  });

  it("lets an eval reset its own seeded fixtures without reaching entity deletion", async () => {
    // An eval that seeds and measures has to start from a known state, or
    // one run contaminates the next. Deletion is scoped to the declaring
    // entity type: resetting topics must not be able to erase notes.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide whose evals seed fixtures.",
      metadata: z.object({ title: z.string() }),
      evals: {
        countAfterReset: async (_input, { entities, fixtures }) => {
          await fixtures.reset();
          return {
            count: (await entities.listEntities({ entityType: "guide" }))
              .length,
          };
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-eval-reset-test"),
    });
    const handlers = new Map<string, EvalHandler>();
    const mockShell = harness.getMockShell();
    mockShell.registerEvalHandler = (
      _pluginId: string,
      handlerId: string,
      handler: EvalHandler,
    ): void => {
      handlers.set(handlerId, handler);
    };

    await harness.installPlugin(plugin);

    const entityService = harness.getEntityService();
    await entityService.createEntity({
      entity: {
        id: "seeded",
        entityType: "guide",
        content: "A seeded guide",
        metadata: { title: "Seeded" },
      },
    });

    const handler = handlers.get("countAfterReset");
    if (!handler) throw new Error("Eval handler was not registered");
    expect(await handler({})).toEqual({ count: 0 });

    harness.reset();
  });

  it("runs a declared projection rule from an eval, so the eval measures the live path", async () => {
    // Extraction quality is a property of the rule that actually runs. An
    // eval that drives a parallel pipeline instead measures a copy, and the
    // copy is what rots. select + derive only: waves, memoization and
    // persistence are orchestration, not the thing under measurement.
    const guideRule = defineProjectionRule({
      id: "guide-summaries",
      version: "1",
      sources: [{ kind: "entity", types: ["note"] }],
      targetType: "guide",
      inputSchema: z.object({ titles: z.array(z.string()) }),
      selectInput: async (_trigger, { entities }) => ({
        titles: (await entities.listEntities({ entityType: "note" })).map(
          ({ id }) => id,
        ),
      }),
      derive: async ({ titles }) =>
        titles.map((title) => ({
          operation: "upsert" as const,
          entity: {
            id: `guide-${title}`,
            entityType: "guide",
            content: `Guide for ${title}`,
            metadata: { title },
            visibility: "public" as const,
          },
        })),
    });
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide derived from notes.",
      metadata: z.object({ title: z.string() }),
      projectionRules: [guideRule],
      evals: {
        summarizeAll: async (_input, { runProjectionRule }) => {
          const intents = await runProjectionRule(guideRule);
          return {
            ids: intents.flatMap((intent) =>
              intent.operation === "upsert" ? [intent.entity.id] : [],
            ),
          };
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-eval-rule-test"),
    });
    const handlers = new Map<string, EvalHandler>();
    const mockShell = harness.getMockShell();
    mockShell.registerEvalHandler = (
      _pluginId: string,
      handlerId: string,
      handler: EvalHandler,
    ): void => {
      handlers.set(handlerId, handler);
    };

    await harness.installPlugin(plugin);

    await harness.getEntityService().createEntity({
      entity: {
        id: "rivers",
        entityType: "note",
        content: "About rivers",
        metadata: {},
      },
    });

    const handler = handlers.get("summarizeAll");
    if (!handler) throw new Error("Eval handler was not registered");
    expect(await handler({})).toEqual({ ids: ["guide-rivers"] });

    harness.reset();
  });

  it("reads the upload a job was handed, without the job naming a transport", async () => {
    // A job that imports an uploaded file needs the bytes. It does not need
    // to choose a filesystem namespace, a client ref kind, or an HTTP route
    // — note declared all three, including `/api/chat/uploads`, which is a
    // chat interface's route and has no bearing on which bytes come back.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide imported from an upload.",
      metadata: z.object({ title: z.string() }),
      jobs: {
        import: {
          input: z.object({ uploadId: z.string() }),
          handle: async ({
            input,
            uploads,
          }: JobHandlerContext<{ uploadId: string }>): Promise<{
            filename: string;
            body: string;
          }> => {
            const { record, content } = await uploads.read(input.uploadId);
            return { filename: record.filename, body: content.toString() };
          },
        } satisfies EntityJobDeclaration<
          z.ZodObject<{ uploadId: z.ZodString }>
        >,
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-upload-test"),
    });
    const handlers = new Map<string, JobHandler>();
    const queue = harness.getMockShell().getJobQueueService();
    stubMethod(queue, "registerHandler", (name, handler) => {
      handlers.set(name, handler);
    });
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;

    const uploaded = await harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/uploads",
      })
      .save({
        filename: "notes.md",
        mediaType: "text/markdown",
        content: Buffer.from("# Imported"),
      });

    await harness.installPlugin(plugin);

    const handler = handlers.get("@fixture/guides:guide:import");
    if (!handler) throw new Error("Import job handler was not registered");
    expect(
      await handler.process(
        { uploadId: uploaded.id },
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    ).toEqual({ filename: "notes.md", body: "# Imported" });

    harness.reset();
  });

  it("writes a placeholder and delegates the slow part in one resolution", async () => {
    // Importing an upload has to do both: return a real, deduplicated id the
    // caller can look at straight away, and hand the actual reading of the
    // file to a job. `delegate` alone enqueues without allocating anything,
    // and `create` alone finishes immediately — an import is neither.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide imported from an upload.",
      metadata: z.object({ title: z.string() }),
      jobs: {
        import: {
          input: z.object({ entityId: z.string() }),
          handle: async (): Promise<{ done: true }> => ({ done: true }),
        },
      },
      create: {
        fromUpload: {
          resolve: async ({ input }) => ({
            create: {
              id: "imported-guide",
              content: "Importing…",
              metadata: { title: input.title ?? "Untitled" },
            },
            delegate: { job: "import" },
          }),
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-import-test"),
    });
    let interceptor: CreateInterceptor | undefined;
    const registry = harness.getEntityRegistry();
    stubMethod(registry, "registerCreateInterceptor", (_type, registered) => {
      interceptor = registered;
    });

    const enqueued: { type: string; data: unknown }[] = [];
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    stubMethod(jobQueue, "enqueue", async ({ type, data }) => {
      enqueued.push({ type, data });
      return "job-1";
    });
    shell.getJobQueueService = (): typeof jobQueue => jobQueue;

    await harness.installPlugin(plugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    const outcome = await interceptor(
      {
        entityType: "guide",
        from: { kind: "upload", id: "u1" },
        title: "Notes",
      },
      executionContext,
    );

    // Reported as generating, with the id already allocated — not as
    // "created", which would claim the import had finished.
    expect(outcome).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { status: "generating", entityId: "imported-guide" },
      },
    });
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "guide", id: "imported-guide" }),
    ).not.toBeNull();
    const placeholder = await harness
      .getEntityService()
      .getEntity({ entityType: "guide", id: "imported-guide" });
    // The job is told which entity to fill in, so it never re-derives the id,
    // and what that entity looked like, so an edit made while it runs wins.
    expect(enqueued).toEqual([
      {
        type: "@fixture/guides:guide:import",
        data: {
          entityId: "imported-guide",
          expectedContentHash: placeholder?.contentHash,
        },
      },
    ]);

    harness.reset();
  });

  it("owns the lifecycle of a job that fills in an entity it allocated", async () => {
    // A job reached through an allocation is filling in an entity the caller
    // is already looking at. Declared with `generate` rather than `handle`,
    // it returns what it produced and the runtime writes it — and marks the
    // entity failed when it throws, instead of leaving it "generating"
    // forever with nobody to say otherwise.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide imported from an upload.",
      metadata: z.object({
        title: z.string(),
        status: z.string().optional(),
        error: z.string().optional(),
      }),
      stub: ({ title }) => ({
        content: `---\ntitle: ${title}\nstatus: generating\n---\n`,
        metadata: { title, status: "generating" },
      }),
      jobs: {
        import: {
          input: z.object({ entityId: z.string(), fail: z.boolean() }),
          generate: async ({ input }): Promise<EntityGenerationResult> =>
            input.fail
              ? { success: false, error: "unreadable file" }
              : {
                  success: true,
                  content: "Imported body",
                  metadata: { title: "Imported" },
                },
        } satisfies EntityGenerationJobDeclaration<
          z.ZodObject<{ entityId: z.ZodString; fail: z.ZodBoolean }>
        >,
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-generate-job-test"),
    });
    const handlers = new Map<string, JobHandler>();
    const queue = harness.getMockShell().getJobQueueService();
    stubMethod(queue, "registerHandler", (name, handler) => {
      handlers.set(name, handler);
    });
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;

    await harness.installPlugin(plugin);
    const entities = harness.getEntityService();
    const handler = handlers.get("@fixture/guides:guide:import");
    if (!handler) throw new Error("Import job handler was not registered");

    await entities.createEntity({
      entity: {
        id: "allocated",
        entityType: "guide",
        content: "---\ntitle: Pending\nstatus: generating\n---\n",
        metadata: { title: "Pending", status: "generating" },
      },
    });

    await handler.process(
      { entityId: "allocated", fail: false },
      "job-1",
      createMockProgressReporter(),
      new AbortController().signal,
    );
    expect(
      await entities.getEntity({ entityType: "guide", id: "allocated" }),
    ).toMatchObject({ metadata: { title: "Imported" } });

    await entities.createEntity({
      entity: {
        id: "doomed",
        entityType: "guide",
        content: "---\ntitle: Pending\nstatus: generating\n---\n",
        metadata: { title: "Pending", status: "generating" },
      },
    });
    await handler.process(
      { entityId: "doomed", fail: true },
      "job-2",
      createMockProgressReporter(),
      new AbortController().signal,
    );
    // Not left mid-flight: the entity says what went wrong.
    expect(
      await entities.getEntity({ entityType: "guide", id: "doomed" }),
    ).toMatchObject({
      metadata: { status: "failed", error: "unreadable file" },
    });

    harness.reset();
  });

  // An uploaded file reaches a type two ways: system_create with an upload
  // ref, and the upload endpoint routing by media type. They are the same
  // decision, so declaring the media types on the route registers both —
  // rather than a package registering a second handler that calls its own
  // create logic back, which is what document did by hand.
  it("routes an upload to the type that claims its media type", async () => {
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide promoted from an uploaded file.",
      metadata: z.object({ title: z.string() }),
      create: {
        fromUpload: {
          mediaTypes: ["application/pdf"],
          resolve: async ({ input, uploads }) => {
            const record = await uploads.readRecord(
              input.from?.kind === "upload" ? input.from.id : "",
            );
            return {
              create: {
                id: "promoted-guide",
                content: `Promoted ${record.filename}`,
                metadata: { title: record.filename },
              },
              // Built from the entity the runtime wrote, because dedup can
              // change the id the route proposed.
              attachment: ({ entityId }): CreateResultAttachment => ({
                mediaType: record.mediaType,
                url: `/attachments/guide?id=${entityId}`,
                filename: record.filename,
              }),
            };
          },
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-upload-route-test"),
    });
    let registration: UploadSaveHandlerRegistration | undefined;
    const registry = harness.getEntityRegistry();
    stubMethod(registry, "registerUploadSaveHandler", (input) => {
      registration = input;
    });

    const uploaded = await harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/uploads",
      })
      .save({
        filename: "handbook.pdf",
        mediaType: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      });

    await harness.installPlugin(plugin);

    // Declared once, registered for the endpoint that routes by media type.
    expect(registration).toMatchObject({
      entityType: "guide",
      mediaTypes: ["application/pdf"],
    });

    const result = await registration?.handler(
      { upload: { kind: "upload", id: uploaded.id } },
      executionContext,
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        entityId: "promoted-guide",
        status: "created",
        attachment: {
          mediaType: "application/pdf",
          url: "/attachments/guide?id=promoted-guide",
          filename: "handbook.pdf",
        },
      },
    });

    harness.reset();
  });

  it("registers declared jobs and surfaces declared instructions", async () => {
    // Generation is just a job the runtime names for you, so both go
    // through the same declaration shape and the same validated handler.
    const reported: number[] = [];
    const reindexJob: EntityJobDeclaration<
      z.ZodObject<{ guideId: z.ZodString }>
    > = {
      input: z.object({ guideId: z.string() }),
      // Five packages report progress from job handlers. A declarative job
      // that could not would silently drop it on conversion.
      handle: async ({ input, progress }) => {
        await progress.report({ progress: 50, message: "halfway" });
        reported.push(50);
        return { reindexed: input.guideId };
      },
    };
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide with a job.",
      metadata: z.object({ title: z.string() }),
      instructions: "Reach for a guide when the user wants a walkthrough.",
      jobs: { "guide:reindex": reindexJob },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-jobs-test"),
    });
    const handlers = new Map<string, JobHandler>();
    const mockShell = harness.getMockShell();
    const jobQueue = mockShell.getJobQueueService();
    const trackingJobQueue = {
      ...jobQueue,
      registerHandler: (type: string, handler: JobHandler): void => {
        handlers.set(type, handler);
      },
    };
    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > => trackingJobQueue;

    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.instructions).toBe(
      "Reach for a guide when the user wants a walkthrough.",
    );

    const handler = handlers.get("guide:reindex");
    if (!handler) throw new Error("Job handler was not registered");
    expect(handler.validateAndParse({ nope: true })).toBeNull();
    expect(
      await handler.process(
        { guideId: "first" },
        "job-1",
        { report: async (): Promise<void> => {} } as never,
        new AbortController().signal,
      ),
    ).toEqual({ reindexed: "first" });
    expect(reported).toEqual([50]);

    harness.reset();
  });

  // Some creates finish immediately rather than becoming a job: a wish
  // deduplicates against what exists and either raises a count or starts a
  // new one, and the caller wants to know which. `resolve` keeps the
  // runtime's guarantee intact by returning what should be written rather
  // than writing it — the same split `generation` makes.
  describe("a create that resolves rather than delegates", () => {
    function guideThatResolves(): ReturnType<typeof defineEntity> {
      return defineEntity({
        type: "guide",
        purpose: "A guide deduplicated on title.",
        metadata: z.object({ title: z.string(), requested: z.number() }),
        create: {
          fromPrompt: {
            resolve: async ({ input, entities }) => {
              const existing = await entities.listEntities({
                entityType: "guide",
              });
              const match = existing.find(
                (guide) => guide.metadata["title"] === input.prompt,
              );
              if (match) {
                const requested = Number(match.metadata["requested"] ?? 0) + 1;
                return {
                  update: {
                    id: match.id,
                    content: match.content,
                    metadata: { title: String(input.prompt), requested },
                  },
                };
              }
              return {
                create: {
                  id: "new-guide",
                  content: "A guide",
                  metadata: { title: String(input.prompt), requested: 1 },
                },
              };
            },
          },
        },
      });
    }

    async function install(): Promise<{
      harness: ReturnType<typeof createPluginHarness>;
      route: (input: CreateInput) => Promise<CreateInterceptionResult>;
    }> {
      const definition = defineEntityPackage({
        id: "guides",
        entities: [guideThatResolves()],
      });
      const plugin = createEntityPackagePlugins(
        definition.entities,
        definition.projections,
        { name: "@fixture/guides", version: "0.1.0" },
        (id) => `@fixture/guides:${id}`,
      )[0];
      if (!plugin) throw new Error("Guide entity plugin was not created");

      const harness = createPluginHarness({
        logger: createSilentLogger("entity-create-resolve-test"),
      });
      let interceptor:
        | ((
            input: CreateInput,
            executionContext: CreateExecutionContext,
          ) => Promise<CreateInterceptionResult>)
        | undefined;
      const registry = harness.getEntityRegistry();
      registry.registerCreateInterceptor = (
        _entityType: string,
        registered: typeof interceptor,
      ): void => {
        interceptor = registered;
      };
      await harness.installPlugin(plugin);
      if (!interceptor)
        throw new Error("Create interceptor was not registered");
      const route = interceptor;
      return {
        harness,
        route: (input) =>
          route(input, {
            interfaceType: "test",
            actor: { kind: "user", userId: "tester" },
          }),
      };
    }

    it("creates when nothing matches, and says so", async () => {
      const { harness, route } = await install();

      const result = await route({ entityType: "guide", prompt: "Fishing" });

      expect(result).toMatchObject({
        kind: "handled",
        result: { success: true, data: { status: "created" } },
      });
      const stored = await harness
        .getEntityService()
        .getEntity({ entityType: "guide", id: "new-guide" });
      expect(stored?.metadata["title"]).toBe("Fishing");

      harness.reset();
    });

    it("updates when something matches, and says that instead", async () => {
      const { harness, route } = await install();
      await harness.getEntityService().createEntity({
        entity: {
          id: "existing",
          entityType: "guide",
          content: "A guide",
          metadata: { title: "Fishing", requested: 1 },
        },
      });

      const result = await route({ entityType: "guide", prompt: "Fishing" });

      expect(result).toMatchObject({
        kind: "handled",
        result: { success: true, data: { status: "updated" } },
      });
      const stored = await harness
        .getEntityService()
        .getEntity({ entityType: "guide", id: "existing" });
      expect(stored?.metadata["requested"]).toBe(2);

      harness.reset();
    });

    it("refuses with the message the route gave", async () => {
      const guide = defineEntity({
        type: "guide",
        purpose: "A guide that refuses.",
        metadata: z.object({ title: z.string() }),
        create: {
          fromPrompt: {
            resolve: async () => ({ refuse: "Not while the moon is full." }),
          },
        },
      });
      const definition = defineEntityPackage({
        id: "guides",
        entities: [guide],
      });
      const plugin = createEntityPackagePlugins(
        definition.entities,
        definition.projections,
        { name: "@fixture/guides", version: "0.1.0" },
        (id) => `@fixture/guides:${id}`,
      )[0];
      if (!plugin) throw new Error("Guide entity plugin was not created");
      const harness = createPluginHarness({
        logger: createSilentLogger("entity-create-refuse-test"),
      });
      let interceptor:
        | ((
            input: CreateInput,
            executionContext: CreateExecutionContext,
          ) => Promise<CreateInterceptionResult>)
        | undefined;
      const registry = harness.getEntityRegistry();
      registry.registerCreateInterceptor = (
        _entityType: string,
        registered: typeof interceptor,
      ): void => {
        interceptor = registered;
      };
      await harness.installPlugin(plugin);
      if (!interceptor)
        throw new Error("Create interceptor was not registered");

      expect(
        await interceptor(
          { entityType: "guide", prompt: "Fishing" },
          { interfaceType: "test", actor: { kind: "user", userId: "tester" } },
        ),
      ).toMatchObject({
        kind: "handled",
        result: { success: false, error: "Not while the moon is full." },
      });

      harness.reset();
    });
  });

  // Four entity packages subscribe to pluginsRegistered to do exactly one
  // thing: register a dashboard widget. That is not a messaging need, it is
  // waiting for a hook to announce a static fact — category A of the
  // blocker audit.
  it("registers declared dashboard widgets once the host is mounted", async () => {
    const guideWidget = defineDashboardWidget({
      id: "top-guides",
      title: "Top Guides",
      group: "knowledge",
      placement: "secondary",
      priority: 30,
      permission: "public",
      data: z.object({ titles: z.array(z.string()) }),
      digest: ({ data }) => ({
        items: [{ label: "Guides", value: String(data.titles.length) }],
      }),
      view: ({ data }) => ({
        blocks: [
          {
            type: "list",
            id: "guides",
            empty: "No guides yet.",
            items: data.titles.map((title) => ({ id: title, title })),
          },
        ],
      }),
    });
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide with a dashboard widget.",
      metadata: z.object({ title: z.string() }),
      dashboardWidgets: [
        defineEntityDashboardWidget(guideWidget, async ({ entities }) => {
          const guides = await entities.listEntities({ entityType: "guide" });
          return {
            titles: guides.map((entity) => String(entity.metadata["title"])),
          };
        }),
      ],
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-widget-test"),
    });
    await harness.installPlugin(plugin);
    await harness.getEntityService().createEntity({
      entity: {
        id: "first",
        entityType: "guide",
        content: "A guide",
        metadata: { title: "First" },
      },
    });

    const registered: string[] = [];
    harness.subscribe<{ id?: string }>(
      DASHBOARD_CHANNELS.registerWidget,
      async (message) => {
        if (message.payload.id) registered.push(message.payload.id);
        return { success: true };
      },
    );

    // Nothing is announced until the Dashboard host has mounted.
    expect(registered).toEqual([]);

    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});

    expect(registered).toEqual(["top-guides"]);

    harness.reset();
  });

  it("routes create by input shape and reports the outcome itself", async () => {
    // Deliberately data rather than a callback. A create callback is
    // arbitrary code whose reported outcome the runtime has to take on
    // trust — a package could claim it created something it did not.
    // Routing lets the runtime enqueue and report, so the outcome
    // describes what actually happened.
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide that can be generated.",
      metadata: z.object({ title: z.string() }),
      create: {
        fromPrompt: { delegate: "guide:generation" },
        fromContent: { reject: "Guides are generated, not pasted." },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-create-routing-test"),
    });
    let interceptor:
      | ((
          input: CreateInput,
          executionContext: CreateExecutionContext,
        ) => Promise<CreateInterceptionResult>)
      | undefined;
    const registry = harness.getEntityRegistry();
    registry.registerCreateInterceptor = (
      _entityType: string,
      registered: typeof interceptor,
    ): void => {
      interceptor = registered;
    };

    await harness.installPlugin(plugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    // A shape with no declared route is left to ordinary creation.
    expect(
      await interceptor(
        { entityType: "guide", title: "Plain" },
        executionContext,
      ),
    ).toMatchObject({ kind: "continue" });

    expect(
      await interceptor(
        { entityType: "guide", content: "# Pasted" },
        executionContext,
      ),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Guides are generated, not pasted.",
      },
    });

    const delegated = await interceptor(
      { entityType: "guide", prompt: "rivers" },
      executionContext,
    );
    if (delegated.kind !== "handled" || !delegated.result.success) {
      throw new Error("Prompt create should delegate to the declared job");
    }
    // The runtime supplies the job id; the package never names an outcome.
    expect(delegated.result.data.status).toBe("generating");
    expect(delegated.result.data.jobId).toBeTruthy();

    harness.reset();
  });

  it("registers a declared publish provider once the pipeline is listening", async () => {
    // The four publishing packages each deferred this to plugins-registered
    // by hand, so the publish pipeline had subscribed before they announced
    // themselves. That ordering is the runtime's problem, not an author's.
    const provider = {
      name: "internal",
      publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
    };
    const guide = defineEntity({
      type: "guide",
      purpose: "A publishable guide.",
      metadata: z.object({ title: z.string() }),
      publish: { provider, resultIdField: "platformGuideId" },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-publish-test"),
    });
    const registered: unknown[] = [];
    harness.subscribe("publish:register", async (msg) => {
      registered.push(msg.payload);
      return { success: true };
    });

    await harness.installPlugin(plugin);
    // Nothing is announced until the pipeline has had its chance to subscribe.
    expect(registered).toHaveLength(0);

    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});

    expect(registered).toEqual([
      {
        entityType: "guide",
        provider,
        config: { publishResultIdField: "platformGuideId" },
      },
    ]);

    harness.reset();
  });

  it("registers declared attachment providers and releases them on shutdown", async () => {
    // Attachment providers are the last thing keeping several entity
    // packages on an onRegister hook. The author declares the attachment
    // type and a factory; the runtime owns registration and teardown, so
    // no package has to hold its own unregister handles.
    const resolved = {
      type: "document" as const,
      data: Buffer.from("pdf bytes"),
      mimeType: "application/pdf" as const,
      filename: "guide.pdf",
    };
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide with a printable artifact.",
      metadata: z.object({ title: z.string() }),
      attachments: [
        {
          type: "printable",
          provider: (): AttachmentProvider => ({
            resolve: (): PublishMediaData => resolved,
          }),
        },
      ],
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-attachment-test"),
    });
    await harness.installPlugin(plugin);

    const attachments = harness.getAttachments();
    expect(attachments.hasProvider("guide", "printable")).toBe(true);
    expect(
      await attachments.resolve({
        sourceEntityType: "guide",
        sourceEntityId: "first",
        attachmentType: "printable",
      }),
    ).toEqual(resolved);

    await plugin.shutdown?.();
    expect(attachments.hasProvider("guide", "printable")).toBe(false);

    harness.reset();
  });

  it("registers declared entity-type config with the entity registry", async () => {
    // System-configuration entity types opt out of search embeddings and
    // projection sourcing. Without a declarative slot for this, the
    // surface silently takes the embeddable/projectionSource defaults of
    // true, which would start embedding configuration as user content.
    const setting = defineEntity({
      type: "setting",
      purpose: "System configuration, not user content.",
      metadata: z.object({ target: z.string() }),
      config: {
        embeddable: false,
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
    });
    const definition = defineEntityPackage({
      id: "settings",
      entities: [setting],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/settings", version: "0.1.0" },
      (id) => `@fixture/settings:${id}`,
    )[0];
    if (!plugin) throw new Error("Setting entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-config-test"),
    });
    await harness.installPlugin(plugin);

    expect(
      harness.getEntityService().getEntityTypeConfig("setting"),
    ).toMatchObject({
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("registers no entity-type overrides when config is not declared", async () => {
    const plain = defineEntity({
      type: "plain",
      purpose: "An ordinary entity that takes the defaults.",
      metadata: z.object({ title: z.string() }),
    });
    const definition = defineEntityPackage({
      id: "plain-pkg",
      entities: [plain],
    });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/plain", version: "0.1.0" },
      (id) => `@fixture/plain:${id}`,
    )[0];
    if (!plugin) throw new Error("Plain entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-config-default-test"),
    });
    await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypeConfig("plain")).toEqual({});

    harness.reset();
  });
});

describe("declarative entity seeding", () => {
  const seeded = defineEntity({
    type: "house-style",
    purpose: "A singleton the brain needs present even before anyone edits it.",
    metadata: z.object({}),
    seed: {
      on: "content-sync-completed",
      id: "house-style",
      content: () => "# House style\n\nWrite plainly.",
    },
  });

  async function installSeeded(): Promise<
    ReturnType<typeof createPluginHarness>
  > {
    const plugin = createEntityPackagePlugins(
      [seeded],
      [],
      { name: "@fixture/house-style", version: "0.1.0" },
      (id) => `@fixture/house-style:${id}`,
    )[0];
    if (!plugin) throw new Error("Seeded entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("seed-test"),
    });
    await harness.installPlugin(plugin);
    return harness;
  }

  async function readSeed(
    harness: ReturnType<typeof createPluginHarness>,
  ): Promise<unknown> {
    return harness.getEntityService().getEntity({
      entityType: "house-style",
      id: "house-style",
    });
  }

  it("does not create the entity before the signal fires", async () => {
    const harness = await installSeeded();
    expect(await readSeed(harness)).toBeNull();
    harness.reset();
  });

  it("creates the entity when the signal fires", async () => {
    const harness = await installSeeded();
    await harness.sendMessage("sync:initial:completed", {});

    const entity = await readSeed(harness);
    expect(entity).toMatchObject({
      id: "house-style",
      entityType: "house-style",
    });
    expect((entity as { content: string }).content).toContain("Write plainly.");

    harness.reset();
  });

  it("leaves an existing entity untouched", async () => {
    const harness = await installSeeded();
    await harness.getEntityService().createEntity({
      entity: {
        id: "house-style",
        entityType: "house-style",
        content: "# House style\n\nAuthored by a human.",
        metadata: {},
      },
    });

    await harness.sendMessage("sync:initial:completed", {});

    const entity = await readSeed(harness);
    expect((entity as { content: string }).content).toContain(
      "Authored by a human.",
    );

    harness.reset();
  });

  it("is inert for entities that declare no seed", async () => {
    const plain = defineEntity({
      type: "unseeded",
      purpose: "No seed declared.",
      metadata: z.object({}),
    });
    const plugin = createEntityPackagePlugins(
      [plain],
      [],
      { name: "@fixture/unseeded", version: "0.1.0" },
      (id) => `@fixture/unseeded:${id}`,
    )[0];
    if (!plugin) throw new Error("Unseeded entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("seed-inert-test"),
    });
    await harness.installPlugin(plugin);

    await harness.sendMessage("sync:initial:completed", {});
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "unseeded", id: "unseeded" }),
    ).toBeNull();

    harness.reset();
  });

  // Registering an insight was a namespace call announcing a static fact:
  // an id and a function over entity reads. Declared, the runtime owns
  // registration and the package never names the insights namespace.
  it("registers declared insights, reading through the scoped entity access", async () => {
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide.",
      metadata: z.object({ title: z.string() }),
      insights: {
        "guide-distribution": async ({ entities, visibilityScope }) => {
          const guides = await entities.listEntities({
            entityType: "guide",
            options: { filter: { visibilityScope } },
          });
          return { guides: guides.map(({ id }) => id) };
        },
      },
    });
    const definition = defineEntityPackage({ id: "guides", entities: [guide] });
    const plugin = createEntityPackagePlugins(
      definition.entities,
      definition.projections,
      { name: "@fixture/guides", version: "0.1.0" },
      (id) => `@fixture/guides:${id}`,
    )[0];
    if (!plugin) throw new Error("Guide entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("entity-insights-test"),
    });
    await harness.installPlugin(plugin);
    await harness.getEntityService().createEntity({
      entity: {
        id: "first",
        entityType: "guide",
        content: "A guide",
        metadata: { title: "First" },
      },
    });

    const registry = harness.getMockShell().getInsightsRegistry();
    expect(registry.getTypes()).toContain("guide-distribution");
    expect(
      await registry.get(
        "guide-distribution",
        harness.getEntityService(),
        "public",
      ),
    ).toEqual({ guides: ["first"] });

    harness.reset();
  });

  // system_generate persists a placeholder before enqueueing so the caller
  // has something to look at, and refuses outright when the adapter cannot
  // build one. The generated adapter had no buildStub, so converting a
  // package silently took system_generate away from it.
  describe("the placeholder a queued generation starts from", () => {
    function guideWithStub(withStub: boolean): ReturnType<typeof defineEntity> {
      return defineEntity({
        type: "guide",
        purpose: "A generated guide.",
        metadata: z.object({
          title: z.string(),
          slug: z.string(),
          status: z.string(),
        }),
        ...(withStub
          ? {
              stub: ({ id, title }: { id: string; title: string }) => ({
                content: `---\ntitle: ${title}\nstatus: generating\n---\n`,
                metadata: { title, slug: id, status: "generating" },
              }),
            }
          : {}),
      });
    }

    function pluginFor(withStub: boolean): {
      adapter: { buildStub?: unknown };
    } {
      const definition = defineEntityPackage({
        id: "guides",
        entities: [guideWithStub(withStub)],
      });
      const plugin = createEntityPackagePlugins(
        definition.entities,
        definition.projections,
        { name: "@fixture/guides", version: "0.1.0" },
        (id) => `@fixture/guides:${id}`,
      )[0];
      if (!plugin) throw new Error("Guide entity plugin was not created");
      return plugin;
    }

    it("builds one from what the entity declares", () => {
      const { adapter } = pluginFor(true);
      const buildStub = adapter.buildStub;
      if (typeof buildStub !== "function") {
        throw new Error("Expected the adapter to build a stub");
      }

      expect(buildStub({ id: "how-to-fish", title: "How To Fish" })).toEqual({
        content: expect.stringContaining("status: generating"),
        metadata: {
          title: "How To Fish",
          slug: "how-to-fish",
          status: "generating",
        },
      });
    });

    // The refusal is still right for a type that genuinely has no placeholder.
    it("offers none when the entity declares none", () => {
      expect(pluginFor(false).adapter.buildStub).toBeUndefined();
    });
  });

  // The lifecycle around generation — allocate the entity, mark it
  // generating, persist the result, mark it failed on error — used to live in
  // BaseGenerationJobHandler. Converting packages to `generation` kept the
  // content logic and dropped the lifecycle, because each handler called
  // entities.create itself. So the declaration returns content and the
  // runtime owns everything around it.
  describe("the lifecycle around a generation", () => {
    function guideThatGenerates(
      outcome:
        | {
            readonly success: true;
            readonly title: string;
            readonly id?: string;
          }
        | { readonly success: false; readonly error: string },
    ): ReturnType<typeof defineEntity> {
      return defineEntity({
        type: "guide",
        purpose: "A generated guide.",
        metadata: z.object({
          title: z.string(),
          status: z.string().optional(),
        }),
        generation: {
          input: z.object({
            entityId: z.string().optional(),
            topic: z.string(),
          }),
          generate: async () =>
            outcome.success
              ? {
                  success: true as const,
                  content: "The guide body",
                  metadata: { title: outcome.title },
                  ...(outcome.id === undefined ? {} : { id: outcome.id }),
                }
              : { success: false as const, error: outcome.error },
        },
      });
    }

    async function installGenerating(
      outcome: Parameters<typeof guideThatGenerates>[0],
    ): Promise<{
      harness: ReturnType<typeof createPluginHarness>;
      run: (input: object) => Promise<unknown>;
    }> {
      const definition = defineEntityPackage({
        id: "guides",
        entities: [guideThatGenerates(outcome)],
      });
      const plugin = createEntityPackagePlugins(
        definition.entities,
        definition.projections,
        { name: "@fixture/guides", version: "0.1.0" },
        (id) => `@fixture/guides:${id}`,
      )[0];
      if (!plugin) throw new Error("Guide entity plugin was not created");

      const harness = createPluginHarness({
        logger: createSilentLogger("entity-generation-lifecycle-test"),
      });
      const handlers = new Map<string, JobHandler>();
      const mockShell = harness.getMockShell();
      const jobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...jobQueue,
        registerHandler: (type: string, handler: JobHandler): void => {
          handlers.set(type, handler);
        },
      };
      mockShell.getJobQueueService = (): ReturnType<
        typeof mockShell.getJobQueueService
      > => trackingJobQueue;

      await harness.installPlugin(plugin);
      const handler = handlers.get("guide:generation");
      if (!handler) throw new Error("Generation handler was not registered");

      return {
        harness,
        run: (input) =>
          handler.process(
            input,
            "job-1",
            createMockProgressReporter(),
            new AbortController().signal,
          ) as Promise<unknown>,
      };
    }

    it("persists what the handler returned, so the handler never writes", async () => {
      const { harness, run } = await installGenerating({
        success: true,
        title: "How To Fish",
      });

      const result = await run({ topic: "fishing" });

      expect(result).toMatchObject({ success: true, entityId: "how-to-fish" });
      const stored = await harness
        .getEntityService()
        .getEntity({ entityType: "guide", id: "how-to-fish" });
      expect(stored?.content).toContain("The guide body");
      expect(stored?.metadata["title"]).toBe("How To Fish");
    });

    // system_generate persists a stub so the caller has something to look at
    // while the work runs, then passes its id. Filling that stub in is what
    // the converted packages stopped doing.
    // Entity ids are user-visible — directory sync names files after them —
    // so a package that wants a readable one says so instead of taking the
    // slugified title.
    it("stores under the id the handler asked for", async () => {
      const { harness, run } = await installGenerating({
        success: true,
        title: "How To Fish",
        id: "How To Fish",
      });

      const result = await run({ topic: "fishing" });

      expect(result).toMatchObject({ success: true, entityId: "How To Fish" });
      expect(
        await harness
          .getEntityService()
          .getEntity({ entityType: "guide", id: "How To Fish" }),
      ).not.toBeNull();
    });

    it("fills in a pre-allocated entity rather than creating a second one", async () => {
      const { harness, run } = await installGenerating({
        success: true,
        title: "How To Fish",
      });
      await harness.getEntityService().createEntity({
        entity: {
          id: "fishing-stub",
          entityType: "guide",
          content: "",
          metadata: { title: "fishing", status: "generating" },
        },
      });

      const result = await run({ entityId: "fishing-stub", topic: "fishing" });

      expect(result).toMatchObject({ success: true, entityId: "fishing-stub" });
      const stored = await harness
        .getEntityService()
        .getEntity({ entityType: "guide", id: "fishing-stub" });
      expect(stored?.content).toContain("The guide body");
      expect(stored?.metadata["status"]).toBeUndefined();
      // No second entity under the generated title.
      expect(
        await harness
          .getEntityService()
          .getEntity({ entityType: "guide", id: "how-to-fish" }),
      ).toBeNull();
    });

    it("marks a pre-allocated entity failed rather than leaving it generating", async () => {
      const { harness, run } = await installGenerating({
        success: false,
        error: "No sources to write from",
      });
      await harness.getEntityService().createEntity({
        entity: {
          id: "fishing-stub",
          entityType: "guide",
          content: "",
          metadata: { title: "fishing", status: "generating" },
        },
      });

      const result = await run({ entityId: "fishing-stub", topic: "fishing" });

      expect(result).toEqual({
        success: false,
        error: "No sources to write from",
      });
      const stored = await harness
        .getEntityService()
        .getEntity({ entityType: "guide", id: "fishing-stub" });
      expect(stored?.metadata["status"]).toBe("failed");
      expect(stored?.metadata["error"]).toBe("No sources to write from");
    });

    it("creates nothing when generation fails with nothing pre-allocated", async () => {
      const { harness, run } = await installGenerating({
        success: false,
        error: "No sources to write from",
      });

      expect(await run({ topic: "fishing" })).toEqual({
        success: false,
        error: "No sources to write from",
      });
      expect(
        await harness.getEntityService().listEntities({ entityType: "guide" }),
      ).toEqual([]);
    });
  });

  // Two packages hand-rolled the same generate:execute subscriber: filter on
  // your own type, list recent published sources, enqueue your generation
  // job, report a failure when there is nothing to write from. What differed
  // was only which sources and how many per job — so that is what is declared.
  describe("generation on a schedule", () => {
    function guideDerivedFrom(
      mode: "each" | "batch",
    ): ReturnType<typeof defineEntity> {
      return defineEntity({
        type: "guide",
        purpose: "A guide written from published notes.",
        metadata: z.object({ title: z.string() }),
        generation: {
          input: z.object({
            sourceEntityType: z.string().optional(),
            sourceEntityId: z.string().optional(),
            sourceEntityIds: z.array(z.string()).optional(),
          }),
          generate: async () => ({
            success: true as const,
            content: "A guide",
            metadata: { title: "A guide" },
          }),
        },
        scheduledGeneration: {
          from: { entityType: "note", status: "published", limit: 5 },
          mode,
        },
      });
    }

    async function installScheduled(mode: "each" | "batch"): Promise<{
      harness: ReturnType<typeof createPluginHarness>;
      enqueued: Array<{ type: string; data: unknown }>;
      failures: unknown[];
      run: (input: object) => Promise<unknown>;
    }> {
      const definition = defineEntityPackage({
        id: "guides",
        entities: [guideDerivedFrom(mode)],
      });
      const plugin = createEntityPackagePlugins(
        definition.entities,
        definition.projections,
        { name: "@fixture/guides", version: "0.1.0" },
        (id) => `@fixture/guides:${id}`,
      )[0];
      if (!plugin) throw new Error("Guide entity plugin was not created");

      const harness = createPluginHarness({
        logger: createSilentLogger("entity-scheduled-generation-test"),
      });
      const enqueued: Array<{ type: string; data: unknown }> = [];
      const handlers = new Map<string, JobHandler>();
      const mockShell = harness.getMockShell();
      const jobQueue = mockShell.getJobQueueService();
      const trackingJobQueue = {
        ...jobQueue,
        registerHandler: (type: string, handler: JobHandler): void => {
          handlers.set(type, handler);
        },
        enqueue: async ({
          type,
          data,
        }: {
          type: string;
          data: unknown;
        }): Promise<string> => {
          enqueued.push({ type, data });
          return "job-1";
        },
      };
      mockShell.getJobQueueService = (): ReturnType<
        typeof mockShell.getJobQueueService
      > => trackingJobQueue;

      const failures: unknown[] = [];
      harness.subscribe("generate:report:failure", async (msg) => {
        failures.push(msg.payload);
        return { success: true };
      });

      await harness.installPlugin(plugin);
      return {
        harness,
        enqueued,
        failures,
        run: (input): Promise<unknown> => {
          const handler = handlers.get("guide:generation");
          if (!handler)
            throw new Error("Generation handler was not registered");
          return handler.process(
            input,
            "job-1",
            createMockProgressReporter(),
            new AbortController().signal,
          ) as Promise<unknown>;
        },
      };
    }

    async function seedNote(
      harness: ReturnType<typeof createPluginHarness>,
      id: string,
      status: string,
    ): Promise<void> {
      await harness.getEntityService().createEntity({
        entity: {
          id,
          entityType: "note",
          content: `Note ${id}`,
          metadata: { title: id, status },
        },
      });
    }

    it("writes from the first source nothing has been derived from yet", async () => {
      const { harness, enqueued } = await installScheduled("each");
      await seedNote(harness, "note-1", "published");
      await seedNote(harness, "note-2", "published");
      // note-1 already has a guide, so the next request takes note-2.
      await harness.getEntityService().createEntity({
        entity: {
          id: "guide-1",
          entityType: "guide",
          content: "A guide",
          metadata: {
            title: "From note-1",
            sourceEntityType: "note",
            sourceEntityId: "note-1",
          },
        },
      });

      await harness.sendMessage("generate:execute", { entityType: "guide" });

      expect(enqueued).toEqual([
        {
          type: "guide:generation",
          data: { sourceEntityType: "note", sourceEntityId: "note-2" },
        },
      ]);

      harness.reset();
    });

    it("writes from every source at once in batch mode", async () => {
      const { harness, enqueued } = await installScheduled("batch");
      await seedNote(harness, "note-1", "published");
      await seedNote(harness, "note-2", "published");

      await harness.sendMessage("generate:execute", { entityType: "guide" });

      expect(enqueued).toEqual([
        {
          type: "guide:generation",
          data: {
            sourceEntityType: "note",
            sourceEntityIds: ["note-1", "note-2"],
          },
        },
      ]);

      harness.reset();
    });

    it("reports a failure rather than writing from nothing", async () => {
      const { harness, enqueued, failures } = await installScheduled("each");
      // Present but unpublished, so not a source.
      await seedNote(harness, "note-1", "draft");

      await harness.sendMessage("generate:execute", { entityType: "guide" });

      expect(enqueued).toEqual([]);
      expect(failures).toEqual([
        {
          entityType: "guide",
          error: "No published note available to write a guide from",
        },
      ]);

      harness.reset();
    });

    // The scheduler tracks what it asked for by entity id, which a
    // declaration cannot report: it hands back content and the runtime
    // decides the id. So the runtime closes the loop it opened.
    it("tells the scheduler how a generation it asked for turned out", async () => {
      const { harness, enqueued, run } = await installScheduled("each");
      await seedNote(harness, "note-1", "published");
      const completed: unknown[] = [];
      harness.subscribe("generate:report:success", async (msg) => {
        completed.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage("generate:execute", { entityType: "guide" });
      expect(enqueued).toHaveLength(1);

      await run({ sourceEntityType: "note", sourceEntityId: "note-1" });

      expect(completed).toEqual([{ entityType: "guide", entityId: "a-guide" }]);

      harness.reset();
    });

    it("ignores a request for some other entity type", async () => {
      const { harness, enqueued, failures } = await installScheduled("each");
      await seedNote(harness, "note-1", "published");

      await harness.sendMessage("generate:execute", { entityType: "recipe" });

      expect(enqueued).toEqual([]);
      expect(failures).toEqual([]);

      harness.reset();
    });
  });
});
