import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import {
  createTestDatabase,
  createSilentLogger,
  createMockProgressReporter,
  type TestDatabase,
} from "@brains/test-utils";
import {
  baseEntitySchema,
  EntityRegistry,
  EntityService,
  InMemoryDataSourceRegistry,
  MAX_SEARCH_QUERY_CHARS,
  type ContentVisibility,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createTestEntityAdapter } from "@brains/entity-service/test";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createMockAIService } from "@brains/ai-service/test";
import { PermissionService, InMemoryTemplateRegistry } from "@brains/templates";
import {
  ContentService,
  ContentGenerationJobHandler,
  GenerationAuthorizer,
  GenerationLimitError,
  type ContentGenerationTargetInput,
} from "@brains/content-service";
import { resetPromptCache } from "@brains/plugins";
import { AIContentDataSource } from "../src/datasources/ai-content-datasource";

// Real SQLite entity reads/FTS/persistence; only the external AI provider is mocked.
describe("scoped durable content generation", () => {
  const logger = createSilentLogger();
  let database: TestDatabase;
  let entities: EntityService;
  let service: ContentService;
  let datasource: AIContentDataSource;
  let permissions: PermissionService;
  let templates: InMemoryTemplateRegistry;
  let ai: ReturnType<typeof createMockAIService>;
  const ambientIdentity = mock(() => "AMBIENT_INTERNAL_IDENTITY");
  const ambientProfile = mock(() => "AMBIENT_INTERNAL_PROFILE");

  beforeEach(async () => {
    resetPromptCache();
    ambientIdentity.mockClear();
    ambientProfile.mockClear();
    database = await createTestDatabase({
      prefix: "scoped-generation-",
      filename: "entities.db",
      migrate: (url) => migrateEntities({ url }, logger),
    });
    const registry = EntityRegistry.createFresh(logger);
    for (const type of [
      "book-section",
      "note",
      "prompt",
      "brain-character",
      "anchor-profile",
    ]) {
      registry.registerEntityType(
        type,
        baseEntitySchema,
        createTestEntityAdapter(type),
      );
    }
    entities = EntityService.createFresh({
      dbConfig: { url: database.url },
      embeddingDbConfig: { url: `file:${join(database.dir, "embeddings.db")}` },
      entityRegistry: registry,
      logger,
      jobQueueService: createMockJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: {
        dimensions: 3,
        generateEmbedding: async () => {
          throw new Error("Embeddings disabled");
        },
        generateEmbeddings: async () => {
          throw new Error("Embeddings disabled");
        },
      },
    });
    ai = createMockAIService({
      returns: { generateObject: "Generated chapter" },
    });
    templates = InMemoryTemplateRegistry.createFresh(logger);
    templates.register("books:chapter", {
      name: "books:chapter",
      description: "Chapter",
      schema: z.string(),
      basePrompt: "orchard",
      requiredPermission: "trusted",
      dataSourceId: "shell:ai-content",
      useKnowledgeContext: true,
      formatter: {
        format: (value) => z.string().parse(value),
        parse: (value) => value,
      },
    });
    datasource = new AIContentDataSource(
      ai,
      entities,
      templates,
      ambientIdentity,
      ambientProfile,
    );
    const sources = InMemoryDataSourceRegistry.createFresh(logger);
    sources.register(datasource);
    permissions = new PermissionService({ admins: ["service:books"] });
    service = new ContentService({
      logger,
      entityService: entities,
      aiService: ai,
      templateRegistry: templates,
      dataSourceRegistry: sources,
      generationAuthorizer: new GenerationAuthorizer(
        permissions,
        async () => null,
      ),
    });
    for (const [id, content, visibility] of [
      ["public", "orchard PUBLIC_KNOWLEDGE", "public"],
      ["shared", "orchard SHARED_KNOWLEDGE", "shared"],
      ["restricted", "orchard PRIVATE_KNOWLEDGE", "restricted"],
    ] as const) {
      await entities.createEntity({
        entity: { id, entityType: "note", metadata: {}, content, visibility },
      });
    }
    await entities.createEntity({
      entity: {
        id: "brain-character",
        entityType: "brain-character",
        metadata: {},
        content: "PUBLIC_IDENTITY",
        visibility: "public",
      },
    });
    await entities.createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        metadata: {},
        content: "PRIVATE_ANCHOR",
        visibility: "restricted",
      },
    });
  });

  afterEach(async () => {
    resetPromptCache();
    entities.close();
    await database.cleanup();
  });

  async function generate(
    visibility: ContentVisibility,
    id = "chapter",
    context?: ContentGenerationTargetInput["context"],
  ): Promise<void> {
    const plan = await service.planGeneration({
      caller: {
        actor: { kind: "service", serviceId: "books" },
        permissionLevel: "admin",
      },
      targets: [
        {
          templateName: "books:chapter",
          ...(context && { context }),
          destination: {
            entityType: "book-section",
            idPath: [id],
            metadata: {},
            visibility,
          },
        },
      ],
    });
    const data = plan.planned[0]?.jobData;
    if (!data) throw new Error("Missing planned chapter");
    await ContentGenerationJobHandler.createFresh(service, entities).process(
      data,
      "job",
      createMockProgressReporter(),
    );
  }

  test.each(["public", "shared", "restricted"] as const)(
    "caps admin retrieval to %s output visibility",
    async (visibility) => {
      const provider = spyOn(ai, "generateObject");
      const search = spyOn(entities, "search");
      const create = spyOn(entities, "createEntity").mockClear();
      await generate(visibility);
      const [system, prompt] = provider.mock.calls[0] ?? [];
      expect(system).toContain("PUBLIC_IDENTITY");
      expect(prompt).toContain("PUBLIC_KNOWLEDGE");
      if (visibility === "public")
        expect(prompt).not.toContain("SHARED_KNOWLEDGE");
      else expect(prompt).toContain("SHARED_KNOWLEDGE");
      if (visibility === "restricted") {
        expect(system).toContain("PRIVATE_ANCHOR");
        expect(prompt).toContain("PRIVATE_KNOWLEDGE");
      } else {
        expect(system).not.toContain("PRIVATE_ANCHOR");
        expect(prompt).not.toContain("PRIVATE_KNOWLEDGE");
      }
      expect(ambientIdentity).not.toHaveBeenCalled();
      expect(ambientProfile).not.toHaveBeenCalled();
      expect(search).toHaveBeenCalledWith({
        query: "orchard",
        options: { limit: 5, visibilityScope: visibility },
      });
      // Missing prompt overrides never cause generation to materialize an extra entity.
      expect(create).toHaveBeenCalledTimes(1);
      expect(
        await entities.getEntity({
          entityType: "book-section",
          id: "chapter",
          visibilityScope: visibility,
        }),
      ).toMatchObject({
        content: expect.stringContaining("Generated chapter"),
        visibility,
      });
    },
  );

  test("rejects an oversized knowledge query instead of letting search truncate it", async () => {
    const search = spyOn(entities, "search");
    const provider = spyOn(ai, "generateObject");
    const outcome = await generate("public", "chapter", {
      prompt: "x".repeat(MAX_SEARCH_QUERY_CHARS),
    }).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(GenerationLimitError);
    expect(search).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  test("identity-free generation reads neither singleton nor bootstrap caches", async () => {
    const reads = spyOn(entities, "getEntity").mockClear();
    const provider = spyOn(ai, "generateObject");
    await generate("restricted", "chapter", { representedIdentity: "none" });
    expect(reads.mock.calls.map(([request]) => request.entityType)).toEqual([
      "prompt",
    ]);
    expect(provider.mock.calls[0]?.[0]).not.toContain("PUBLIC_IDENTITY");
    expect(provider.mock.calls[0]?.[0]).not.toContain("PRIVATE_ANCHOR");
    expect(ambientIdentity).not.toHaveBeenCalled();
    expect(ambientProfile).not.toHaveBeenCalled();
  });

  test("revocation during the AI request prevents consuming its output", async () => {
    const provider = spyOn(ai, "generateObject").mockImplementation(
      async (_system, _prompt, schema) => {
        permissions.replaceRuntimePrincipalState({ grants: [], anchors: [] });
        return {
          object: schema.parse("Generated"),
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    );
    const outcome = await generate("restricted").catch(
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({ name: "GenerationAuthorizationError" });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      await entities.getEntity({
        entityType: "book-section",
        id: "chapter",
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  test("ignores an ambient prompt cache after its entity becomes restricted", async () => {
    await entities.createEntity({
      entity: {
        id: "books-chapter",
        entityType: "prompt",
        metadata: {},
        content: "PRIVATE_PROMPT",
        visibility: "public",
      },
    });
    await datasource.generate({ templateName: "books:chapter" }, z.string());
    const prompt = await entities.getEntity({
      entityType: "prompt",
      id: "books-chapter",
    });
    if (!prompt) throw new Error("Missing prompt override");
    await entities.updateEntity({
      entity: { ...prompt, visibility: "restricted" },
    });
    const provider = spyOn(ai, "generateObject").mockClear();
    ambientIdentity.mockClear();
    ambientProfile.mockClear();
    await generate("public");
    expect(provider.mock.calls[0]?.[0]).not.toContain("PRIVATE_PROMPT");
    expect(provider.mock.calls[0]?.[1]).not.toContain("PRIVATE_PROMPT");
    expect(ambientIdentity).not.toHaveBeenCalled();
    expect(ambientProfile).not.toHaveBeenCalled();
    await generate("restricted", "restricted-chapter");
    expect(provider.mock.calls[1]?.[0]).toContain("PRIVATE_PROMPT");
  });

  test("resolves authority exactly twice per job: at admission and before the write", async () => {
    const plan = await service.planGeneration({
      caller: {
        actor: { kind: "service", serviceId: "books" },
        permissionLevel: "admin",
      },
      targets: [
        {
          templateName: "books:chapter",
          destination: {
            entityType: "book-section",
            idPath: ["chapter"],
            metadata: {},
            visibility: "restricted",
          },
        },
      ],
    });
    const data = plan.planned[0]?.jobData;
    if (!data) throw new Error("Missing planned chapter");
    const resolutions = spyOn(permissions, "determineUserLevel").mockClear();
    const provider = spyOn(ai, "generateObject");
    await ContentGenerationJobHandler.createFresh(service, entities).process(
      data,
      "job",
      createMockProgressReporter(),
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(resolutions).toHaveBeenCalledTimes(2);
  });
});
