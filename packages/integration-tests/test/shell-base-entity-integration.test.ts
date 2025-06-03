import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { Shell } from "@brains/shell/src/shell";
import { EntityRegistry } from "@brains/shell/src/entity/entityRegistry";
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
      title: "Test",
      content: "Test",
      tags: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    expect(testEntity.entityType).toBe("base");
  });

  test("base entity formatter is registered during shell initialization", async () => {
    // Create a shell instance
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

    // Get the formatter registry through the shell
    const formatterRegistry = shell.getFormatterRegistry();

    // Verify base entity formatter is registered
    expect(formatterRegistry.hasFormatter("baseEntity")).toBe(true);
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
      title: "Test Base Entity",
      content: "This is test content for a base entity",
      tags: ["test", "integration"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    // Verify created entity
    expect(createdEntity.id).toBeDefined();
    expect(createdEntity.entityType).toBe("base");
    expect(createdEntity.title).toBe("Test Base Entity");
    expect(createdEntity.content).toBe(
      "This is test content for a base entity",
    );
    expect(createdEntity.tags).toEqual(["test", "integration"]);

    // Retrieve the entity
    const retrievedEntity = await entityService.getEntity<BaseEntity>(
      "base",
      createdEntity.id,
    );
    expect(retrievedEntity).not.toBeNull();
    expect(retrievedEntity?.id).toBe(createdEntity.id);
    expect(retrievedEntity?.title).toBe("Test Base Entity");
    expect(retrievedEntity?.content).toBe(
      "This is test content for a base entity",
    );

    // Update the entity
    const updatedEntity = await entityService.updateEntity<BaseEntity>({
      ...createdEntity,
      title: "Updated Base Entity",
      content: "Updated content",
    });

    expect(updatedEntity.title).toBe("Updated Base Entity");
    expect(updatedEntity.content).toBe("Updated content");

    // Verify update persisted
    const verifyUpdate = await entityService.getEntity<BaseEntity>(
      "base",
      createdEntity.id,
    );
    expect(verifyUpdate?.title).toBe("Updated Base Entity");
    expect(verifyUpdate?.content).toBe("Updated content");
  });

  test("base entity adapter correctly serializes and deserializes markdown", () => {
    // Create adapter instance
    const adapter = new BaseEntityAdapter();

    // Create a test entity
    const entity: BaseEntity = {
      id: "test-123",
      entityType: "base",
      title: "Test Entity",
      content: "# Test Content\n\nThis is a test entity with markdown content.",
      tags: ["test", "markdown"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // Convert to markdown
    const markdown = adapter.toMarkdown(entity);
    expect(markdown).toContain("---");
    expect(markdown).toContain("id: test-123");
    expect(markdown).toContain("title: Test Entity");
    expect(markdown).toContain("# Test Content");

    // Convert back from markdown
    const parsed = adapter.fromMarkdown(markdown);
    expect(parsed.content).toBe(
      "# Test Content\n\nThis is a test entity with markdown content.",
    );
    expect(parsed.id).toBe("test-123");
    expect(parsed.title).toBe("Test Entity");
  });

  test("can search base entities by tags", async () => {
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

    // Create multiple entities with different tags
    await entityService.createEntity<BaseEntity>({
      entityType: "base",
      title: "Entity 1",
      content: "Content 1",
      tags: ["tag1", "tag2"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    await entityService.createEntity<BaseEntity>({
      entityType: "base",
      title: "Entity 2",
      content: "Content 2",
      tags: ["tag2", "tag3"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    await entityService.createEntity<BaseEntity>({
      entityType: "base",
      title: "Entity 3",
      content: "Content 3",
      tags: ["tag3"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    // Search by tag
    const results = await entityService.searchEntitiesByTags(["tag2"]);
    expect(results.length).toBe(2);
    expect(results.map((r) => r.entity.title).sort()).toEqual([
      "Entity 1",
      "Entity 2",
    ]);
  });

  test("formatter correctly formats base entities", async () => {
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

    const formatterRegistry = shell.getFormatterRegistry();
    const formatter = formatterRegistry.getFormatter("baseEntity");

    // Verify formatter exists
    expect(formatter).not.toBeNull();

    if (!formatter) {
      throw new Error("BaseEntity formatter not found");
    }

    // Create a test entity
    const entity: BaseEntity = {
      id: "test-123",
      entityType: "base",
      title: "Test Entity",
      content: "Test content",
      tags: ["test"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    // Format the entity
    const formatted = formatter.format(entity);

    // Verify formatted output contains expected fields
    expect(formatted).toContain("# Test Entity");
    expect(formatted).toContain("ID**: test-123");
    expect(formatted).toContain("Tags**: test");
    expect(formatted).toContain("## Content");
    expect(formatted).toContain("Test content");
  });
});
