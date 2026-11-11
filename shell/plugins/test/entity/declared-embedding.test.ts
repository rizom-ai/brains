import { afterEach, describe, expect, it } from "bun:test";
import {
  EmbeddingJobHandler,
  EntityRegistry,
  EntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestDirectory,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../../src";

/**
 * A declared type reads back its body, but its record is the stored markdown,
 * frontmatter included, as a class type's is. The embedding is of the record,
 * so converting a type keeps the distances its search and dedup thresholds
 * were tuned on.
 */

const DIMENSIONS = 1536;
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const wish = defineEntity({
  type: "wish",
  purpose: "A wish.",
  metadata: z.object({ title: z.string(), status: z.string() }),
});

async function store(embedded: string[]): Promise<EntityService> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "wishes", entities: [wish] }),
    {},
    { name: "@fixture/wishes", version: "0.1.0" },
  )) {
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
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingService: {
      identity: {
        model: "test:mock",
        dimensions: DIMENSIONS,
        promptRevision: 0,
      },
      embedQuery: async () => ({
        embedding: new Float32Array(DIMENSIONS),
        usage: { tokens: 1 },
      }),
      embedDocuments: async (documents: { content: string }[]) => {
        embedded.push(...documents.map(({ content }) => content));
        return {
          embeddings: documents.map(() => new Float32Array(DIMENSIONS)),
          usage: { tokens: documents.length },
        };
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  return service;
}

describe("a declared type's embedding", () => {
  it("is of its stored markdown, frontmatter included", async () => {
    const embedded: string[] = [];
    const service = await store(embedded);
    await service.createEntity({
      entity: {
        id: "water-plants",
        entityType: "wish",
        content:
          "---\ntitle: Water my plants\nstatus: new\n---\nEvery morning.",
        metadata: { title: "Water my plants", status: "new" },
        visibility: "public",
      },
    });
    const stored = await service.getEntityRaw({
      entityType: "wish",
      id: "water-plants",
      source: true,
    });
    if (!stored) throw new Error("The wish was not stored");
    expect(stored.content).toContain("title: Water my plants");

    await EmbeddingJobHandler.createFresh(service, {
      identity: {
        model: "test:mock",
        dimensions: DIMENSIONS,
        promptRevision: 0,
      },
      embedQuery: async () => ({
        embedding: new Float32Array(DIMENSIONS),
        usage: { tokens: 1 },
      }),
      embedDocuments: async (documents: { content: string }[]) => {
        embedded.push(...documents.map(({ content }) => content));
        return {
          embeddings: documents.map(() => new Float32Array(DIMENSIONS)),
          usage: { tokens: documents.length },
        };
      },
    }).process(
      {
        id: "water-plants",
        entityType: "wish",
        contentHash: stored.contentHash,
        operation: "create",
      },
      "job-1",
      createMockProgressReporter(),
    );

    expect(embedded).toEqual([stored.content]);
  });
});
