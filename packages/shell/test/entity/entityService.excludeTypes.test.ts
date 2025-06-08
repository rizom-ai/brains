import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { EntityService } from "@/entity/entityService";
import { EntityRegistry } from "@/entity/entityRegistry";
import { createSilentLogger, type Logger } from "@brains/utils";
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
import { z } from "zod";

describe("EntityService search with excludeTypes", () => {
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

  it("should exclude specified entity types from search results", async () => {
    // Create a mix of entities
    await entityService.createEntity({
      entityType: "base",
      content: "This is a regular note about artificial intelligence",
    });

    await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "test",
      data: {
        content: "This is generated content about artificial intelligence",
      },
      content: "This is generated content about artificial intelligence",
      metadata: {
        prompt: "Generate content about artificial intelligence",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
        validationStatus: "valid",
      },
    });

    await entityService.createEntity({
      entityType: "base",
      content: "Another regular note about artificial intelligence",
    });

    // Search for "generated" which should find the generated-content entity
    await entityService.search("generated", {
      limit: 10,
    });

    // Search without excludeTypes - use "note" which is in base entities
    const allResults = await entityService.search("note", {
      limit: 10,
    });

    expect(allResults.length).toBeGreaterThanOrEqual(2);

    // Search with excludeTypes - searching for "content" which appears in generated-content summary
    const contentResults = await entityService.search("content", {
      limit: 10,
    });
    contentResults.some((r) => r.entity.entityType === "generated-content");

    // Now search with excludeTypes
    const filteredResults = await entityService.search("content", {
      excludeTypes: ["generated-content"],
      limit: 10,
    });

    // Should not have any generated-content
    expect(
      filteredResults.every((r) => r.entity.entityType !== "generated-content"),
    ).toBe(true);
  });

  it("should handle multiple excluded types", async () => {
    // Register a third entity type for testing
    const noteAdapter = new BaseEntityAdapter();
    entityRegistry.registerEntityType(
      "note",
      baseEntitySchema.extend({ entityType: z.literal("note") }),
      noteAdapter,
    );

    // Create different types of entities
    await entityService.createEntity({
      entityType: "base",
      content: "Base entity about testing",
    });

    await entityService.createEntity({
      entityType: "note",
      content: "Note entity about testing",
    });

    await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "test",
      data: { content: "Generated content about testing" },
      content: "Generated content about testing",
      metadata: {
        prompt: "test",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
        validationStatus: "valid",
      },
    });

    // Search excluding multiple types
    const results = await entityService.search("testing", {
      excludeTypes: ["generated-content", "note"],
      limit: 10,
    });

    expect(results.length).toBe(1);
    expect(results[0]?.entity.entityType).toBe("base");
  });

  it("should work with both types and excludeTypes filters", async () => {
    // Register additional entity types
    const noteAdapter = new BaseEntityAdapter();
    const taskAdapter = new BaseEntityAdapter();
    entityRegistry.registerEntityType(
      "note",
      baseEntitySchema.extend({ entityType: z.literal("note") }),
      noteAdapter,
    );
    entityRegistry.registerEntityType(
      "task",
      baseEntitySchema.extend({ entityType: z.literal("task") }),
      taskAdapter,
    );

    // Create various entities
    await entityService.createEntity({
      entityType: "note",
      content: "Note about search functionality",
    });

    await entityService.createEntity({
      entityType: "task",
      content: "Task about search functionality",
    });

    await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "note",
      data: { content: "Generated note about search functionality" },
      content: "Generated note about search functionality",
      metadata: {
        prompt: "test",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
        validationStatus: "valid",
      },
    });

    await entityService.createEntity({
      entityType: "base",
      content: "Base entity about search functionality",
    });

    // Search with both types and excludeTypes
    const results = await entityService.search("search", {
      types: ["note", "generated-content"],
      excludeTypes: ["generated-content"],
      limit: 10,
    });

    expect(results.length).toBe(1);
    expect(results[0]?.entity.entityType).toBe("note");
  });

  it("should handle empty excludeTypes array", async () => {
    await entityService.createEntity({
      entityType: "base",
      content: "Test entity",
    });

    await entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: "test",
      data: { content: "Generated test entity" },
      content: "Generated test entity",
      metadata: {
        prompt: "test",
        generatedAt: new Date().toISOString(),
        generatedBy: "test",
        regenerated: false,
        validationStatus: "valid",
      },
    });

    // Search for "entity" which should be in both
    const results = await entityService.search("entity", {
      excludeTypes: [],
      limit: 10,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
