/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, mock } from "bun:test";
import { registerShellMCP } from "@/mcp";
import type { ShellMCPOptions } from "@/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
      tool: mock((name: string, _schema: any, handler: any) => {
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
      } as any,
      entityService: {
        getSupportedEntityTypes: mock(() => ["note", "task"]),
        getEntityTypes: mock(() => ["note", "task"]),
        searchEntities: mock(() => Promise.resolve([])),
        getEntity: mock(() =>
          Promise.resolve({ id: "1", type: "note", content: "Test" }),
        ),
      } as any,
      schemaRegistry: {
        getAllSchemaNames: mock(() => ["entity", "message"]),
        get: mock(() => undefined),
      } as any,
      logger: {
        info: mock(() => {}),
        debug: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {}),
      } as any,
    };
  });

  it("should register shell tools with MCP server", () => {
    // Register shell with MCP
    registerShellMCP(mockServer as unknown as McpServer, mockServices);

    // Check that tools were registered
    expect(mockServer.tool).toHaveBeenCalledTimes(3); // 3 tools (removed brain_command)

    // Verify tool names
    const toolNames = Array.from(mockToolHandlers.keys());
    expect(toolNames).toContain("brain_query");
    expect(toolNames).toContain("entity_search");
    expect(toolNames).toContain("entity_get");
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

});
