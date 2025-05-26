import { describe, expect, it, beforeEach, mock } from "bun:test";
import { Shell } from "@/shell";
import { createSilentLogger, type Logger } from "@personal-brain/utils";
import type { PluginCapabilities } from "@brains/types";
import { Registry } from "@/registry/registry";
import { EntityRegistry } from "@/entity/entityRegistry";
import { SchemaRegistry } from "@/schema/schemaRegistry";
import { MessageBus } from "@/messaging/messageBus";
import { PluginManager } from "@/plugins/pluginManager";
import { EntityService } from "@/entity/entityService";
import { QueryProcessor } from "@/query/queryProcessor";
import { BrainProtocol } from "@/protocol/brainProtocol";
import type { MCPServer } from "@brains/mcp-server";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { IEmbeddingService } from "@/embedding/embeddingService";
import type { AIService } from "@/ai/aiService";
import { defaultQueryResponseSchema } from "@/schemas/defaults";
import type { ShellConfig } from "@/config";
import type { ShellDependencies } from "@/shell";

// Create a mock embedding service
const mockEmbeddingService: IEmbeddingService = {
  generateEmbedding: async () => new Float32Array(384).fill(0.1),
  generateEmbeddings: async (texts: string[]) =>
    texts.map(() => new Float32Array(384).fill(0.1)),
};

// Create a mock MCP server
const createMockMCPServer = (): MCPServer => {
  const mockServer = {
    tool: mock(() => {}),
    resource: mock(() => {}),
    prompt: mock(() => {}),
    connect: mock(() => Promise.resolve()),
    close: mock(() => Promise.resolve()),
  };

  return {
    getServer: () => mockServer,
    startStdio: mock(() => Promise.resolve()),
    stop: mock(() => {}),
  } as unknown as MCPServer;
};

// Create a mock EntityService
const createMockEntityService = (): EntityService =>
  ({
    // CRUD operations
    createEntity: mock(async (entity) => ({ ...entity, id: "test-id" })),
    getEntity: mock(async () => null),
    updateEntity: mock(async (entity) => entity),
    deleteEntity: mock(async () => {}),

    // List and search
    listEntities: mock(async () => []),
    search: mock(async () => []), // Return empty array to avoid database queries
    searchByTags: mock(async () => []),

    // Entity type management
    getEntityTypes: mock(() => ["note", "task"]),
    getAllEntityTypes: mock(() => ["note", "task"]),
    getSupportedEntityTypes: mock(() => ["note", "task"]),
    getAdapter: mock(() => ({
      entityType: "note",
      schema: {},
      fromMarkdown: mock(() => ({})),
      toMarkdown: mock(() => ""),
    })),
  }) as unknown as EntityService;

// Create a mock AI service
const createMockAIService = (): AIService =>
  ({
    generateObject: mock(async (_systemPrompt, _userPrompt, schema) => {
      const mockData = defaultQueryResponseSchema.parse({
        answer: "This is a test response",
        summary: "Test summary",
        topics: ["test"],
      });
      return {
        object: schema.parse(mockData),
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };
    }),
    generateText: mock(async () => ({
      text: "Test response",
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    })),
    updateConfig: mock(),
    getConfig: mock(() => ({})),
  }) as unknown as AIService;

// Mock database for testing
function createMockDatabase(): LibSQLDatabase<Record<string, never>> {
  // Create a chainable query builder mock
  const createQueryBuilder = (): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      from: mock(() => builder),
      where: mock(() => builder),
      limit: mock(() => builder),
      offset: mock(() => builder),
      orderBy: mock(() => builder),
      leftJoin: mock(() => builder),
      innerJoin: mock(() => builder),
      groupBy: mock(() => builder),
      having: mock(() => builder),
      returning: mock(() => []),
      execute: mock(() => Promise.resolve([])),
      all: mock(() => Promise.resolve([])),
      get: mock(() => Promise.resolve(undefined)),
      values: mock(() => builder),
      set: mock(() => builder),
      then: mock((resolve: (value: unknown) => void) => resolve([])),
    };
    return builder;
  };

  return {
    // Mock common database methods used by Shell
    select: mock(() => createQueryBuilder()),
    insert: mock(() => createQueryBuilder()),
    update: mock(() => createQueryBuilder()),
    delete: mock(() => createQueryBuilder()),
    transaction: mock((fn: (tx: unknown) => unknown) =>
      fn({
        select: mock(() => createQueryBuilder()),
        insert: mock(() => createQueryBuilder()),
        update: mock(() => createQueryBuilder()),
        delete: mock(() => createQueryBuilder()),
      }),
    ),
    execute: mock(() => Promise.resolve({ rows: [], rowsAffected: 0 })),
    run: mock(() => Promise.resolve({ rowsAffected: 0 })),
    all: mock(() => Promise.resolve({ rows: [] })),
    get: mock(() => Promise.resolve({ row: undefined })),
  } as unknown as LibSQLDatabase<Record<string, never>>;
}

