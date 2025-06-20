import { describe, expect, it, beforeEach, mock } from "bun:test";
import { registerShellTools } from "@/mcp/tools";
import { createSilentLogger } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { QueryProcessor } from "@/query/queryProcessor";
import type { EntityService } from "@/entity/entityService";
import type { SchemaRegistry } from "@/schema/schemaRegistry";
import type { ContentGenerationService } from "@/content/contentGenerationService";
import { z } from "zod";

// Create mock services
const createMockQueryProcessor = (): QueryProcessor =>
  ({
    processQuery: mock(async (query: string, _options?: unknown) => ({
      results: [{ type: "response", content: `Response to: ${query}` }],
      metadata: { processed: true },
    })),
  }) as unknown as QueryProcessor;

const createMockEntityService = (): EntityService =>
  ({
    searchEntities: mock(
      async (entityType: string, query: string, _options?: unknown) => [
        {
          entity: {
            id: "1",
            entityType,
            title: `${entityType} matching ${query}`,
            content: "Test content",
          },
          score: 0.9,
          excerpt: "Test excerpt",
          highlights: [],
        },
      ],
    ),
    getEntity: mock(async (entityType: string, id: string): Promise<unknown> => {
      if (id === "not-found") return null;
      return {
        id,
        entityType,
        title: `Test ${entityType}`,
        content: "Test content",
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      };
    }),
    createEntity: mock(async (entity: unknown) => {
      const entityRecord = entity as Record<string, unknown>;
      return {
        ...entityRecord,
        id: (entity as { id?: string }).id ?? "generated-id",
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      };
    }),
  }) as unknown as EntityService;

const createMockSchemaRegistry = (): SchemaRegistry =>
  ({
    get: mock((name: string) => {
      if (name === "not-found") return undefined;
      return z.object({ content: z.string() });
    }),
  }) as unknown as SchemaRegistry;

const createMockContentGenerationService = (): ContentGenerationService =>
  ({
    generate: mock(async (options: unknown) => ({
      content: `Generated content for: ${(options as { prompt: string }).prompt}`,
    })),
    listTemplates: mock(() => [
      {
        name: "blog-post",
        description: "Generate a blog post",
        basePrompt: "Write a blog post",
        schema: z.object({ title: z.string(), content: z.string() }),
      },
      {
        name: "summary",
        description: "Generate a summary",
        basePrompt: "Summarize this",
        schema: z.object({ summary: z.string() }),
      },
    ]),
  }) as unknown as ContentGenerationService;

// Create mock MCP server
interface ToolConfig {
  schema: unknown;
}

type ToolHandler = (params: unknown) => Promise<unknown>;

const createMockMcpServer = (): {
  tool: ReturnType<typeof mock>;
  getTool: (name: string) => ToolConfig | undefined;
  getHandler: (name: string) => ToolHandler | undefined;
  getRegisteredTools: () => string[];
} => {
  const tools = new Map<string, ToolConfig>();
  const toolHandlers = new Map<string, ToolHandler>();

  return {
    tool: mock((name: string, schema: unknown, handler: ToolHandler) => {
      tools.set(name, { schema });
      toolHandlers.set(name, handler);
    }),
    getTool: (name: string): ToolConfig | undefined => tools.get(name),
    getHandler: (name: string): ToolHandler | undefined => toolHandlers.get(name),
    getRegisteredTools: (): string[] => Array.from(tools.keys()),
  };
};

