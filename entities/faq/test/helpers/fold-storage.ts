import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell, createTestEntityAccess } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { createFaqContent, faqMetadata } from "../../src/lib/faq-content";
import { faqEntityHarness } from "./faq-entity-harness";
import { faqSchema, type FaqEntity } from "../../src/schemas/faq";
import { reconcileFaq } from "../../src/lib/reconcile-faq";
import { findSameFaq } from "../../src/lib/faq-matching";
import { faq } from "../../src/faq-entity";

export async function openFoldStorage(dir: string): Promise<EntityService> {
  const logger = createSilentLogger();
  const dbConfig = { url: `file:${dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const registry = EntityRegistry.createFresh(logger);
  const installed = (await faqEntityHarness()).getEntityRegistry();
  registry.registerEntityType(
    "faq",
    faqSchema,
    installed.getAdapter("faq"),
    installed.getEntityTypeConfig("faq"),
  );
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
        content: createFaqContent(fields, `Answer ${id}`),
        metadata: faqMetadata(fields),
      },
    });
  }
}

export function reconcileFold(
  service: EntityService,
): ReturnType<typeof reconcileFaq> {
  service.searchWithDistances = async (): ReturnType<
    EntityService["searchWithDistances"]
  > => [{ entityId: "target", entityType: "faq", distance: 0.01 }];
  const { mutations, nearest } = createTestEntityAccess({
    entityService: service,
    ownedTypes: ["faq"],
    owner: "@brains/faq",
    declarationId: "capture",
  });
  return reconcileFaq("source", {
    read: (id, visibilityScope) => mutations.read(faq, id, { visibilityScope }),
    findSame: (request) =>
      findSameFaq(
        {
          nearest,
          sameQuestionDistance: 0.2,
          ai: {
            generateObject: async <T>(
              _prompt: string,
              schema: { parse(value: unknown): T },
            ): Promise<{ object: T }> => ({
              object: schema.parse({ same: true }),
            }),
          },
        },
        request,
      ),
    fold: (source, target, entity) =>
      mutations.fold(faq, source, target, entity),
  });
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
