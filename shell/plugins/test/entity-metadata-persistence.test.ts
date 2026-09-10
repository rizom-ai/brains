import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/test";
import { createMockJobQueueService } from "@brains/job-queue/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src/public/entity-definition";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { parseDefinitionEntity } from "../src/entity/entity-schema";

const record = {
  id: "one",
  entityType: "canonical",
  content: "Body",
  metadata: { priority: 3 },
  visibility: "public",
  contentHash: "hash",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};

describe("canonical entity metadata", () => {
  it("validates metadata and applies its migration once per typed parse", () => {
    let validations = 0;
    let migrations = 0;
    const definition = defineEntity({
      type: "canonical",
      purpose: "Canonical values",
      metadata: z.object({
        priority: z.number().refine(() => {
          validations++;
          return true;
        }),
      }),
      metadataFrom: (stored) => {
        migrations++;
        return stored;
      },
    });
    expect(parseDefinitionEntity(definition, record).metadata.priority).toBe(3);
    expect(validations).toBe(1);
    expect(migrations).toBe(1);
    expect(() =>
      parseDefinitionEntity(definition, { ...record, entityType: "wrong" }),
    ).toThrow();
  });

  it("persists normalized input and defaults across reopen, typed read, and update", async () => {
    const directory = await mkdtemp(join(tmpdir(), "canonical-metadata-"));
    const logger = createSilentLogger();
    const registry = EntityRegistry.createFresh(logger);
    const definition = defineEntity({
      type: "canonical",
      purpose: "Canonical values",
      metadata: z.object({
        priority: z.coerce.number(),
        done: z.boolean().default(false),
      }),
    });
    const [plugin] = createEntityPackagePlugins(
      [definition],
      [],
      { name: "@test/canonical", version: "0.0.0" },
      (id) => id,
    );
    if (!plugin) throw new Error("Missing entity plugin");
    registry.registerEntityType(definition.type, plugin.schema, plugin.adapter);
    const open = (): EntityService =>
      EntityService.createFresh({
        entityRegistry: registry,
        logger,
        jobQueueService: createMockJobQueueService(),
        embeddingsEnabled: false,
        embeddingService: {
          dimensions: 1536,
          generateEmbedding: async () => {
            throw new Error("Embeddings are disabled");
          },
          generateEmbeddings: async () => {
            throw new Error("Embeddings are disabled");
          },
        },
        dbConfig: { url: `file:${join(directory, "entities.db")}` },
        embeddingDbConfig: { url: `file:${join(directory, "embeddings.db")}` },
      });
    await migrateEntities(
      { url: `file:${join(directory, "entities.db")}` },
      logger,
    );
    let service = open();
    try {
      await service.initialize();
      // One-way normalization belongs at the input boundary, not in metadata.
      const input = z
        .object({ priority: z.string().transform(Number) })
        .parse({ priority: "3" });
      await service.createEntity({
        entity: {
          id: "one",
          entityType: definition.type,
          content: "Body",
          metadata: input,
        },
      });
      service.close();
      service = open();
      const stored = await service.getEntity({
        entityType: definition.type,
        id: "one",
      });
      expect(stored?.metadata).toEqual({ priority: 3, done: false });
      const entity = parseDefinitionEntity(definition, stored);
      expect(entity.content).toBe("Body");
      await service.updateEntity({
        entity: {
          ...entity,
          content: "Updated",
          metadata: { ...entity.metadata, done: true },
        },
      });
      service.close();
      service = open();
      const updated = parseDefinitionEntity(
        definition,
        await service.getEntity({ entityType: definition.type, id: "one" }),
      );
      expect(updated.content).toBe("Updated");
      expect(updated.metadata).toEqual({ priority: 3, done: true });
      // Safe coercion accepts its canonical output on every read as well.
      await service.createEntity({
        entity: {
          id: "two",
          entityType: definition.type,
          content: "Coerced",
          metadata: { priority: "4" },
        },
      });
      expect(
        (await service.getEntity({ entityType: definition.type, id: "two" }))
          ?.metadata["priority"],
      ).toBe(4);
    } finally {
      service.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
