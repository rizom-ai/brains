import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { internalFullScope, type ContentVisibility } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { faqAdapter, faqMetadata } from "../src/adapters/faq-adapter";
import { mergeIntoFaq } from "../src/lib/faq-store";
import {
  faqSchema,
  type FaqEntity,
  type FaqFrontmatter,
} from "../src/schemas/faq";

describe("FAQ merge retry eligibility with real SQLite", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let service: EntityService;

  beforeEach(async () => {
    directory = await createTestDirectory("faq-merge-eligibility");
    const logger = createSilentLogger();
    const dbConfig = { url: `file:${directory.dir}/entities.db` };
    await migrateEntities(dbConfig, logger);
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType("faq", faqSchema, faqAdapter, {
      publish: { publishStatuses: ["published"] },
    });
    service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
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
  });

  afterEach(async () => {
    service.close();
    await directory.cleanup();
  });

  async function read(): Promise<FaqEntity> {
    const entity = await service.getEntity(
      {
        entityType: "faq",
        id: "target",
        visibilityScope: internalFullScope("FAQ test fixture"),
      },
      faqSchema,
    );
    if (!entity) throw new Error("Missing FAQ test fixture");
    return entity;
  }

  async function seed(visibility: ContentVisibility): Promise<FaqEntity> {
    const fields: FaqFrontmatter = {
      question: "How do I publish?",
      status: "draft",
      asked: 1,
    };
    await service.createEntity({
      entity: {
        id: "target",
        entityType: "faq",
        visibility,
        content: faqAdapter.createFaqContent(fields, "Original answer"),
        metadata: faqMetadata(fields),
      },
    });
    return read();
  }

  async function edit(
    entity: FaqEntity,
    visibility: ContentVisibility,
    question = entity.metadata.question,
  ): Promise<FaqEntity> {
    const fields: FaqFrontmatter = { question, status: "published", asked: 2 };
    await service.updateEntity({
      entity: {
        ...entity,
        visibility,
        content: faqAdapter.createFaqContent(
          fields,
          "Separately reviewed answer",
        ),
        metadata: faqMetadata(fields),
      },
    });
    return read();
  }

  function merge(entity: FaqEntity): Promise<boolean> {
    return mergeIntoFaq(
      {
        entityService: service,
        searchWithDistances: async () => [],
        sameQuestionDistance: 0.25,
        ai: {
          generateObject: async () => {
            throw new Error("Unexpected provider call");
          },
        },
      },
      entity,
      { asks: 1, alternatives: [{ answer: "PRIVATE_MERGE_TEST_MARKER" }] },
    );
  }

  it.each([
    ["restricted", "public"],
    ["restricted", "shared"],
    ["public", "restricted"],
  ] as const)(
    "does not reapply %s material to a now-%s target",
    async (initial, changed) => {
      const original = await seed(initial);
      const edited = await edit(original, changed);
      expect(await merge(original)).toBe(false);
      expect(await read()).toEqual(edited);
      const publiclyReadable = await service.getEntity(
        {
          entityType: "faq",
          id: "target",
          visibilityScope: "public",
          publishedOnly: true,
        },
        faqSchema,
      );
      if (changed === "public") {
        expect(publiclyReadable).not.toBeNull();
        expect(publiclyReadable?.content).not.toContain(
          "PRIVATE_MERGE_TEST_MARKER",
        );
      } else {
        expect(publiclyReadable).toBeNull();
      }
    },
  );

  it("does not reapply an answer after the target question changes", async () => {
    const original = await seed("restricted");
    const edited = await edit(original, "restricted", "How do I unpublish?");
    expect(await merge(original)).toBe(false);
    expect(await read()).toEqual(edited);
  });

  it("still retries concurrent merges of the same question and visibility", async () => {
    const original = await seed("restricted");
    await edit(original, "restricted");
    expect(await merge(original)).toBe(true);
    const stored = await read();
    expect(stored.visibility).toBe("restricted");
    expect(stored.metadata.asked).toBe(3);
    expect(faqAdapter.parseFaqContent(stored.content)).toMatchObject({
      answer: "Separately reviewed answer",
      alternatives: [{ answer: "PRIVATE_MERGE_TEST_MARKER" }],
    });
  });
});
