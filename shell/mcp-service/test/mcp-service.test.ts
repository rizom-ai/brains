import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MCPService } from "../src/mcp-service";
import type { IMessageBus } from "@brains/messaging-service";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool, Resource, ResourceTemplate, Prompt } from "../src/types";

interface ProtocolToolHandlerExtra {
  _meta?: Record<string, unknown>;
}

interface InspectableRegisteredTool {
  handler: (
    params: Record<string, unknown>,
    extra: ProtocolToolHandlerExtra,
  ) => Promise<unknown>;
}

interface InspectableResourceTemplate {
  completeCallback: (
    variable: string,
  ) =>
    | ((
        value: string,
        context?: { arguments?: Record<string, string> },
      ) => string[] | Promise<string[]>)
    | undefined;
}

interface InspectableRegisteredResourceTemplate {
  resourceTemplate: InspectableResourceTemplate;
}

interface InspectableMcpServer {
  _registeredTools: Record<string, InspectableRegisteredTool>;
  _registeredResources: Record<string, unknown>;
  _registeredResourceTemplates: Record<
    string,
    InspectableRegisteredResourceTemplate
  >;
  _registeredPrompts: Record<string, unknown>;
}

function inspectMcpServer(server: McpServer): InspectableMcpServer {
  return server as unknown as InspectableMcpServer;
}

function listProtocolToolNames(server: McpServer): string[] {
  return Object.keys(inspectMcpServer(server)._registeredTools);
}

function listProtocolResourceUris(server: McpServer): string[] {
  return Object.keys(inspectMcpServer(server)._registeredResources);
}

function listProtocolResourceTemplateNames(server: McpServer): string[] {
  return Object.keys(inspectMcpServer(server)._registeredResourceTemplates);
}

function listProtocolPromptNames(server: McpServer): string[] {
  return Object.keys(inspectMcpServer(server)._registeredPrompts);
}

async function callProtocolTool(
  server: McpServer,
  name: string,
  params: Record<string, unknown>,
  extra: ProtocolToolHandlerExtra,
): Promise<unknown> {
  return inspectMcpServer(server)._registeredTools[name]?.handler(
    params,
    extra,
  );
}

