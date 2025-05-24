# Testing Guide

This guide outlines the testing approach for the Personal Brain rebuild, focusing on behavior-based testing with a minimal number of high-quality tests.

## Testing Philosophy

The testing approach follows these principles:

1. **Test Behavior, Not Implementation**: Focus on what components do, not how they do it
2. **Minimal Test Suite**: Fewer, more comprehensive tests are better than many shallow tests
3. **Mock Sparingly**: Only mock external dependencies, not internal components
4. **Behavioral Verification**: Verify the end result, not intermediate steps
5. **Avoid Implementation Tests**: Don't test singleton patterns, internal state, or private methods

## Testing Levels

### Unit Tests

Unit tests focus on individual components:

```typescript
// EntityRegistry unit test
describe("EntityRegistry", () => {
  let registry: EntityRegistry;
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
    registry = new EntityRegistry(logger);
  });

  test("should register and retrieve entity type", () => {
    // Define test schemas and adapters
    const noteSchema = z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    });

    const noteAdapter = {
      fromMarkdown: jest.fn(),
      generateFrontMatter: jest.fn(),
      parseFrontMatter: jest.fn(),
      extractMetadata: jest.fn(),
    };

    // Register entity type
    registry.registerEntityType("note", noteSchema, noteAdapter);

    // Verify entity type is registered
    expect(registry.hasEntityType("note")).toBe(true);

    // Verify schema is retrievable
    const schema = registry.getSchema("note");
    expect(schema).toBe(noteSchema);

    // Verify adapter is retrievable
    const adapter = registry.getAdapter("note");
    expect(adapter).toBe(noteAdapter);
  });

  test("should throw error when entity type is not registered", () => {
    // Verify error is thrown
    expect(() => registry.getSchema("nonexistent")).toThrow();
    expect(() => registry.getAdapter("nonexistent")).toThrow();
  });
});
```

### Component Tests

Component tests verify that components work together:

```typescript
// EntityService with EntityRegistry test
describe("EntityService", () => {
  let service: EntityService;
  let registry: EntityRegistry;
  let db: MockDatabase;
  let embeddingService: MockEmbeddingService;
  let taggingService: MockTaggingService;
  let logger: MockLogger;

  beforeEach(() => {
    // Create mocks
    logger = createMockLogger();
    db = createMockDatabase();
    embeddingService = createMockEmbeddingService();
    taggingService = createMockTaggingService();

    // Create registry
    registry = new EntityRegistry(logger);

    // Register test entity type
    registry.registerEntityType("note", noteSchema, noteAdapter);

    // Create service
    service = new EntityService(
      registry,
      db,
      embeddingService,
      taggingService,
      logger,
    );
  });

  test("should save entity", async () => {
    // Create test entity
    const note = createTestNote();

    // Mock adapter methods
    noteAdapter.toMarkdown.mockReturnValue("# Test Note\n\nContent");
    noteAdapter.generateFrontMatter.mockReturnValue("---\nid: test-id\n---");

    // Mock embedding service
    embeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

    // Save entity
    await service.saveEntity(note);

    // Verify database was called with the correct arguments
    expect(db.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: note.id,
        entityType: "note",
        markdown: expect.stringContaining("# Test Note"),
      }),
    );

    // Verify embedding service was called
    expect(embeddingService.embed).toHaveBeenCalled();
  });

  // More tests...
});
```

### Plugin Integration Tests

Test that plugins work correctly:

