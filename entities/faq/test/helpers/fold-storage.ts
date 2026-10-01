import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import {
  createSilentLogger,
  createMockProgressReporter,
} from "@brains/test-utils";
import { faqAdapter, faqMetadata } from "../../src/adapters/faq-adapter";
import { faqSchema, type FaqEntity } from "../../src/schemas/faq";
import { FaqReconcileHandler } from "../../src/handlers/faq-reconcile-handler";

export async function openFoldStorage(dir: string): Promise<EntityService> {
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("faq", faqSchema, faqAdapter, {
    publish: { publishStatuses: ["published"] },
  });
  return EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected provider call");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected provider call");
      },
    },
  });
}

export async function seedFold(service: EntityService): Promise<void> {
  for (const [id, asked, created] of [
    ["target", 3, "2026-09-01T00:00:00.000Z"],
    ["source", 2, "2026-09-02T00:00:00.000Z"],
  ] as const) {
    const fields = {
      question: "How do I publish?",
      status: "draft" as const,
      asked,
    };
    await service.createEntity({
      entity: {
        id,
        entityType: "faq",
        visibility: "restricted",
        created,
        content: faqAdapter.createFaqContent(fields, `Answer ${id}`),
        metadata: faqMetadata(fields),
      },
    });
  }
}

export function reconcileFold(
  service: EntityService,
): ReturnType<FaqReconcileHandler["process"]> {
  const handler = new FaqReconcileHandler(createSilentLogger(), {
    entityService: service,
    sameQuestionDistance: 0.2,
    searchWithDistances: async (): Promise<
      { entityId: string; entityType: string; distance: number }[]
    > => [{ entityId: "target", entityType: "faq", distance: 0.01 }],
    ai: {
      generateObject: async <T>(
        _prompt: string,
        schema: { parse(value: unknown): T },
      ): Promise<{ object: T }> => ({
        object: schema.parse({ same: true }),
      }),
    },
  });
  return handler.process(
    { entityId: "source" },
    "fold-job",
    createMockProgressReporter(),
  );
}

export function readFold(
  service: EntityService,
  id: string,
): Promise<FaqEntity | null> {
  return service.getEntity(
    { entityType: "faq", id, visibilityScope: "restricted" },
    faqSchema,
  );
}
