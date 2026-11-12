import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { faqDocument, faqMetadata } from "../../src/lib/faq-body";
import { faqSchema, type FaqEntity } from "../../src/schemas/faq";
import { reconcileFaq } from "../../src/handlers/faq-reconcile-handler";
import { faqType } from "./faq-type";

export async function openFoldStorage(dir: string): Promise<EntityService> {
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  const { schema, adapter } = faqType();
  registry.registerEntityType("faq", schema, adapter, {
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
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected provider call");
      },
      embedDocuments: async () => {
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
        content: faqDocument(fields, `Answer ${id}`),
        metadata: faqMetadata(fields),
      },
    });
  }
}

export function reconcileFold(
  service: EntityService,
): ReturnType<typeof reconcileFaq> {
  return reconcileFaq(
    {
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
    },
    { entityId: "source" },
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