```typescript
// Note context plugin test
describe("NoteContext Plugin", () => {
  let pluginManager: PluginManager;
  let registry: Registry;
  let logger: MockLogger;
  let messageBus: MessageBus;

  beforeEach(() => {
    // Create mocks
    logger = createMockLogger();
    registry = new Registry();
    messageBus = new MessageBus(logger);

    // Register core services
    registry.register("logger", () => logger);
    registry.register("messageBus", () => messageBus);

    // Create plugin manager
    pluginManager = new PluginManager({
      registry,
      logger,
      messageBus,
    });

    // Register note context plugin
    const notePlugin = registerNoteContext();
    pluginManager.registerPlugin(notePlugin);
  });

  test("should initialize plugin", async () => {
    // Initialize plugins
    await pluginManager.initializePlugins();

    // Verify plugin is initialized
    expect(pluginManager.isPluginInitialized("note-context")).toBe(true);

    // Verify message handlers are registered
    expect(messageBus.hasHandlers("note.create")).toBe(true);
    expect(messageBus.hasHandlers("note.get")).toBe(true);
  });

  test("should create note via message", async () => {
    // Initialize plugins
    await pluginManager.initializePlugins();

    // Create test message
    const message = {
      id: "test-id",
      timestamp: new Date().toISOString(),
      type: "note.create",
      payload: {
        title: "Test Note",
        content: "This is a test note",
        tags: ["test"],
      },
    };

    // Send message
    const response = await messageBus.publish(message);

    // Verify response
    expect(response).toBeDefined();
    expect(response?.success).toBe(true);
    expect(response?.data).toHaveProperty("id");
    expect(response?.data.title).toBe("Test Note");
  });
});
```

### App Integration Tests

Test the entire application:

```typescript
// Application integration test
describe("App Integration", () => {
  let app: App;

  beforeEach(async () => {
    // Use in-memory database for tests
    process.env.DB_PATH = ":memory:";

    // Create app
    app = new App({
      debug: true,
      dbPath: ":memory:",
      matrixEnabled: false,
    });

    // Start app
    await app.start();
  });

  afterEach(async () => {
    // Stop app
    await app.stop();
  });

  test("should create and retrieve note", async () => {
    // Get MCP server
    const mcpServer = app.getMcpServer();

    // Create note message
    const createMessage = {
      id: "test-id",
      tool_calls: [
        {
          name: "create-note",
          arguments: {
            title: "Test Note",
            content: "This is a test note",
            tags: ["test"],
          },
        },
      ],
    };

    // Send message
    const createResponse = await mcpServer.handleMessage(createMessage);

    // Verify response
    expect(createResponse.success).toBe(true);
    expect(createResponse.result).toHaveProperty("id");

    // Get note ID
    const noteId = createResponse.result.id;

    // Create get note message
    const getMessage = {
      id: "test-id-2",
      tool_calls: [
        {
          name: "get-note",
          arguments: {
            id: noteId,
          },
        },
      ],
    };

    // Send message
    const getResponse = await mcpServer.handleMessage(getMessage);

    // Verify response
    expect(getResponse.success).toBe(true);
    expect(getResponse.result.id).toBe(noteId);
    expect(getResponse.result.title).toBe("Test Note");
  });
});
```

## Mock Utilities

Create minimal mock utilities for testing:

```typescript
// src/testing/mocks.ts
/**
 * Create a mock logger
 */
export function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * Create a mock database
 */
export function createMockDatabase() {
  return {
    insert: jest.fn().mockResolvedValue({ rowCount: 1 }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            offset: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    delete: jest.fn().mockResolvedValue({ rowCount: 1 }),
  };
}

/**
 * Create a mock embedding service
 */
export function createMockEmbeddingService() {
  return {
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    calculateSimilarity: jest.fn().mockResolvedValue(0.8),
  };
}

/**
 * Create a mock tagging service
 */
export function createMockTaggingService() {
  return {
    generateTags: jest.fn().mockResolvedValue(["tag1", "tag2"]),
  };
}
```

## Test Organization

Organize tests by package and component:

```
packages/skeleton/test/
├── registry/
│   └── registry.test.ts
├── plugins/
│   └── pluginManager.test.ts
├── entity/
│   ├── entityRegistry.test.ts
│   └── entityService.test.ts
├── db/
│   └── schema.test.ts
└── messaging/
    └── messageBus.test.ts

packages/note-context/test/
├── entity/
│   ├── noteAdapter.test.ts
│   └── noteEntity.test.ts
└── plugin.test.ts

apps/personal-brain/test/
└── integration.test.ts
```

## Test Configuration

Configure Jest for each package:

```javascript
// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.ts"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

## Running Tests

Run tests for all packages:

```bash
pnpm test
```

Run tests for a specific package:

```bash
pnpm --filter "@brains/skeleton" test
```

Run a specific test:

```bash
pnpm --filter "@brains/skeleton" test -- -t "EntityRegistry"
```

## Creating Test Data

Use factory functions to create test data:

```typescript
// Test factories
/**
 * Create a test note
 */
