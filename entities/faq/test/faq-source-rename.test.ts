import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";
import { internalFullScope } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { faqDocument, faqMetadata, readFaq } from "../src/lib/faq-body";
import { followSourceRename } from "../src/lib/source-rename";
import type { FaqFrontmatter, FaqSource } from "../src/schemas/faq";
import { faqType } from "./helpers/faq-type";

const fields: FaqFrontmatter = {
  question: "How do I steep tea?",
  status: "published",
  asked: 3,
};

describe("FAQ sources when a cited entry is renamed", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let service: EntityService;

  beforeEach(async () => {
    directory = await createTestDirectory("faq-source-rename");
    const logger = createSilentLogger();
    const dbConfig = { url: `file:${directory.dir}/entities.db` };
    await migrateEntities(dbConfig, logger);
    const registry = EntityRegistry.createFresh(logger);
    const { schema, adapter } = faqType();
    registry.registerEntityType("faq", schema, adapter, {
      publish: { publishStatuses: ["published"] },
    });
    service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
      entityRegistry: registry,
      logger,
      jobQueueService: createMockShell().getJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: createRefusingEmbeddingService(),
    });
    await service.initialize();
  });

  afterEach(async () => {
    service.close();
    await directory.cleanup();
  });

  async function seed(id: string, sources: FaqSource[]): Promise<void> {
    await service.createEntity({
      entity: {
        id,
        entityType: "faq",
        visibility: "restricted",
        content: faqDocument(fields, "Three minutes.", [], sources),
        metadata: faqMetadata(fields),
      },
    });
  }

  async function sourcesOf(id: string): Promise<FaqSource[]> {
    const entity = await service.getEntity({
      entityType: "faq",
      id,
      visibilityScope: internalFullScope("FAQ rename test"),
    });
    if (!entity) throw new Error(`No FAQ ${id}`);
    return readFaq(entity).sources;
  }

  it("cites the entry by its new id, and leaves every other source as it was", async () => {
    await seed("steeping", [
      { id: "note:tea", title: "Tea" },
      { id: "note:teapot", title: "Teapot" },
      {
        id: "note:tea",
        title: "Tea, elsewhere",
        brain: { name: "Other brain", url: "https://other.example" },
      },
    ]);
    await seed("brewing", [{ id: "note:coffee", title: "Coffee" }]);

    const updated = await followSourceRename(
      { entityService: service },
      { entityType: "note", previousId: "tea", entityId: "green-tea" },
    );

    expect(updated).toEqual(["steeping"]);
    expect(await sourcesOf("steeping")).toEqual([
      { id: "note:green-tea", title: "Tea" },
      { id: "note:teapot", title: "Teapot" },
      // Another brain's entry is not the one renamed here.
      {
        id: "note:tea",
        title: "Tea, elsewhere",
        brain: { name: "Other brain", url: "https://other.example" },
      },
    ]);
    expect(await sourcesOf("brewing")).toEqual([
      { id: "note:coffee", title: "Coffee" },
    ]);
  });

  it("changes nothing when no FAQ cites the entry", async () => {
    await seed("brewing", [{ id: "note:coffee", title: "Coffee" }]);

    expect(
      await followSourceRename(
        { entityService: service },
        { entityType: "note", previousId: "tea", entityId: "green-tea" },
      ),
    ).toEqual([]);
  });
});
