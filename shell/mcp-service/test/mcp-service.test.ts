import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MCPService } from "../src/mcp-service";
import type { IMessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/utils";
import type { PluginTool, PluginResource } from "@brains/plugins";

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
    );
    mockMessageBus = {
      send: sendMock as any,
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
      const tool: PluginTool = {
        name: "test:tool",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        } as any,
        visibility: "anchor",
        handler: async () => ({ success: true }),
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
      const tool: PluginTool = {
        name: "admin:tool",
        description: "Admin tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true }),
      };

      mcpService.setPermissionLevel("public");
      mcpService.registerTool("admin-plugin", tool);

      const tools = mcpService.listTools();
      expect(tools).toHaveLength(0);
    });

    it("should register multiple tools from different plugins", () => {
      const tool1: PluginTool = {
        name: "plugin1:tool",
        description: "Plugin 1 tool",
        inputSchema: {},
        handler: async () => ({ success: true }),
      };

      const tool2: PluginTool = {
        name: "plugin2:tool",
        description: "Plugin 2 tool",
        inputSchema: {},
        handler: async () => ({ success: true }),
      };

      mcpService.setPermissionLevel("anchor");
      mcpService.registerTool("plugin1", tool1);
      mcpService.registerTool("plugin2", tool2);

      const tools = mcpService.listTools();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.tool.name)).toEqual([
        "plugin1:tool",
        "plugin2:tool",
      ]);
    });
  });

  describe("resource registration", () => {
    it("should register a resource", () => {
      const resource: PluginResource = {
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
      const resource1: PluginResource = {
        name: "plugin1://resource",
        uri: "plugin1://resource",
        description: "Plugin 1 resource",
        handler: async () => ({
          contents: [{ text: "resource 1", uri: "plugin1://resource" }],
        }),
      };

      const resource2: PluginResource = {
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
      const publicTool: PluginTool = {
        name: "public:tool",
        description: "Public tool",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true }),
      };

      const trustedTool: PluginTool = {
        name: "trusted:tool",
        description: "Trusted tool",
        inputSchema: {},
        visibility: "trusted",
        handler: async () => ({ success: true }),
      };

      const anchorTool: PluginTool = {
        name: "anchor:tool",
        description: "Anchor tool",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true }),
      };

      // Register with public permission - only public tool should be registered
      mcpService.setPermissionLevel("public");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);

      let tools = mcpService.listTools();
      expect(tools.map((t) => t.tool.name)).toEqual(["public:tool"]);

      // Reset and register with trusted permission
      MCPService.resetInstance();
      mcpService = MCPService.getInstance(mockMessageBus, createSilentLogger());
      mcpService.setPermissionLevel("trusted");
      mcpService.registerTool("plugin", publicTool);
      mcpService.registerTool("plugin", trustedTool);
      mcpService.registerTool("plugin", anchorTool);

      tools = mcpService.listTools();
      expect(tools.map((t) => t.tool.name)).toEqual([
        "public:tool",
        "trusted:tool",
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
        "public:tool",
        "trusted:tool",
        "anchor:tool",
      ]);
    });
  });
});