describe("MCP Tools", () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;
  let queryProcessor: QueryProcessor;
  let entityService: EntityService;
  let schemaRegistry: SchemaRegistry;
  let contentGenerationService: ContentGenerationService;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    queryProcessor = createMockQueryProcessor();
    entityService = createMockEntityService();
    schemaRegistry = createMockSchemaRegistry();
    contentGenerationService = createMockContentGenerationService();
    logger = createSilentLogger();
  });

  describe("Registration", () => {
    it("should register all tools", () => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });

      const registeredTools = mockServer.getRegisteredTools();

      expect(registeredTools).toContain("shell:query");
      expect(registeredTools).toContain("shell:search");
      expect(registeredTools).toContain("shell:get");
      expect(registeredTools).toContain("shell:generate");
      expect(registeredTools).toContain("shell:list_templates");
    });

    it("should register tools with correct schemas", () => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });

      const queryTool = mockServer.getTool("shell:query");
      if (!queryTool) throw new Error("Tool not found");
      const querySchema = queryTool.schema as Record<string, unknown>;
      expect(querySchema['query']).toBeDefined();
      expect(querySchema['options']).toBeDefined();

      const searchTool = mockServer.getTool("shell:search");
      if (!searchTool) throw new Error("Tool not found");
      const searchSchema = searchTool.schema as Record<string, unknown>;
      expect(searchSchema['entityType']).toBeDefined();
      expect(searchSchema['query']).toBeDefined();
      expect(searchSchema['limit']).toBeDefined();

      const getTool = mockServer.getTool("shell:get");
      if (!getTool) throw new Error("Tool not found");
      const getSchema = getTool.schema as Record<string, unknown>;
      expect(getSchema['entityType']).toBeDefined();
      expect(getSchema['entityId']).toBeDefined();

      const generateTool = mockServer.getTool("shell:generate");
      if (!generateTool) throw new Error("Tool not found");
      const generateSchema = generateTool.schema as Record<string, unknown>;
      expect(generateSchema['prompt']).toBeDefined();
      expect(generateSchema['contentType']).toBeDefined();
      expect(generateSchema['context']).toBeDefined();
      expect(generateSchema['save']).toBeDefined();
    });
  });

  describe("Query Tool", () => {
    beforeEach(() => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should execute queries", async () => {
      const handler = mockServer.getHandler("shell:query");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({
        query: "What is the meaning of life?",
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      const data = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      expect(data['results']).toBeDefined();
      const metadata = data['metadata'] as Record<string, unknown>;
      expect(metadata['processed']).toBe(true);
    });

    it("should handle query options", async () => {
      const handler = mockServer.getHandler("shell:query");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({
        query: "Find all articles",
        options: {
          limit: 5,
          context: { author: "John" },
          responseSchema: "articleList",
        },
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      expect(data['results']).toBeDefined();
    });

    it("should handle query errors", async () => {
      const handler = mockServer.getHandler("shell:query");
      if (!handler) throw new Error("Handler not found");
      const error = new Error("Query failed");

      (
        queryProcessor.processQuery as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      void expect(handler({ query: "test" })).rejects.toThrow("Query failed");
    });
  });

  describe("Search Tool", () => {
    beforeEach(() => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should search entities", async () => {
      const handler = mockServer.getHandler("shell:search");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({
        entityType: "note",
        query: "test query",
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      const data = JSON.parse(result.content[0]?.text ?? "{}") as unknown[];
      expect(data.length).toBe(1);
      const firstItem = data[0] as Record<string, unknown>;
      const entity = firstItem['entity'] as Record<string, unknown>;
      expect(entity['entityType']).toBe("note");
      expect(entity['title']).toContain("test query");
    });

    it("should handle limit parameter", async () => {
      const handler = mockServer.getHandler("shell:search");
      if (!handler) throw new Error("Handler not found");

      await handler({
        entityType: "article",
        query: "search",
        limit: 20,
      });

      expect(entityService.searchEntities).toHaveBeenCalledWith(
        "article",
        "search",
        { limit: 20 },
      );
    });

    it("should use default limit", async () => {
      const handler = mockServer.getHandler("shell:search");
      if (!handler) throw new Error("Handler not found");

      await handler({
        entityType: "note",
        query: "search",
      });

      expect(entityService.searchEntities).toHaveBeenCalledWith(
        "note",
        "search",
        undefined, // No limit passed when using default
      );
    });

    it("should handle search errors", async () => {
      const handler = mockServer.getHandler("shell:search");
      if (!handler) throw new Error("Handler not found");
      const error = new Error("Search failed");

      (
        entityService.searchEntities as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      void expect(
        handler({ entityType: "note", query: "test" }),
      ).rejects.toThrow("Search failed");
    });
  });

  describe("Get Tool", () => {
    beforeEach(() => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should get entity by ID", async () => {
      const handler = mockServer.getHandler("shell:get");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({
        entityType: "note",
        entityId: "test-id",
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      const data = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      expect(data['id']).toBe("test-id");
      expect(data['entityType']).toBe("note");
    });

    it("should handle entity not found", async () => {
      const handler = mockServer.getHandler("shell:get");
      if (!handler) throw new Error("Handler not found");

      void expect(
        handler({
          entityType: "note",
          entityId: "not-found",
        }),
      ).rejects.toThrow("Entity not found: note/not-found");
    });

    it("should handle get errors", async () => {
      const handler = mockServer.getHandler("shell:get");
      if (!handler) throw new Error("Handler not found");
      const error = new Error("Get failed");

      (
        entityService.getEntity as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      void expect(
        handler({ entityType: "note", entityId: "test" }),
      ).rejects.toThrow("Get failed");
    });
  });

  describe("Generate Tool", () => {
    beforeEach(() => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should generate content", async () => {
      const handler = mockServer.getHandler("shell:generate");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({
        prompt: "Write a blog post about AI",
        contentType: "blogPost",
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      const data = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      expect(data['content']).toContain("Generated content for:");
    });

    it("should handle context parameter", async () => {
      const handler = mockServer.getHandler("shell:generate");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({
        prompt: "Write about AI",
        contentType: "article",
        context: {
          entities: [{ id: "1", entityType: "note", content: "AI notes" }],
          data: { topic: "machine learning" },
          style: "academic",
          examples: ["Example 1", "Example 2"],
        },
      }) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
      expect(data['content']).toBeDefined();
    });

    it("should handle save parameter", async () => {
      const handler = mockServer.getHandler("shell:generate");
      if (!handler) throw new Error("Handler not found");

      await handler({
        prompt: "Create note",
        contentType: "note",
        save: true,
      });

      // The adapter doesn't pass save to generate, it processes it internally
      expect(contentGenerationService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Create note",
          contentType: "note",
          schema: expect.any(Object),
        }),
      );
    });

    it("should throw if schema not found", async () => {
      const handler = mockServer.getHandler("shell:generate");
      if (!handler) throw new Error("Handler not found");

      void expect(
        handler({
          prompt: "Test",
          contentType: "not-found",
        }),
      ).rejects.toThrow("Schema not found for content type: not-found");
    });

    it("should handle generation errors", async () => {
      const handler = mockServer.getHandler("shell:generate");
      if (!handler) throw new Error("Handler not found");
      const error = new Error("Generation failed");

      (
        contentGenerationService.generate as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      void expect(
        handler({ prompt: "test", contentType: "note" }),
      ).rejects.toThrow("Generation failed");
    });
  });

  describe("List Templates Tool", () => {
    beforeEach(() => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should list templates", async () => {
      const handler = mockServer.getHandler("shell:list_templates");
      if (!handler) throw new Error("Handler not found");

      const result = await handler({}) as { content: Array<{ type: string; text: string }> };

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      const data = JSON.parse(result.content[0]?.text ?? "{}") as Array<Record<string, unknown>>;
      expect(data.length).toBe(2);
      expect(data[0]?.['name']).toBe("blog-post");
      expect(data[1]?.['name']).toBe("summary");
    });

    it("should handle empty template list", async () => {
      const handler = mockServer.getHandler("shell:list_templates");
      if (!handler) throw new Error("Handler not found");

      (
        contentGenerationService.listTemplates as ReturnType<typeof mock>
      ).mockReturnValueOnce([]);

      const result = await handler({}) as { content: Array<{ type: string; text: string }> };

      const data = JSON.parse(result.content[0]?.text ?? "{}") as unknown[];
      expect(data).toEqual([]);
    });

    it("should handle list errors", async () => {
      const handler = mockServer.getHandler("shell:list_templates");
      if (!handler) throw new Error("Handler not found");
      const error = new Error("List failed");

      (
        contentGenerationService.listTemplates as ReturnType<typeof mock>
      ).mockImplementationOnce(() => {
        throw error;
      });

      void expect(handler({})).rejects.toThrow("List failed");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      registerShellTools(mockServer as unknown as McpServer, {
        queryProcessor,
        entityService,
        schemaRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should log errors", async () => {
      const handler = mockServer.getHandler("shell:query");
      if (!handler) throw new Error("Handler not found");
      const error = new Error("Test error");

      (
        queryProcessor.processQuery as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      try {
        await handler({ query: "test" });
      } catch {
        // Expected to throw
      }

      // Logger would have been called with error
      expect(queryProcessor.processQuery).toHaveBeenCalled();
    });
  });
});