// Helper to create a test shell with mocks
function createTestShell(configOverrides: Partial<ShellConfig> = {}): {
  shell: Shell;
  db: LibSQLDatabase<Record<string, never>>;
  logger: Logger;
  dependencies: ShellDependencies;
} {
  const db = createMockDatabase();
  const logger = createSilentLogger();

  const config: Partial<ShellConfig> = {
    ai: {
      apiKey: "test-key",
      provider: "anthropic" as const,
      model: "claude-3-haiku-20240307",
      temperature: 0.7,
      maxTokens: 1000,
    },
    features: {
      runMigrationsOnInit: false, // Disable migrations for tests
      enablePlugins: true,
    },
    ...configOverrides,
  };

  const dependencies: ShellDependencies = {
    db,
    logger,
    embeddingService: mockEmbeddingService,
    aiService: createMockAIService(),
    mcpServer: createMockMCPServer(),
    entityService: createMockEntityService(),
  };

  return {
    shell: Shell.createFresh(config, dependencies),
    db,
    logger,
    dependencies,
  };
}

describe("Shell", () => {
  beforeEach(() => {
    // Reset all singletons before each test
    Shell.resetInstance();
    Registry.resetInstance();
    EntityRegistry.resetInstance();
    SchemaRegistry.resetInstance();
    MessageBus.resetInstance();
    PluginManager.resetInstance();
    EntityService.resetInstance();
    QueryProcessor.resetInstance();
    BrainProtocol.resetInstance();
  });

  describe("initialization", () => {
    it("should start uninitialized", () => {
      const { shell } = createTestShell();

      expect(shell.isInitialized()).toBe(false);

      shell.shutdown();
    });

    it("should initialize successfully", async () => {
      const { shell } = createTestShell();

      await shell.initialize();
      expect(shell.isInitialized()).toBe(true);

      shell.shutdown();
    });
  });

  describe("query processing", () => {
    it("should process queries after initialization", async () => {
      const { shell } = createTestShell();
      await shell.initialize();

      const result = await shell.query("test query");
      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();

      shell.shutdown();
    });

    it("should reject queries before initialization", async () => {
      const { shell } = createTestShell();

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(shell.query("test query")).rejects.toThrow(
        "Shell not initialized",
      );

      shell.shutdown();
    });

    it("should process queries with options", async () => {
      const { shell } = createTestShell();
      await shell.initialize();

      const result = await shell.query("test query", {
        userId: "test-user",
        conversationId: "test-convo",
      });

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();

      shell.shutdown();
    });
  });

  describe("plugin registration", () => {
    it("should register plugins after initialization", async () => {
      const { shell } = createTestShell();
      await shell.initialize();

      const mockPlugin = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        register: async (): Promise<PluginCapabilities> => ({
          tools: [],
          resources: [],
        }),
      };

      // Should not throw
      shell.registerPlugin(mockPlugin);

      shell.shutdown();
    });

    it("should reject plugin registration before initialization", () => {
      const { shell } = createTestShell();

      const mockPlugin = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        register: async (): Promise<PluginCapabilities> => ({
          tools: [],
          resources: [],
        }),
      };

      expect(() => shell.registerPlugin(mockPlugin)).toThrow(
        "Shell not initialized",
      );

      shell.shutdown();
    });
  });

  describe("shutdown", () => {
    it("should clean up resources on shutdown", async () => {
      const { shell } = createTestShell();
      await shell.initialize();

      shell.shutdown();
      expect(shell.isInitialized()).toBe(false);
    });

    it("should reject operations after shutdown", async () => {
      const { shell } = createTestShell();
      await shell.initialize();
      shell.shutdown();

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(shell.query("test")).rejects.toThrow(
        "Shell not initialized",
      );
    });
  });
});
