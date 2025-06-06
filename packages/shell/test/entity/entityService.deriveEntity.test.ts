import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { EntityService } from "@/entity/entityService";
import { EntityRegistry } from "@/entity/entityRegistry";
import { createSilentLogger, type Logger } from "@brains/utils";
import { createId } from "@brains/db/schema";
import type { IEmbeddingService } from "@/embedding/embeddingService";
import { GeneratedContentAdapter } from "@/content/generatedContentAdapter";
import { BaseEntityAdapter } from "@brains/base-entity";
import {
  baseEntitySchema,
  generatedContentSchema,
  type GeneratedContent,
} from "@brains/types";
import { createTestDatabase } from "../helpers/test-db";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

describe("EntityService.deriveEntity", () => {
  let entityService: EntityService;
  let entityRegistry: EntityRegistry;
  let logger: Logger;
  let mockEmbeddingService: IEmbeddingService;

  let testDb: LibSQLDatabase<Record<string, never>>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Reset singletons
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    // Create test database
    const testDbSetup = await createTestDatabase();
    testDb = testDbSetup.db;
    cleanup = testDbSetup.cleanup;

    // Create dependencies
    logger = createSilentLogger();

    // Create mock embedding service
    mockEmbeddingService = {
      generateEmbedding: async (): Promise<Float32Array> =>
        new Float32Array(384).fill(0.1),
      generateEmbeddings: async (texts: string[]): Promise<Float32Array[]> =>
        texts.map(() => new Float32Array(384).fill(0.1)),
    };

    // Create and configure entity registry
    entityRegistry = EntityRegistry.createFresh(logger);
    const baseEntityAdapter = new BaseEntityAdapter();
    const generatedContentAdapter = new GeneratedContentAdapter();
    entityRegistry.registerEntityType(
      "base",
      baseEntitySchema,
      baseEntityAdapter,
    );
    entityRegistry.registerEntityType(
      "generated-content",
      generatedContentSchema,
      generatedContentAdapter,
    );

    // Create entity service
    entityService = EntityService.createFresh({
      db: testDb,
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("should derive entity from generated-content to base entity", async () => {
    // Create a generated-content entity
    const sourceEntity = await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "test-content",
      schemaName: "test-schema",
      data: {
        title: "Test Title",
        content: "Test content body",
      },
      content: JSON.stringify({
        title: "Test Title",
        content: "Test content body",
      }),
      metadata: {
        prompt: "Generate test content",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
      },
    });

    // Verify the source entity exists
    const verifySource = await entityService.getEntity(
      "generated-content",
      sourceEntity.id,
    );
    expect(verifySource).toBeDefined();

    // Derive to base entity
    const derivedEntity = await entityService.deriveEntity(
      sourceEntity.id,
      "generated-content",
      "base",
      undefined,
    );

    expect(derivedEntity).toBeDefined();
    expect(derivedEntity.entityType).toBe("base");
    expect(derivedEntity.id).not.toBe(sourceEntity.id);
    expect(derivedEntity.content).toContain("Test Title");
    expect(derivedEntity.content).toContain("Test content body");

    // Verify source still exists
    const sourceStillExists = await entityService.getEntity(
      "generated-content",
      sourceEntity.id,
    );
    expect(sourceStillExists).toBeDefined();
  });

  it("should delete source entity when deleteSource option is true", async () => {
    // Create a generated-content entity
    const sourceEntity = await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "test-content",
      schemaName: "test-schema",
      data: {
        title: "Test Title",
        content: "Test content body",
      },
      content: JSON.stringify({
        title: "Test Title",
        content: "Test content body",
      }),
      metadata: {
        prompt: "Generate test content",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
      },
    });

    // Derive to base entity with deleteSource
    const derivedEntity = await entityService.deriveEntity(
      sourceEntity.id,
      "generated-content",
      "base",
      undefined,
      { deleteSource: true },
    );

    expect(derivedEntity).toBeDefined();
    expect(derivedEntity.entityType).toBe("base");

    // Verify source was deleted
    const sourceDeleted = await entityService.getEntity(
      "generated-content",
      sourceEntity.id,
    );
    expect(sourceDeleted).toBeNull();
  });

  it("should throw error if source entity does not exist", async () => {
    const nonExistentId = createId();

    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(
      entityService.deriveEntity(nonExistentId, "generated-content", "base"),
    ).rejects.toThrow(
      `Source entity not found: generated-content/${nonExistentId}`,
    );
  });

  it("should merge additional fields into derived entity", async () => {
    // Create a base entity
    const sourceEntity = await entityService.createEntity({
      entityType: "base",
      content: "Original content",
    });

    // Derive to another base entity with modified content
    const derivedEntity = await entityService.deriveEntity(
      sourceEntity.id,
      "base",
      "base",
      {
        content: "New content with modifications",
      },
    );

    expect(derivedEntity.content).toBe("New content with modifications");
    expect(derivedEntity.id).not.toBe(sourceEntity.id); // Should have new ID
    expect(derivedEntity.entityType).toBe("base");
  });

  it("should extract data field from generated-content when deriving", async () => {
    // Create a generated-content entity with nested data
    const sourceEntity = await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "complex-content",
      schemaName: "complex-schema",
      data: {
        hero: {
          title: "Hero Title",
          subtitle: "Hero Subtitle",
        },
        features: ["Feature 1", "Feature 2"],
      },
      content: JSON.stringify({
        hero: {
          title: "Hero Title",
          subtitle: "Hero Subtitle",
        },
        features: ["Feature 1", "Feature 2"],
      }),
      metadata: {
        prompt: "Generate complex content",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
      },
    });

    // Derive to base entity
    const derivedEntity = await entityService.deriveEntity(
      sourceEntity.id,
      "generated-content",
      "base",
    );

    // The derived entity should preserve the original markdown content
    expect(derivedEntity.entityType).toBe("base");
    expect(derivedEntity.content).toContain("# complex-content");
    expect(derivedEntity.content).toContain(
      "Generated using schema: complex-schema",
    );
    // The content field should be the markdown, not JSON
    expect(derivedEntity.content).not.toMatch(/^\{/);
  });
});
