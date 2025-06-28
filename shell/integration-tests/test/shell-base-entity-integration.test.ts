import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { Shell } from "@brains/core";
import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/utils";
import { BaseEntityAdapter } from "@brains/base-entity";
import { createTestDatabase } from "./helpers/test-db.js";
import type { BaseEntity } from "@brains/types";

describe("Shell and Base Entity Integration", () => {
  let shell: Shell;
  let dbPath: string;

  beforeEach(async () => {
    // Get a unique test database for each test
    const testDb = await createTestDatabase();
    dbPath = testDb.dbPath;

    // Clean up singletons before each test
    Shell.resetInstance();
    EntityRegistry.resetInstance();
  });

  afterEach(() => {
    // Clean up singletons after each test
    Shell.resetInstance();
    EntityRegistry.resetInstance();
  });

  test("base entity is registered during shell initialization", async () => {
    // Create a shell instance with real dependencies
    shell = Shell.createFresh(
      {
        features: {
          enablePlugins: false,
        },
        database: {
          url: `file:${dbPath}`,
        },
      },
      {
        logger: createSilentLogger(),
      },
    );

    // Initialize the shell
    await shell.initialize();

    // Get the entity service to check if base entity is supported
    const entityService = shell.getEntityService();

    // Verify base entity type is registered by checking supported types
    const supportedTypes = entityService.getSupportedEntityTypes();
    expect(supportedTypes).toContain("base");

    // Verify we can create a base entity (which will fail if adapter isn't registered)
    const testEntity = await entityService.createEntity<BaseEntity>({
      entityType: "base",
      content: "Test",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    expect(testEntity.entityType).toBe("base");
  });

  test("can create, retrieve, and update base entities through entity service", async () => {
    // Create and initialize shell with real database
    shell = Shell.createFresh(
      {
        features: {
          enablePlugins: false,
        },
        database: {
          url: `file:${dbPath}`,
        },
      },
      {
        logger: createSilentLogger(),
      },
    );
    await shell.initialize();

    // Get entity service
    const entityService = shell.getEntityService();

    // Create a base entity
    const createdEntity = await entityService.createEntity<BaseEntity>({
      entityType: "base",
      content: "This is test content for a base entity",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    // Verify created entity
    expect(createdEntity.id).toBeDefined();
    expect(createdEntity.entityType).toBe("base");
    expect(createdEntity.content).toBe(
      "This is test content for a base entity",
    );

    // Retrieve the entity
    const retrievedEntity = await entityService.getEntity<BaseEntity>(
      "base",
      createdEntity.id,
    );
    expect(retrievedEntity).not.toBeNull();
    expect(retrievedEntity?.id).toBe(createdEntity.id);
    expect(retrievedEntity?.content).toBe(
      "This is test content for a base entity",
    );

    // Update the entity
    const updatedEntity = await entityService.updateEntity<BaseEntity>({
      ...createdEntity,
      content: "Updated content",
    });

    expect(updatedEntity.content).toBe("Updated content");

    // Verify update persisted
    const verifyUpdate = await entityService.getEntity<BaseEntity>(
      "base",
      createdEntity.id,
    );
    expect(verifyUpdate?.content).toBe("Updated content");
    expect(verifyUpdate?.content).toBe("Updated content");
  });

  test("base entity adapter correctly serializes and deserializes markdown", () => {
    // Create adapter instance
    const adapter = new BaseEntityAdapter();

    // Create a test entity
    const entity: BaseEntity = {
      id: "test-123",
      entityType: "base",
      content: "# Test Content\n\nThis is a test entity with markdown content.",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // Convert to markdown - BaseEntity has no frontmatter (no entity-specific fields)
    const markdown = adapter.toMarkdown(entity);
    expect(markdown).toBe(
      "# Test Content\n\nThis is a test entity with markdown content.",
    );
    expect(markdown).not.toContain("---");
    expect(markdown).not.toContain("id:");
    expect(markdown).not.toContain("entityType:");

    // Convert back from markdown
    const parsed = adapter.fromMarkdown(markdown);
    expect(parsed.content).toBe(
      "# Test Content\n\nThis is a test entity with markdown content.",
    );

    // System fields should not be in the parsed result
    expect(parsed.id).toBeUndefined();
    expect(parsed.entityType).toBeUndefined();
  });

  test("can list and search base entities", async () => {
    // Create and initialize shell
    shell = Shell.createFresh(
      {
        features: {
          enablePlugins: false,
        },
        database: {
          url: `file:${dbPath}`,
        },
      },
      {
        logger: createSilentLogger(),
      },
    );
    await shell.initialize();

    const entityService = shell.getEntityService();

    // Create multiple entities
    await entityService.createEntity<BaseEntity>({
      entityType: "base",
      content: "Content 1",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    await entityService.createEntity<BaseEntity>({
      entityType: "base",
      content: "Content 2",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    // Test that we can list entities
    const allEntities = await entityService.listEntities<BaseEntity>("base");
    expect(allEntities.length).toBeGreaterThanOrEqual(2);

    // Test semantic search
    const searchResults = await entityService.search("Content");
    expect(searchResults.length).toBeGreaterThanOrEqual(2);
  });
});
