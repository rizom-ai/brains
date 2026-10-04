import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  scopeEntityReads,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell, createTestEntityAccess } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { faqEntityHarness } from "./helpers/faq-entity-harness";
import { faqSchema } from "../src/schemas/faq";
import { createFaqContent, faqMetadata } from "../src/lib/faq-content";
import { findSameFaq } from "../src/lib/faq-matching";
import { SAME_QUESTION_CHECK } from "../src/lib/faq-question";

describe("owned FAQ matching through SQLite", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let service: EntityService;
  const embedding = new Float32Array(1536).fill(0.1);
  beforeEach(async () => {
    directory = await createTestDirectory("faq-owned-matching");
    const logger = createSilentLogger();
    const dbConfig = { url: `file:${directory.dir}/entities.db` };
    await migrateEntities(dbConfig, logger);
    const installed = (await faqEntityHarness()).getEntityRegistry();
    const registry = EntityRegistry.createFresh(logger);
    registry.registerEntityType(
      "faq",
      faqSchema,
      installed.getAdapter("faq"),
      installed.getEntityTypeConfig("faq"),
    );
    service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
      entityRegistry: registry,
      logger,
      jobQueueService: createMockShell().getJobQueueService(),
      embeddingsEnabled: true,
      embeddingService: {
        dimensions: 1536,
        generateEmbedding: async () => ({ embedding, usage: { tokens: 0 } }),
        generateEmbeddings: async () => {
          throw new Error("Unexpected batch embedding");
        },
      },
    });
  });
  afterEach(async () => {
    service.close();
    await directory.cleanup();
  });
  async function seed(
    id: string,
    question: string,
    visibility: "public" | "restricted" = "public",
    status: "draft" | "published" = "draft",
  ): Promise<void> {
    const fields = { question, status, asked: 1 };
    await service.createEntity({
      entity: {
        id,
        entityType: "faq",
        visibility,
        content: createFaqContent(fields, question),
        metadata: faqMetadata(fields),
      },
    });
    const entity = await service.getEntity(
      { entityType: "faq", id, visibilityScope: visibility },
      faqSchema,
    );
    if (!entity) throw new Error("Missing seeded FAQ");
    await service.storeEmbedding({
      entityId: id,
      entityType: "faq",
      contentHash: entity.contentHash,
      embedding,
    });
  }
  it("filters exact visibility before LIMIT and confirms candidates in distance order", async () => {
    for (let i = 0; i < 25; i++)
      await seed(`a-private-${i}`, "private equivalent", "restricted");
    await seed("b-opposite", "How do I unpublish?");
    await seed("c-match", "How can I publish this?");
    const prompts: string[] = [];
    const { nearest } = createTestEntityAccess({
      entityService: service,
      ownedTypes: ["faq"],
    });
    const match = await findSameFaq(
      {
        nearest,
        sameQuestionDistance: 0.25,
        ai: {
          generateObject: async <T>(
            prompt: string,
            schema: { parse(value: unknown): T },
          ): Promise<{ object: T }> => {
            prompts.push(prompt);
            return {
              object: schema.parse({
                same: prompt.includes("How can I publish this?"),
              }),
            };
          },
        },
      },
      { content: "How do I publish?", visibility: "public" },
    );
    expect(match?.id).toBe("c-match");
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain(SAME_QUESTION_CHECK);
    expect(prompts[0]).toContain("How do I unpublish?");
    expect(prompts.join("\n")).not.toContain("private equivalent");
  });
  it("bounds materialization and confirmations at 20; no match beyond the shortlist is implied", async () => {
    for (let i = 0; i < 21; i++)
      await seed(
        `candidate-${String(i).padStart(2, "0")}`,
        i === 20 ? "Equivalent" : "Different",
      );
    let confirmations = 0;
    const read = spyOn(service, "getEntity");
    const { nearest } = createTestEntityAccess({
      entityService: service,
      ownedTypes: ["faq"],
    });
    const match = await findSameFaq(
      {
        nearest,
        sameQuestionDistance: 0.25,
        ai: {
          generateObject: async <T>(
            prompt: string,
            schema: { parse(value: unknown): T },
          ): Promise<{ object: T }> => {
            confirmations++;
            return {
              object: schema.parse({ same: prompt.includes("Equivalent") }),
            };
          },
        },
      },
      { content: "Question", visibility: "public" },
    );
    expect(match).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(20);
    expect(confirmations).toBe(20);
  });
  it("retains publication floors and excludes a source before taking the candidate bound", async () => {
    for (let i = 0; i < 21; i++) await seed(`a-draft-${i}`, "draft match");
    await seed("b-source", "published source", "public", "published");
    await seed("c-target", "published target", "public", "published");
    const { nearest } = createTestEntityAccess({
      entityService: scopeEntityReads(service, {
        visibilityScope: "public",
        publishedOnly: true,
      }),
      ownedTypes: ["faq"],
    });
    const prompts: string[] = [];
    const result = await findSameFaq(
      {
        nearest,
        sameQuestionDistance: 0.25,
        ai: {
          generateObject: async <T>(
            prompt: string,
            schema: { parse(value: unknown): T },
          ): Promise<{ object: T }> => {
            prompts.push(prompt);
            return { object: schema.parse({ same: true }) };
          },
        },
      },
      { content: "Question", visibility: "public", excludeIds: ["b-source"] },
    );
    expect(result?.id).toBe("c-target");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("published target");
  });
});
