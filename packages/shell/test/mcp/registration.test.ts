import { describe, expect, it, beforeEach, mock } from "bun:test";
import { registerShellMCP } from "@/mcp";
import type { ShellMCPOptions } from "@/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { QueryProcessor } from "@/query/queryProcessor";
import type { EntityService } from "@/entity/entityService";
import type { SchemaRegistry } from "@/schema/schemaRegistry";
import type { ContentGenerationService } from "@/content/contentGenerationService";
import type { Logger } from "@brains/utils";
import { z } from "zod";

describe("MCP Registration", () => {
  let mockToolHandlers: Map<string, unknown>;
  let mockResourceHandlers: Map<string, unknown>;
  let mockServer: {
    tool: ReturnType<typeof mock>;
    resource: ReturnType<typeof mock>;
  };
  let mockServices: ShellMCPOptions;

  beforeEach(() => {
    // Create maps to store registered handlers
    mockToolHandlers = new Map();
    mockResourceHandlers = new Map();

    // Create mock MCP server
    mockServer = {
      tool: mock((name: string, _schema: unknown, handler: unknown) => {
        mockToolHandlers.set(name, handler);
      }),
      resource: mock(
        (
          name: string,
          _template: string,
          _metadata: unknown,
          handler: unknown,
        ) => {
          mockResourceHandlers.set(name, handler);
        },
      ),
    };

    // Create mock services that satisfy ShellMCPOptions
    mockServices = {
      queryProcessor: {
        processQuery: mock(() =>
          Promise.resolve({
            answer: "Test answer",
            citations: [],
            relatedEntities: [],
          }),
        ),
      } as unknown as QueryProcessor,
      entityService: {
        getSupportedEntityTypes: mock(() => ["note", "task"]),
        getEntityTypes: mock(() => ["note", "task"]),
        searchEntities: mock(() => Promise.resolve([])),
        getEntity: mock(() =>
          Promise.resolve({ id: "1", type: "note", content: "Test" }),
        ),
        createEntity: mock(() =>
          Promise.resolve({
            id: "saved-entity-123",
            entityType: "note",
            content: "",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          }),
        ),
        deriveEntity: mock(() =>
          Promise.resolve({ id: "2", entityType: "note", content: "Derived" }),
        ),
      } as unknown as EntityService,
      schemaRegistry: {
        getAllSchemaNames: mock(() => ["entity", "message"]),
        get: mock((_name: string) => {
          // Return a simple schema for any requested name
          // This includes custom content types for testing
          return z.object({
            id: z.string(),
            content: z.string(),
          });
        }),
      } as unknown as SchemaRegistry,
      contentGenerationService: {
        generate: mock(() => Promise.resolve({ content: "Generated content" })),
        generateFromTemplate: mock(() =>
          Promise.resolve({ content: "Template content" }),
        ),
        listTemplates: mock(() => [
          {
            name: "test-template",
            description: "Test template",
            schema: {} as unknown,
            basePrompt: "Test prompt",
          },
        ]),
      } as unknown as ContentGenerationService,
      logger: {
        info: mock(() => {}),
        debug: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {}),
      } as unknown as Logger,
    };
  });

  it("should register shell tools with MCP server", () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Check that tools were registered
    expect(mockServer.tool).toHaveBeenCalledTimes(5); // 5 tools total

    // Verify tool names
    const toolNames = Array.from(mockToolHandlers.keys());
    expect(toolNames).toContain("shell:query");
    expect(toolNames).toContain("shell:search");
    expect(toolNames).toContain("shell:get");
    expect(toolNames).toContain("shell:generate");
    // generate_from_template was removed as redundant
    expect(toolNames).toContain("shell:list_templates");
  });

  it("should register shell resources with MCP server", () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Check that resources were registered
    const resourceNames = Array.from(mockResourceHandlers.keys());

    expect(resourceNames).toContain("entity-types");
    expect(resourceNames).toContain("schema-list");
    expect(resourceNames).toContain("entity_note");
    expect(resourceNames).toContain("entity_task");
    expect(resourceNames).toContain("schema_entity");
    expect(resourceNames).toContain("schema_message");
    expect(resourceNames).toContain("content-templates");
    expect(resourceNames).toContain("template_test-template");
  });

  it("should handle tool execution through adapters", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Get the shell:query tool handler
    const queryHandler = mockToolHandlers.get("shell:query");
    expect(queryHandler).toBeDefined();
    if (!queryHandler || typeof queryHandler !== "function") {
      throw new Error("Query handler not found or not a function");
    }

    // Execute the tool with parameters directly
    const result = await queryHandler({
      query: "test query",
      options: { limit: 10 },
    });

    // Check that the adapter properly called the query processor
    expect(mockServices.queryProcessor.processQuery).toHaveBeenCalled();

    // Check the result format
    expect(result.content[0].type).toBe("text");
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.answer).toBe("Test answer");
  });

  it("should handle content generation tool execution", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Get the shell:generate tool handler
    const generateHandler = mockToolHandlers.get("shell:generate");
    expect(generateHandler).toBeDefined();
    if (!generateHandler || typeof generateHandler !== "function") {
      throw new Error("Generate handler not found or not a function");
    }

    // Execute the tool with parameters
    const result = await generateHandler({
      prompt: "Generate test content",
      contentType: "entity",
    });

    // Check that the adapter properly called the content generation service
    expect(mockServices.contentGenerationService.generate).toHaveBeenCalled();

    // Check the result format
    expect(result.content[0].type).toBe("text");
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.content).toBe("Generated content");
  });

  it("should handle content generation with save=true", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Get the shell:generate tool handler
    const generateHandler = mockToolHandlers.get("shell:generate");
    expect(generateHandler).toBeDefined();
    if (!generateHandler || typeof generateHandler !== "function") {
      throw new Error("Generate handler not found or not a function");
    }

    // Mock entity service for save functionality
    mockServices.entityService.createEntity = mock(() =>
      Promise.resolve({
        id: "saved-entity-123",
        entityType: "note",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
    ) as unknown as typeof mockServices.entityService.createEntity;

    // Execute the tool with save=true
    const result = await generateHandler({
      prompt: "Generate and save test content",
      contentType: "entity",
      save: true,
    });

    // Check that content generation service was called (saving is handled internally)
    expect(mockServices.contentGenerationService.generate).toHaveBeenCalled();

    // Check the result format - should be the generated content
    expect(result.content[0].type).toBe("text");
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.content).toBe("Generated content");
  });

  it("should handle content generation with custom contentType", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Get the shell:generate tool handler
    const generateHandler = mockToolHandlers.get("shell:generate");
    expect(generateHandler).toBeDefined();
    if (!generateHandler || typeof generateHandler !== "function") {
      throw new Error("Generate handler not found or not a function");
    }

    // Mock entity service
    mockServices.entityService.createEntity = mock(() =>
      Promise.resolve({
        id: "saved-entity-123",
        entityType: "note",
        content: "",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
    ) as unknown as typeof mockServices.entityService.createEntity;

    // Execute the tool with custom contentType
    await generateHandler({
      prompt: "Generate test content",
      contentType: "custom:type",
      save: true,
    });

    // Check that content generation service was called (saving is handled internally)
    expect(mockServices.contentGenerationService.generate).toHaveBeenCalled();
  });

  it("should handle shell:list_templates tool execution", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Get the shell:list_templates tool handler
    const listHandler = mockToolHandlers.get("shell:list_templates");
    expect(listHandler).toBeDefined();
    if (!listHandler || typeof listHandler !== "function") {
      throw new Error("List handler not found or not a function");
    }

    // Execute the tool
    const result = await listHandler({});

    // Check that the adapter properly called the content generation service
    expect(
      mockServices.contentGenerationService.listTemplates,
    ).toHaveBeenCalled();

    // Check the result format
    expect(result.content[0].type).toBe("text");
    const parsedResult = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsedResult)).toBe(true);
    expect(parsedResult[0].name).toBe("test-template");
  });
});
