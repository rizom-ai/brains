import { describe, expect, it, beforeEach, mock } from "bun:test";
import { registerShellMCP } from "@/mcp";

describe("MCP Registration", () => {
  let mockServer: any;
  let mockServices: any;

  beforeEach(() => {
    // Create mock MCP server
    mockServer = {
      tool: mock(() => {}),
      resource: mock(() => {}),
    };

    // Create mock services
    mockServices = {
      queryProcessor: {
        processQuery: mock(() => Promise.resolve({
          success: true,
          data: { answer: "Test answer" },
          entities: [],
          query: "test query",
        })),
      },
      brainProtocol: {
        executeCommand: mock(() => Promise.resolve({
          id: "123",
          commandId: "123",
          success: true,
          result: "Command executed",
        })),
      },
      entityService: {
        getEntityTypes: mock(() => ["note", "task"]),
        searchEntities: mock(() => Promise.resolve([])),
        getEntity: mock(() => Promise.resolve({ id: "1", type: "note", content: "Test" })),
      },
      schemaRegistry: {
        getAllSchemaNames: mock(() => ["entity", "message"]),
        get: mock(() => undefined),
      },
      logger: {
        info: mock(() => {}),
        debug: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {}),
      },
    };
  });

  it("should register shell tools with MCP server", () => {
    // Register shell with MCP
    registerShellMCP(mockServer, mockServices);

    // Check that tools were registered
    expect(mockServer.tool).toHaveBeenCalledTimes(4); // 4 tools
    
    // Verify tool names
    const toolCalls = mockServer.tool.mock.calls;
    const toolNames = toolCalls.map((call: any[]) => call[0]);
    expect(toolNames).toContain("brain_query");
    expect(toolNames).toContain("brain_command");
    expect(toolNames).toContain("entity_search");
    expect(toolNames).toContain("entity_get");
  });

  it("should register shell resources with MCP server", () => {
    // Register shell with MCP
    registerShellMCP(mockServer, mockServices);

    // Check that resources were registered
    // Should have: entities list, schemas list, plus one for each entity type and schema
    const resourceCalls = mockServer.resource.mock.calls;
    const resourceNames = resourceCalls.map((call: any[]) => call[0]);
    
    expect(resourceNames).toContain("entities");
    expect(resourceNames).toContain("schemas");
    expect(resourceNames).toContain("entity_note");
    expect(resourceNames).toContain("entity_task");
    expect(resourceNames).toContain("schema_entity");
    expect(resourceNames).toContain("schema_message");
  });

  it("should handle tool execution through adapters", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer, mockServices);

    // Get the brain_query tool handler
    const queryToolCall = mockServer.tool.mock.calls.find(
      (call: any[]) => call[0] === "brain_query"
    );
    expect(queryToolCall).toBeDefined();
    
    const queryHandler = queryToolCall[2]; // Third argument is the handler

    // Execute the tool
    const result = await queryHandler({
      params: {
        query: "test query",
        options: { limit: 10 },
      },
    });

    // Check that the adapter properly called the query processor
    expect(mockServices.queryProcessor.processQuery).toHaveBeenCalled();
    
    // Check the result format
    expect(result.content[0].type).toBe("text");
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.data.answer).toBe("Test answer");
  });

  it("should handle command execution through adapters", async () => {
    // Register shell with MCP
    registerShellMCP(mockServer, mockServices);

    // Get the brain_command tool handler
    const commandToolCall = mockServer.tool.mock.calls.find(
      (call: any[]) => call[0] === "brain_command"
    );
    expect(commandToolCall).toBeDefined();
    
    const commandHandler = commandToolCall[2];

    // Execute the tool
    await commandHandler({
      params: {
        command: "help",
        args: ["test"],
        context: { userId: "user123" },
      },
    });

    // Check that the adapter properly called brain protocol
    expect(mockServices.brainProtocol.executeCommand).toHaveBeenCalled();
    
    // Verify the command object was properly constructed
    const commandCall = mockServices.brainProtocol.executeCommand.mock.calls[0];
    const command = commandCall[0];
    expect(command.command).toBe("help");
    expect(command.args).toEqual({ arg0: "test" });
    expect(command.context?.userId).toBe("user123");
  });
});