describe("MCPService", () => {
  let mcpService: MCPService;
  let mockMessageBus: IMessageBus;

  beforeEach(() => {
    // Reset singleton
    MCPService.resetInstance();

    // Create mock message bus with all required methods
    const unsubscribeFn = mock(() => {});
    const sendMock = mock(() =>
      Promise.resolve({ success: true, data: "test" }),
    ) as IMessageBus["send"];
    mockMessageBus = {
      send: sendMock,
      subscribe: mock(() => unsubscribeFn),
      unsubscribe: mock(() => {}),
    };

    mcpService = MCPService.getInstance(mockMessageBus, createSilentLogger());
  });

  describe("plugin instructions", () => {
    it("returns no instructions before any plugin registers", () => {
      expect(mcpService.getInstructions()).toEqual([]);
    });

    it("collects instructions from plugins in registration order", () => {
      mcpService.registerInstructions("plugin-a", "Always be concise.");
      mcpService.registerInstructions("plugin-b", "Prefer markdown tables.");

      expect(mcpService.getInstructions()).toEqual([
        "Always be concise.",
        "Prefer markdown tables.",
      ]);
    });

    it("replaces a plugin's instructions on re-registration", () => {
      mcpService.registerInstructions("plugin-a", "Old guidance.");
      mcpService.registerInstructions("plugin-a", "New guidance.");

      expect(mcpService.getInstructions()).toEqual(["New guidance."]);
    });
  });

  describe("initialization", () => {
    it("should create singleton instance", () => {
      const instance1 = MCPService.getInstance(
        mockMessageBus,
        createSilentLogger(),
      );
      const instance2 = MCPService.getInstance(
        mockMessageBus,
        createSilentLogger(),
      );
      expect(instance1).toBe(instance2);
    });

    it("should create fresh instance", () => {
      const fresh = MCPService.createFresh(
        mockMessageBus,
        createSilentLogger(),
      );
      const singleton = MCPService.getInstance(
        mockMessageBus,
        createSilentLogger(),
      );
      expect(fresh).not.toBe(singleton);
    });

    it("should initialize MCP server", () => {
      const mcpServer = mcpService.getMcpServer();
      expect(mcpServer).toBeDefined();
    });
  });

  describe("tool registration", () => {
    it("should register a tool with anchor permission", () => {
      const tool: Tool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: {
          input: z.string(),
        },
        visibility: "anchor",
        handler: async () => ({ success: true, data: "Test success" }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("test-plugin", tool);

      const tools = mcpService.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]?.pluginId).toBe("test-plugin");
      expect(tools[0]?.tool).toEqual(
        expect.objectContaining({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          visibility: tool.visibility,
        }),
      );
    });

    it("should always store tools in registry regardless of permission level", () => {
      const tool: Tool = {
        name: "admin_tool",
        description: "Admin tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, data: "Admin success" }),
      };

      mcpService.setPermissionLevel("public");
      mcpService.registerTool("admin-plugin", tool);

      // Internal registry has the tool (agent needs it)
      expect(mcpService.listTools()).toHaveLength(1);
      // Per-call filtering respects permissions
      expect(mcpService.listToolsForPermissionLevel("public")).toHaveLength(0);
      expect(mcpService.listToolsForPermissionLevel("trusted")).toHaveLength(1);
    });

    it("should forward protocol metadata when executing a tool", async () => {
      const tool: Tool = {
        name: "metadata_tool",
        description: "Metadata tool",
        inputSchema: {
          input: z.string(),
        },
        visibility: "anchor",
        handler: async () => ({ success: true, data: "ok" }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("metadata-plugin", tool);

      await callProtocolTool(
        mcpService.getMcpServer(),
        "metadata_tool",
        { input: "value" },
        {
          _meta: {
            interfaceType: "matrix",
            userId: "user-1",
            channelId: "room-1",
            channelName: "Room One",
            progressToken: "progress-1",
          },
        },
      );

      expect(mockMessageBus.send).toHaveBeenCalledWith({
        type: "plugin:metadata-plugin:tool:execute",
        payload: {
          toolName: "metadata_tool",
          args: { input: "value" },
          progressToken: "progress-1",
          hasProgress: true,
          interfaceType: "matrix",
          userId: "user-1",
          channelId: "room-1",
          channelName: "Room One",
          userPermissionLevel: "anchor",
        },
        sender: "MCPService",
      });
    });

    it("should pass compliant registered tool responses through unchanged", async () => {
      const context = { interfaceType: "test", userId: "user-1" };
      const responses = [
        { success: true as const, data: { value: "ok" }, message: "Done" },
        { success: false as const, error: "Nope", code: "NOPE" },
        {
          needsConfirmation: true as const,
          toolName: "confirm_tool",
          summary: "Confirm?",
          args: { id: "123" },
        },
      ];

      for (const [index, response] of responses.entries()) {
        const tool: Tool = {
          name: `compliant_tool_${index}`,
          description: "Compliant tool",
          inputSchema: {},
          handler: async () => response,
        };

        mcpService.registerTool("test-plugin", tool);
        const registeredTool = mcpService.listTools()[index]?.tool;
        expect(registeredTool).toBeDefined();
        if (!registeredTool) {
          throw new Error("Expected registered tool");
        }
        expect(await registeredTool.handler({}, context)).toEqual(response);
      }
    });

    it("should coerce non-compliant registered tool responses to tool errors", async () => {
      const logger = createMockLogger();
      mcpService = MCPService.createFresh(mockMessageBus, logger);
      const invalidResponses = [
        JSON.parse('{"success":false}'),
        JSON.parse('{"success":true}'),
        { success: true, data: "ok", formatted: "extra" },
      ];

      for (const [index, invalidResponse] of invalidResponses.entries()) {
        const tool: Tool = {
          name: `invalid_tool_${index}`,
          description: "Invalid tool",
          inputSchema: {},
          handler: async () => invalidResponse,
        };

        mcpService.registerTool("invalid-plugin", tool);
        const registeredTool = mcpService.listTools()[index]?.tool;
        expect(registeredTool).toBeDefined();
        if (!registeredTool) {
          throw new Error("Expected registered tool");
        }

        expect(
          await registeredTool.handler(
            {},
            { interfaceType: "test", userId: "user-1" },
          ),
        ).toEqual({
          success: false,
          error: `Tool invalid_tool_${index} returned an invalid response shape`,
        });
      }

      expect(logger.error).toHaveBeenCalledTimes(invalidResponses.length);
      expect(logger.error).toHaveBeenCalledWith(
        "Tool returned non-compliant response",
        expect.objectContaining({
          pluginId: "invalid-plugin",
          toolName: "invalid_tool_0",
          issues: expect.any(Array),
        }),
      );
    });

    it("should register multiple tools from different plugins", () => {
      const tool1: Tool = {
        name: "plugin1_tool",
        description: "Plugin 1 tool",
        inputSchema: {},
        handler: async () => ({ success: true, data: "Plugin 1 success" }),
      };

      const tool2: Tool = {
        name: "plugin2_tool",
        description: "Plugin 2 tool",
        inputSchema: {},
        handler: async () => ({ success: true, data: "Plugin 2 success" }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("plugin1", tool1);
      mcpService.registerTool("plugin2", tool2);

      const tools = mcpService.listTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.tool.name)).toEqual([
        "plugin1_tool",
        "plugin2_tool",
      ]);
    });
  });

  describe("getCliTools", () => {
    it("should return only tools with cli metadata", () => {
      const toolWithCli: Tool = {
        name: "system_list",
        description: "List entities",
        inputSchema: {},
        handler: async () => ({ success: true, data: [] }),
        cli: { name: "list" },
      };

      const toolWithoutCli: Tool = {
        name: "system_create",
        description: "Create entity",
        inputSchema: {},
        handler: async () => ({ success: true, data: {} }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("system", toolWithCli);
      mcpService.registerTool("system", toolWithoutCli);

      const cliTools = mcpService.getCliTools();
      expect(cliTools).toHaveLength(1);
      expect(cliTools[0]?.tool.name).toBe("system_list");
      expect(cliTools[0]?.tool.cli?.name).toBe("list");
    });

    it("should return empty array when no tools have cli metadata", () => {
      const tool: Tool = {
        name: "internal_tool",
        description: "Internal",
        inputSchema: {},
        handler: async () => ({ success: true, data: {} }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("internal", tool);

      expect(mcpService.getCliTools()).toHaveLength(0);
    });
  });

  describe("resource registration", () => {
    it("should register a resource", () => {
      const resource: Resource = {
        name: "test://resource",
        uri: "test://resource",
        description: "Test resource",
        mimeType: "text/plain",
        handler: async () => ({
          contents: [{ text: "test content", uri: "test://resource" }],
        }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerResource("test-plugin", resource);

      const resources = mcpService.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0]).toEqual({
        pluginId: "test-plugin",
        resource,
      });
    });

    it("should register multiple resources", () => {
      const resource1: Resource = {
        name: "plugin1://resource",
        uri: "plugin1://resource",
        description: "Plugin 1 resource",
        handler: async () => ({
          contents: [{ text: "resource 1", uri: "plugin1://resource" }],
        }),
      };

      const resource2: Resource = {
        name: "plugin2://resource",
        uri: "plugin2://resource",
        description: "Plugin 2 resource",
        handler: async () => ({
          contents: [{ text: "resource 2", uri: "plugin2://resource" }],
        }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerResource("plugin1", resource1);
      mcpService.registerResource("plugin2", resource2);

      const resources = mcpService.listResources();
      expect(resources).toHaveLength(2);
      expect(resources.map((r) => r.resource.uri)).toEqual([
        "plugin1://resource",
        "plugin2://resource",
      ]);
    });
  });

  describe("permission levels", () => {
    it("should update permission level", () => {
      // Just verify it doesn't throw
      expect(() => mcpService.setPermissionLevel("trusted")).not.toThrow();
    });

    it("should store all tools in registry regardless of permission level", () => {
      const publicTool: Tool = {
        name: "public_tool",
        description: "Public tool",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, data: "Public success" }),
      };

      const trustedTool: Tool = {
        name: "trusted_tool",
        description: "Trusted tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, data: "Trusted success" }),
      };

      const anchorTool: Tool = {
        name: "anchor_tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, data: "Anchor success" }),
      };

      // Even with public permission, all tools are in the internal registry
      mcpService.setPermissionLevel("public");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);

      const tools = mcpService.listTools();
      expect(tools.map((t) => t.tool.name)).toEqual([
        "public_tool",
        "trusted_tool",
        "anchor_tool",
      ]);

      // Per-call filtering still works correctly
      expect(
        mcpService
          .listToolsForPermissionLevel("public")
          .map((t) => t.tool.name),
      ).toEqual(["public_tool"]);
      expect(
        mcpService
          .listToolsForPermissionLevel("trusted")
          .map((t) => t.tool.name),
      ).toEqual(["public_tool", "trusted_tool"]);
      expect(
        mcpService
          .listToolsForPermissionLevel("anchor")
          .map((t) => t.tool.name),
      ).toEqual(["public_tool", "trusted_tool", "anchor_tool"]);
    });
  });

  describe("createMcpServer", () => {
    it("should create fresh servers with tools filtered by explicit permission", () => {
      const publicTool: Tool = {
        name: "fresh_public_tool",
        description: "Public tool",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, data: "public" }),
      };

      const trustedTool: Tool = {
        name: "fresh_trusted_tool",
        description: "Trusted tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, data: "trusted" }),
      };

      const anchorTool: Tool = {
        name: "fresh_anchor_tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, data: "anchor" }),
      };

      const defaultTool: Tool = {
        name: "fresh_default_tool",
        description: "Default visibility tool",
        inputSchema: {},
        handler: async () => ({ success: true, data: "default" }),
      };

      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);
      mcpService.registerTool("plugin", defaultTool);

      expect(
        listProtocolToolNames(mcpService.createMcpServer("public")),
      ).toEqual(["fresh_public_tool"]);
      expect(
        listProtocolToolNames(mcpService.createMcpServer("trusted")),
      ).toEqual(["fresh_public_tool", "fresh_trusted_tool"]);
      expect(
        listProtocolToolNames(mcpService.createMcpServer("anchor")),
      ).toEqual([
        "fresh_public_tool",
        "fresh_trusted_tool",
        "fresh_anchor_tool",
        "fresh_default_tool",
      ]);
    });

    it("should use the current service permission when permission is omitted", () => {
      const publicTool: Tool = {
        name: "current_public_tool",
        description: "Public tool",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, data: "public" }),
      };

      const anchorTool: Tool = {
        name: "current_anchor_tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, data: "anchor" }),
      };

      mcpService.setPermissionLevel("public");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", anchorTool);

      expect(listProtocolToolNames(mcpService.createMcpServer())).toEqual([
        "current_public_tool",
      ]);
    });
  });

  describe("listToolsForPermissionLevel", () => {
    beforeEach(() => {
      // Register all tools with anchor permission (full access)
      MCPService.resetInstance();
      mcpService = MCPService.getInstance(mockMessageBus, createSilentLogger());
      mcpService.setPermissionLevel("anchor");

      const publicTool: Tool = {
        name: "public_tool",
        description: "Public tool",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, data: "Public success" }),
      };

      const trustedTool: Tool = {
        name: "trusted_tool",
        description: "Trusted tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, data: "Trusted success" }),
      };

      const anchorTool: Tool = {
        name: "anchor_tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, data: "Anchor success" }),
      };

      // Tool with default visibility (should be anchor)
      const defaultTool: Tool = {
        name: "default_tool",
        description: "Tool with default visibility",
        inputSchema: {},
        handler: async () => ({ success: true, data: "Default success" }),
      };

      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);
      mcpService.registerTool("plugin", defaultTool);
    });

    it("should return only public tools for public users", () => {
      const tools = mcpService.listToolsForPermissionLevel("public");
      expect(tools.map((t) => t.tool.name)).toEqual(["public_tool"]);
    });

    it("should return public and trusted tools for trusted users", () => {
      const tools = mcpService.listToolsForPermissionLevel("trusted");
      expect(tools.map((t) => t.tool.name)).toEqual([
        "public_tool",
        "trusted_tool",
      ]);
    });

    it("should return all tools for anchor users", () => {
      const tools = mcpService.listToolsForPermissionLevel("anchor");
      expect(tools.map((t) => t.tool.name)).toEqual([
        "public_tool",
        "trusted_tool",
        "anchor_tool",
        "default_tool", // Default visibility is anchor
      ]);
    });

    it("should allow different users to see different tools per message", () => {
      // Simulate Matrix room with multiple users
      // User 1: public permission
      const publicUserTools = mcpService.listToolsForPermissionLevel("public");
      expect(publicUserTools.length).toBe(1);

      // User 2: anchor permission (same room, different message)
      const anchorUserTools = mcpService.listToolsForPermissionLevel("anchor");
      expect(anchorUserTools.length).toBe(4);

      // User 1 again: still only sees public tools
      const publicUserToolsAgain =
        mcpService.listToolsForPermissionLevel("public");
      expect(publicUserToolsAgain.length).toBe(1);
    });
  });

  describe("resource handler passthrough (no double-wrapping)", () => {
    it("should pass handler result directly to SDK without re-wrapping", () => {
      const resource: Resource = {
        name: "test-resource",
        uri: "test://resource",
        description: "Test resource",
        mimeType: "application/json",
        handler: async () => ({
          contents: [
            {
              text: '{"hello":"world"}',
              uri: "test://resource",
              mimeType: "application/json",
            },
          ],
        }),
      };

      mcpService.setPermissionLevel("anchor");

      // Should not throw (URI is valid, description is not used as URI)
      expect(() =>
        mcpService.registerResource("test-plugin", resource),
      ).not.toThrow();
    });

    it("should not double-wrap contents in serialized JSON", async () => {
      const resource: Resource = {
        name: "entity-types",
        uri: "entity://types",
        description: "List of entity types",
        mimeType: "text/plain",
        handler: async () => ({
          contents: [
            {
              text: "post\ndeck\nnote",
              uri: "entity://types",
              mimeType: "text/plain",
            },
          ],
        }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerResource("system", resource);

      // Verify handler returns raw text, not JSON-wrapped text
      const result = await resource.handler();
      const text = result.contents[0]?.text ?? "";
      expect(text).toBe("post\ndeck\nnote");
      expect(text).not.toContain("contents");
    });
  });

  describe("resource template registration", () => {
    it("should register a resource template without throwing", () => {
      const template: ResourceTemplate = {
        name: "entity-list",
        uriTemplate: "entity://{type}",
        description: "List entities by type",
        mimeType: "application/json",
        handler: async ({ type }) => ({
          contents: [
            {
              uri: `entity://${type}`,
              mimeType: "application/json",
              text: JSON.stringify([]),
            },
          ],
        }),
      };

      expect(() =>
        mcpService.registerResourceTemplate("system", template),
      ).not.toThrow();
    });

    it("should register a resource template with list callback", () => {
      const template: ResourceTemplate = {
        name: "entity-detail",
        uriTemplate: "entity://{type}/{id}",
        description: "Read entity by type and ID",
        mimeType: "text/markdown",
        list: async () => [
          { uri: "entity://post/hello-world", name: "Hello World" },
          { uri: "entity://post/second-post", name: "Second Post" },
        ],
        handler: async ({ type, id }) => ({
          contents: [
            {
              uri: `entity://${type}/${id}`,
              mimeType: "text/markdown",
              text: `# ${id}`,
            },
          ],
        }),
      };

      expect(() =>
        mcpService.registerResourceTemplate("system", template),
      ).not.toThrow();
    });

    it("should pass completion context to resource template completers", async () => {
      let observedValue: string | undefined;
      let observedContext:
        | { arguments?: Partial<{ type: string; id: string }> }
        | undefined;

      const template: ResourceTemplate<"type" | "id"> = {
        name: "entity-detail-complete",
        uriTemplate: "entity://{type}/{id}",
        complete: {
          type: (value) => [value],
          id: (value, context) => {
            observedValue = value;
            observedContext = context;
            return [`${context?.arguments?.type ?? "unknown"}-${value}`];
          },
        },
        handler: async ({ type, id }) => ({
          contents: [
            {
              uri: `entity://${type}/${id}`,
              text: `# ${id}`,
            },
          ],
        }),
      };

      mcpService.registerResourceTemplate("system", template);

      const registeredTemplate = inspectMcpServer(mcpService.getMcpServer())
        ._registeredResourceTemplates["entity-detail-complete"];
      expect(registeredTemplate).toBeDefined();
      if (!registeredTemplate) throw new Error("Template was not registered");

      const completer =
        registeredTemplate.resourceTemplate.completeCallback("id");

      expect(completer).toBeDefined();
      const result = await completer?.("sec", {
        arguments: { type: "post" },
      });

      expect(result).toEqual(["post-sec"]);
      expect(observedValue).toBe("sec");
      expect(observedContext).toEqual({ arguments: { type: "post" } });
    });
  });

  describe("resource template visibility gating", () => {
    const makeTemplate = (name: string): ResourceTemplate => ({
      name,
      uriTemplate: `entity://{type}`,
      description: "entity template",
      mimeType: "application/json",
      handler: async ({ type }) => ({
        contents: [
          {
            uri: `entity://${type}`,
            mimeType: "application/json",
            text: "[]",
          },
        ],
      }),
    });

    it("does not expose templates on the default server when service permission is public", () => {
      mcpService.setPermissionLevel("public");
      mcpService.registerResourceTemplate(
        "system",
        makeTemplate("entity-list"),
      );

      expect(
        listProtocolResourceTemplateNames(mcpService.getMcpServer()),
      ).not.toContain("entity-list");
    });

    it("does not expose templates on the default server when service permission is trusted", () => {
      mcpService.setPermissionLevel("trusted");
      mcpService.registerResourceTemplate(
        "system",
        makeTemplate("entity-detail"),
      );

      expect(
        listProtocolResourceTemplateNames(mcpService.getMcpServer()),
      ).not.toContain("entity-detail");
    });

    it("exposes templates on the default server when service permission is anchor", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerResourceTemplate(
        "system",
        makeTemplate("entity-list"),
      );

      expect(
        listProtocolResourceTemplateNames(mcpService.getMcpServer()),
      ).toContain("entity-list");
    });

    it("filters templates per-session in createMcpServer based on requested permission", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerResourceTemplate(
        "system",
        makeTemplate("entity-list"),
      );

      // Per-session servers must filter templates by the session permission,
      // not just by the default service permission.
      expect(
        listProtocolResourceTemplateNames(mcpService.createMcpServer("public")),
      ).not.toContain("entity-list");
      expect(
        listProtocolResourceTemplateNames(
          mcpService.createMcpServer("trusted"),
        ),
      ).not.toContain("entity-list");
      expect(
        listProtocolResourceTemplateNames(mcpService.createMcpServer("anchor")),
      ).toContain("entity-list");
    });

    it("removes resource templates from the default server when permission is lowered", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerResourceTemplate(
        "system",
        makeTemplate("entity-list"),
      );
      expect(
        listProtocolResourceTemplateNames(mcpService.getMcpServer()),
      ).toContain("entity-list");

      mcpService.setPermissionLevel("public");

      expect(
        listProtocolResourceTemplateNames(mcpService.getMcpServer()),
      ).not.toContain("entity-list");
    });

    it("still stores templates in the internal registry regardless of permission", () => {
      mcpService.setPermissionLevel("public");
      const template = makeTemplate("entity-list");
      mcpService.registerResourceTemplate("system", template);

      // Internal listResources doesn't return templates today, but the lower-
      // permission session must not expose them. If we later add a list API
      // for templates, it should still surface them so anchor sessions can
      // re-expose them via createMcpServer("anchor").
      const anchorServer = mcpService.createMcpServer("anchor");
      expect(listProtocolResourceTemplateNames(anchorServer)).toContain(
        "entity-list",
      );
    });
  });

  describe("plain resource per-session visibility gating", () => {
    it("filters resources per-session in createMcpServer based on requested permission", () => {
      const resource: Resource = {
        name: "entity://types",
        uri: "entity://types",
        description: "Entity types",
        mimeType: "text/plain",
        handler: async () => ({
          contents: [{ text: "post", uri: "entity://types" }],
        }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerResource("system", resource);

      expect(
        listProtocolResourceUris(mcpService.createMcpServer("public")),
      ).not.toContain("entity://types");
      expect(
        listProtocolResourceUris(mcpService.createMcpServer("trusted")),
      ).not.toContain("entity://types");
      expect(
        listProtocolResourceUris(mcpService.createMcpServer("anchor")),
      ).toContain("entity://types");
    });

    it("removes resources from the default server when permission is lowered", () => {
      const resource: Resource = {
        name: "entity://types",
        uri: "entity://types",
        description: "Entity types",
        mimeType: "text/plain",
        handler: async () => ({
          contents: [{ text: "post", uri: "entity://types" }],
        }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerResource("system", resource);
      expect(listProtocolResourceUris(mcpService.getMcpServer())).toContain(
        "entity://types",
      );

      mcpService.setPermissionLevel("public");

      expect(listProtocolResourceUris(mcpService.getMcpServer())).not.toContain(
        "entity://types",
      );
    });
  });

  describe("prompt registration", () => {
    it("should register a prompt without throwing", () => {
      const prompt: Prompt = {
        name: "create",
        description: "Create new content",
        args: {
          type: { description: "Entity type", required: true },
          topic: { description: "Topic or title" },
        },
        handler: async ({ type, topic }) => ({
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Create a new ${type} about: ${topic ?? "anything"}`,
              },
            },
          ],
        }),
      };

      expect(() => mcpService.registerPrompt("system", prompt)).not.toThrow();
    });

    it("should register a prompt with only required args", () => {
      const prompt: Prompt = {
        name: "brainstorm",
        description: "Brainstorm ideas",
        args: {
          topic: { description: "Topic to brainstorm about", required: true },
        },
        handler: async ({ topic }) => ({
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Let's brainstorm about: ${topic}`,
              },
            },
          ],
        }),
      };

      expect(() => mcpService.registerPrompt("system", prompt)).not.toThrow();
    });
  });

  describe("prompt visibility gating", () => {
    const makePrompt = (
      name: string,
      visibility?: Prompt["visibility"],
    ): Prompt => ({
      name,
      description: `prompt ${name}`,
      ...(visibility !== undefined && { visibility }),
      args: {
        topic: { description: "Topic", required: true },
      },
      handler: async ({ topic }) => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: `Discuss: ${topic}` },
          },
        ],
      }),
    });

    it("does not expose prompts on the default server when service permission is public", () => {
      mcpService.setPermissionLevel("public");
      mcpService.registerPrompt("system", makePrompt("anchor-prompt"));

      expect(listProtocolPromptNames(mcpService.getMcpServer())).not.toContain(
        "anchor-prompt",
      );
    });

    it("does not expose anchor-default prompts on the default server when service permission is trusted", () => {
      mcpService.setPermissionLevel("trusted");
      mcpService.registerPrompt("system", makePrompt("anchor-prompt"));

      expect(listProtocolPromptNames(mcpService.getMcpServer())).not.toContain(
        "anchor-prompt",
      );
    });

    it("exposes prompts on the default server when service permission is anchor", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerPrompt("system", makePrompt("anchor-prompt"));

      expect(listProtocolPromptNames(mcpService.getMcpServer())).toContain(
        "anchor-prompt",
      );
    });

    it("exposes explicitly public prompts to public sessions", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerPrompt(
        "system",
        makePrompt("public-prompt", "public"),
      );

      expect(
        listProtocolPromptNames(mcpService.createMcpServer("public")),
      ).toContain("public-prompt");
    });

    it("filters prompts per-session in createMcpServer based on requested permission", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerPrompt(
        "system",
        makePrompt("public-prompt", "public"),
      );
      mcpService.registerPrompt(
        "system",
        makePrompt("trusted-prompt", "trusted"),
      );
      mcpService.registerPrompt("system", makePrompt("anchor-prompt"));

      expect(
        listProtocolPromptNames(mcpService.createMcpServer("public")),
      ).toEqual(["public-prompt"]);
      expect(
        listProtocolPromptNames(mcpService.createMcpServer("trusted")),
      ).toEqual(["public-prompt", "trusted-prompt"]);
      expect(
        listProtocolPromptNames(mcpService.createMcpServer("anchor")),
      ).toEqual(["public-prompt", "trusted-prompt", "anchor-prompt"]);
    });

    it("removes anchor prompts from the default server when permission is lowered", () => {
      mcpService.setPermissionLevel("anchor");
      mcpService.registerPrompt("system", makePrompt("anchor-prompt"));
      expect(listProtocolPromptNames(mcpService.getMcpServer())).toContain(
        "anchor-prompt",
      );

      mcpService.setPermissionLevel("public");

      expect(listProtocolPromptNames(mcpService.getMcpServer())).not.toContain(
        "anchor-prompt",
      );
    });
  });

  describe("tool registration ordering", () => {
    it("should not drop anchor tools registered after setPermissionLevel(public)", () => {
      // Regression: MCP interface calls setPermissionLevel("public") during daemon
      // start (no auth token). System tools are registered after that. Anchor tools
      // were silently dropped from the internal registry, breaking the agent.
      const publicTool: Tool = {
        name: "system_search",
        description: "Search",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, data: "ok" }),
      };

      const anchorTool: Tool = {
        name: "system_create",
        description: "Create entity",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, data: "ok" }),
      };

      // Simulate: tools registered at anchor level during plugin init
      mcpService.registerTool("system", publicTool);

      // Simulate: MCP interface sets permission to public (no auth token)
      mcpService.setPermissionLevel("public");

      // Simulate: system tools registered after MCP interface starts
      mcpService.registerTool("system", anchorTool);

      // The internal registry should have both tools — agent needs them
      const allTools = mcpService.listTools();
      expect(allTools.map((t) => t.tool.name)).toContain("system_search");
      expect(allTools.map((t) => t.tool.name)).toContain("system_create");

      // Per-call filtering should still work correctly
      const publicTools = mcpService.listToolsForPermissionLevel("public");
      expect(publicTools.map((t) => t.tool.name)).toEqual(["system_search"]);

      const anchorTools = mcpService.listToolsForPermissionLevel("anchor");
      expect(anchorTools.map((t) => t.tool.name)).toContain("system_search");
      expect(anchorTools.map((t) => t.tool.name)).toContain("system_create");
    });
  });
});
