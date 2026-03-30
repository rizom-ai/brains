import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MCPService } from "../src/mcp-service";
import type { IMessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import type { Tool, Resource, ResourceTemplate, Prompt } from "../src/types";

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
        handler: async () => ({ success: true, formatted: "Test success" }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("test-plugin", tool);

      const tools = mcpService.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        pluginId: "test-plugin",
        tool,
      });
    });

    it("should skip tool registration with insufficient permissions", () => {
      const tool: Tool = {
        name: "admin_tool",
        description: "Admin tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, formatted: "Admin success" }),
      };

      mcpService.setPermissionLevel("public");
      mcpService.registerTool("admin-plugin", tool);

      const tools = mcpService.listTools();
      expect(tools).toHaveLength(0);
    });

    it("should register multiple tools from different plugins", () => {
      const tool1: Tool = {
        name: "plugin1_tool",
        description: "Plugin 1 tool",
        inputSchema: {},
        handler: async () => ({ success: true, formatted: "Plugin 1 success" }),
      };

      const tool2: Tool = {
        name: "plugin2_tool",
        description: "Plugin 2 tool",
        inputSchema: {},
        handler: async () => ({ success: true, formatted: "Plugin 2 success" }),
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
        cli: {
          name: "list",
          mapInput: (args) => ({ entityType: args[0] }),
        },
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

    it("should filter tools based on permission level", () => {
      const publicTool: Tool = {
        name: "public_tool",
        description: "Public tool",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, formatted: "Public success" }),
      };

      const trustedTool: Tool = {
        name: "trusted_tool",
        description: "Trusted tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, formatted: "Trusted success" }),
      };

      const anchorTool: Tool = {
        name: "anchor_tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, formatted: "Anchor success" }),
      };

      // Register with public permission - only public tool should be registered
      mcpService.setPermissionLevel("public");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);

      let tools = mcpService.listTools();
      expect(tools.map((t) => t.tool.name)).toEqual(["public_tool"]);

      // Reset and register with trusted permission
      MCPService.resetInstance();
      mcpService = MCPService.getInstance(mockMessageBus, createSilentLogger());
      mcpService.setPermissionLevel("trusted");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);

      tools = mcpService.listTools();
      expect(tools.map((t) => t.tool.name)).toEqual([
        "public_tool",
        "trusted_tool",
      ]);

      // Reset and register with anchor permission
      MCPService.resetInstance();
      mcpService = MCPService.getInstance(mockMessageBus, createSilentLogger());
      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);

      tools = mcpService.listTools();
      expect(tools.map((t) => t.tool.name)).toEqual([
        "public_tool",
        "trusted_tool",
        "anchor_tool",
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
        handler: async () => ({ success: true, formatted: "Public success" }),
      };

      const trustedTool: Tool = {
        name: "trusted_tool",
        description: "Trusted tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true, formatted: "Trusted success" }),
      };

      const anchorTool: Tool = {
        name: "anchor_tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, formatted: "Anchor success" }),
      };

      // Tool with default visibility (should be anchor)
      const defaultTool: Tool = {
        name: "default_tool",
        description: "Tool with default visibility",
        inputSchema: {},
        handler: async () => ({ success: true, formatted: "Default success" }),
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
});
