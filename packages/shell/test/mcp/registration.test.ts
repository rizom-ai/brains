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
      } as unknown as EntityService,
      schemaRegistry: {
        getAllSchemaNames: mock(() => ["entity", "message"]),
        get: mock((name: string) => {
          // Return a simple schema for any requested name
          if (name === "entity" || name === "message") {
            return z.object({
              id: z.string(),
              content: z.string(),
            });
          }
          return undefined;
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
    expect(mockServer.tool).toHaveBeenCalledTimes(6); // 6 tools total

    // Verify tool names
    const toolNames = Array.from(mockToolHandlers.keys());
    expect(toolNames).toContain("brain_query");
    expect(toolNames).toContain("entity_search");
    expect(toolNames).toContain("entity_get");
    expect(toolNames).toContain("generate_content");
    expect(toolNames).toContain("generate_from_template");
    expect(toolNames).toContain("list_content_templates");
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

    // Get the brain_query tool handler
    const queryHandler = mockToolHandlers.get("brain_query");
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

    // Get the generate_content tool handler
    const generateHandler = mockToolHandlers.get("generate_content");
    expect(generateHandler).toBeDefined();
    if (!generateHandler || typeof generateHandler !== "function") {
      throw new Error("Generate handler not found or not a function");
    }

    // Execute the tool with parameters
    const result = await generateHandler({
      prompt: "Generate test content",
      schemaName: "entity",
    });

    // Check that the adapter properly called the content generation service
    expect(mockServices.contentGenerationService.generate).toHaveBeenCalled();

    // Check the result format
    expect(result.content[0].type).toBe("text");
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.content).toBe("Generated content");
  });

  it("should handle list_content_templates tool execution", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Get the list_content_templates tool handler
    const listHandler = mockToolHandlers.get("list_content_templates");
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
