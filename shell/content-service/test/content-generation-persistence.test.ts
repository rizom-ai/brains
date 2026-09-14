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
  EntityWriteConflictError,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createTestEntityAdapter,
  createMockDataSourceRegistry,
} from "@brains/entity-service/test";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createMockAIService } from "@brains/ai-service/test";
import { InMemoryTemplateRegistry, PermissionService } from "@brains/templates";
import {
  GenerationAuthorizer,
  type GenerationCaller,
} from "../src/generation-authorization";
import { z } from "@brains/utils/zod";
import { ContentService } from "../src/content-service";
import { ContentGenerationJobHandler } from "../src/handlers/contentGenerationJobHandler";
import type { ContentGenerationJobData } from "../src/generation-contracts";

const caller: GenerationCaller = {
  actor: { kind: "service", serviceId: "books" },
  permissionLevel: "trusted",
};
const metadata = { bookId: "book-1", sectionId: "chapter-2", order: 2 };
const target = {
  templateName: "books:chapter",
  destination: {
    entityType: "book-section",
    idPath: ["book-1", "part-1", "chapter-2"] as const,
    metadata,
  },
};

describe("generation persistence and recovery (real SQLite, mocked AI)", () => {
  let database: TestDatabase;
  let entities: EntityService;
  let registry: EntityRegistry;
  let service: ContentService;
  let handler: ContentGenerationJobHandler;
  let permissions: PermissionService;
  const logger = createSilentLogger();
  const generate = mock(async (): Promise<string> => "# Generated chapter");

  function openServices(): void {
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
          throw new Error("Indexing disabled in test");
        },
        generateEmbeddings: async () => {
          throw new Error("Indexing disabled in test");
        },
      },
    });
    const templates = InMemoryTemplateRegistry.createFresh(logger);
    templates.register("books:chapter", {
      name: "books:chapter",
      description: "A chapter without a view",
      requiredPermission: "trusted",
      basePrompt: "Write a chapter",
      dataSourceId: "shell:ai-content",
      schema: z.string(),
      formatter: {
        format: (value) => z.string().parse(value),
        parse: (value) => value,
      },
    });
    const sources = createMockDataSourceRegistry();
    spyOn(sources, "get").mockReturnValue({
      id: "shell:ai-content",
      name: "Mock AI",
      generateScoped: async (_request, schema) =>
        schema.parse(await generate()),
    });
    service = new ContentService({
      logger,
      entityService: entities,
      templateRegistry: templates,
      dataSourceRegistry: sources,
      aiService: createMockAIService(),
      generationAuthorizer: new GenerationAuthorizer(
        permissions,
        async () => null,
      ),
    });
    handler = ContentGenerationJobHandler.createFresh(service, entities);
  }

  beforeEach(async () => {
    permissions = new PermissionService({
      trusted: ["service:books"],
      entityActions: { "book-section": { publish: "admin" } },
    });
    database = await createTestDatabase({
      prefix: "generation-recovery-",
      filename: "entities.db",
      migrate: (url) => migrateEntities({ url }, logger),
    });
    registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType(
      "book-section",
      baseEntitySchema.extend({
        metadata: z.object({
          bookId: z.string(),
          sectionId: z.string(),
          order: z.number(),
        }),
      }),
      createTestEntityAdapter("book-section"),
    );
    generate.mockReset();
    generate.mockResolvedValue("# Generated chapter");
    openServices();
  });
  afterEach(async () => {
    entities.close();
    await database.cleanup();
  });

  async function plan(force = false): Promise<ContentGenerationJobData> {
    const result = await service.planGeneration({
      caller,
      targets: [target],
      options: { force },
    });
    const job = result.planned[0]?.jobData;
    if (!job) throw new Error("Expected planned chapter");
    return job;
  }

  test.each([false, true])(
    "checks current authority and final policy fields after async validation (force=%s)",
    async (force) => {
      const entityId = "book-1:part-1:chapter-2";
      if (force)
        await entities.createEntity({
          entity: {
            id: entityId,
            entityType: "book-section",
            content: "Original",
            metadata,
          },
        });
      spyOn(entities, "getEntityTypeConfig").mockReturnValue({
        publish: { publishStatuses: ["published"] },
      });
      for (const reason of ["revoked", "visibility", "publish"] as const) {
        const job = await plan(force);
        registry.registerPersistValidator("book-section", async (entity) => {
          await Promise.resolve();
          if (reason === "revoked")
            permissions.replaceRuntimePrincipalState({
              grants: [],
              anchors: [],
            });
          if (reason === "visibility") entity.visibility = "restricted";
          if (reason === "publish") entity.metadata["status"] = "published";
        });
        const outcome = await handler
          .process(job, reason, createMockProgressReporter())
          .catch((error: unknown) => error);
        expect(outcome).toMatchObject({
          name: "GenerationAuthorizationError",
        });
        const saved = await entities.getEntityRaw({
          entityType: "book-section",
          id: entityId,
        });
        if (force)
          expect(saved).toMatchObject({
            content: "Original",
            visibility: "public",
            metadata,
          });
        else expect(saved).toBeNull();
        // Reconstruct current service permissions as after a configuration reload.
        permissions = new PermissionService({
          trusted: ["service:books"],
          entityActions: { "book-section": { publish: "admin" } },
        });
        entities.close();
        openServices();
        spyOn(entities, "getEntityTypeConfig").mockReturnValue({
          publish: { publishStatuses: ["published"] },
        });
      }
    },
  );

  test("cancellation during persist validation rolls back the write", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled before commit");
    const job = await plan();
    registry.registerPersistValidator("book-section", async () => {
      controller.abort(reason);
    });
    expect(
      handler.process(
        job,
        "cancelled",
        createMockProgressReporter(),
        controller.signal,
      ),
    ).rejects.toBe(reason);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      await entities.getEntityRaw({
        entityType: "book-section",
        id: job.destination.entityId,
      }),
    ).toBeNull();
  });

  test("cancellation after the atomic commit preserves output", async () => {
    const controller = new AbortController();
    const job = await plan();
    const clearWakeup = entities.setProjectionWakeup(async () => {
      controller.abort(new Error("late cancellation"));
    });
    try {
      const output = await handler.process(
        job,
        "commit",
        createMockProgressReporter(),
        controller.signal,
      );
      expect(controller.signal.aborted).toBe(true);
      expect(
        (
          await entities.getEntityRaw({
            entityType: output.entityType,
            id: output.entityId,
          })
        )?.content,
      ).toBe("# Generated chapter");
    } finally {
      clearWakeup();
    }
  });

  test("persists two independent chapter-shaped targets without a layout", async () => {
    const result = await service.planGeneration({
      caller,
      targets: [
        target,
        {
          ...target,
          destination: { ...target.destination, idPath: ["introduction"] },
        },
      ],
    });
    const outputs = await Promise.all(
      result.planned.map(({ jobData }) =>
        handler.process(
          jobData,
          jobData.destination.entityId,
          createMockProgressReporter(),
        ),
      ),
    );
    expect(outputs).toHaveLength(2);
    for (const output of outputs) {
      const saved = await entities.getEntityRaw({
        entityType: output.entityType,
        id: output.entityId,
      });
      expect(saved?.content).toBe("# Generated chapter");
      expect(saved?.metadata).toEqual(metadata);
    }
  });

  test("a progress failure after the commit does not fail the job", async () => {
    const job = await plan();
    const progress = createMockProgressReporter();
    spyOn(progress, "report").mockImplementation(
      async ({ progress: value }) => {
        if (value === 3) throw new Error("acknowledgement lost");
      },
    );
    // Generation jobs run at most once, so an explicit failure must mean
    // nothing was written. After the commit, reporting is best-effort.
    const output = await handler.process(job, "attempt-1", progress);
    expect(output).toEqual({
      entityType: "book-section",
      entityId: job.destination.entityId,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (
        await entities.getEntityRaw({
          entityType: output.entityType,
          id: output.entityId,
        })
      )?.content,
    ).toBe("# Generated chapter");
  });

  test.each([false, true])(
    "rejects an edit racing AI generation (force=%s)",
    async (force) => {
      if (force)
        await handler.process(
          await plan(),
          "initial",
          createMockProgressReporter(),
        );
      const job = await plan(force);
      generate.mockImplementationOnce(async () => {
        if (force) {
          const saved = await entities.getEntityRaw({
            entityType: "book-section",
            id: job.destination.entityId,
          });
          if (!saved) throw new Error("Missing original chapter");
          await entities.updateEntity({
            entity: { ...saved, metadata: { ...metadata, order: 3 } },
          });
        } else {
          await entities.createEntity({
            entity: {
              id: job.destination.entityId,
              entityType: "book-section",
              content: "Editor wins",
              metadata,
            },
          });
        }
        return "Stale AI output";
      });
      expect(
        handler.process(job, "racing", createMockProgressReporter()),
      ).rejects.toBeInstanceOf(EntityWriteConflictError);
      const saved = await entities.getEntityRaw({
        entityType: "book-section",
        id: job.destination.entityId,
      });
      expect(saved?.content).toBe(
        force ? "# Generated chapter" : "Editor wins",
      );
      if (force) expect(saved?.metadata["order"]).toBe(3);
    },
  );
});