export function createTestNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "test-note-id",
    entityType: "note",
    title: "Test Note",
    content: "This is a test note",
    tags: ["test"],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    toMarkdown: () =>
      `# ${overrides.title || "Test Note"}\n\n${overrides.content || "This is a test note"}`,
    ...overrides,
  };
}

/**
 * Create a test profile
 */
export function createTestProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "test-profile-id",
    entityType: "profile",
    name: "Test Profile",
    bio: "This is a test profile",
    tags: ["test"],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    toMarkdown: () =>
      `# ${overrides.name || "Test Profile"}\n\n${overrides.bio || "This is a test profile"}`,
    ...overrides,
  };
}
```

## Test Best Practices

1. **Test Behavior**: Focus on what components do, not how they do it
2. **Use Descriptive Names**: Test names should describe behavior, not implementation
3. **Arrange-Act-Assert**: Structure tests with clear phases
4. **Minimal Setup**: Keep setup code minimal and focused
5. **Avoid Implementation Details**: Don't test private methods or internal state
6. **Test Edge Cases**: Include error handling and edge cases
7. **Independent Tests**: Tests should not depend on each other
8. **Avoid Test Duplication**: Don't repeat the same test logic
9. **Clean Up**: Reset state between tests

## Example Test Case

Here's a complete example of a behavior-based test:

```typescript
import { EntityService } from "../src/entity/entityService";
import { createTestNote } from "./helpers";
import {
  createMockEntityRegistry,
  createMockDatabase,
  createMockEmbeddingService,
  createMockTaggingService,
  createMockLogger,
} from "./mocks";

describe("EntityService", () => {
  // Arrange - Set up test environment
  let service: EntityService;
  let registry: any;
  let db: any;
  let embeddingService: any;
  let taggingService: any;
  let logger: any;

  beforeEach(() => {
    // Create fresh mocks for each test
    registry = createMockEntityRegistry();
    db = createMockDatabase();
    embeddingService = createMockEmbeddingService();
    taggingService = createMockTaggingService();
    logger = createMockLogger();

    // Create service under test
    service = new EntityService(
      registry,
      db,
      embeddingService,
      taggingService,
      logger,
    );
  });

  describe("saveEntity", () => {
    test("should save entity with generated embedding", async () => {
      // Arrange
      const note = createTestNote();
      const mockMarkdown = "# Test Note\n\nThis is a test note";
      const mockEmbedding = [0.1, 0.2, 0.3];

      // Mock dependencies
      registry.entityToMarkdown.mockReturnValue(mockMarkdown);
      embeddingService.embed.mockResolvedValue(mockEmbedding);

      // Act
      const result = await service.saveEntity(note);

      // Assert
      // Verify the result
      expect(result).toEqual(note);

      // Verify the markdown was generated
      expect(registry.entityToMarkdown).toHaveBeenCalledWith(note);

      // Verify embedding was generated
      expect(embeddingService.embed).toHaveBeenCalledWith(mockMarkdown);

      // Verify entity was saved to database
      expect(db.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: note.id,
          entityType: note.entityType,
          markdown: mockMarkdown,
        }),
      );

      // Verify embedding was saved
      expect(db.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          entityId: note.id,
          embedding: mockEmbedding,
        }),
      );
    });

    test("should generate tags if not provided", async () => {
      // Arrange
      const note = createTestNote({ tags: [] });
      const mockTags = ["generated", "tags"];

      // Mock tagging service
      taggingService.generateTags.mockResolvedValue(mockTags);

      // Act
      const result = await service.saveEntity(note);

      // Assert
      expect(result.tags).toEqual(mockTags);
      expect(taggingService.generateTags).toHaveBeenCalled();
    });

    test("should handle errors during save", async () => {
      // Arrange
      const note = createTestNote();

      // Mock database error
      db.insert.mockRejectedValue(new Error("Database error"));

      // Act & Assert
      await expect(service.saveEntity(note)).rejects.toThrow("Database error");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // More test cases...
});
```
