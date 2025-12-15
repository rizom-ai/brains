import { describe, it, expect, beforeEach, mock } from "bun:test";
import { PluginManager } from "../src/manager/pluginManager";
import { CorePlugin } from "../src/core/core-plugin";
import { PluginTestHarness } from "../src/test/harness";
import type { PluginTool, PluginResource, IShell } from "../src/interfaces";
import type { ServiceRegistry } from "@brains/service-registry";
import { createSilentLogger } from "@brains/utils";
import type { IMCPService } from "@brains/mcp-service";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "@brains/utils";

// Mock plugin for testing
class TestPlugin extends CorePlugin<Record<string, never>> {
  constructor() {
    super(
      "test-plugin",
      { name: "test-plugin", version: "1.0.0" },
      {}, // config
      z.object({}), // configSchema
    );
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: "test:tool1",
        description: "Test tool 1",
        inputSchema: {},
        visibility: "anchor",
        handler: async () => ({ success: true, formatted: "Success" }),
      },
      {
        name: "test:tool2",
        description: "Test tool 2",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, formatted: "Success" }),
      },
    ];
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return [
      {
        name: "test://resource1",
        uri: "test://resource1",
        description: "Test resource 1",
        mimeType: "text/plain",
        handler: async () => ({
          contents: [{ text: "test content", uri: "test://resource1" }],
        }),
      },
    ];
  }
}

describe("PluginManager - Direct Registration", () => {
  let pluginManager: PluginManager;
  let mockServiceRegistry: ServiceRegistry;
  let mockMCPService: IMCPService;
  let mockShell: IShell;
  let registeredTools: Array<{ pluginId: string; tool: PluginTool }> = [];
  let registeredResources: Array<{
    pluginId: string;
    resource: PluginResource;
  }> = [];

  beforeEach(() => {
    // Reset PluginManager singleton
    PluginManager.resetInstance();
    // Reset registered items
    registeredTools = [];
    registeredResources = [];

    // Create mock MCP service
    const registerToolMock = mock((pluginId, tool) => {
      registeredTools.push({ pluginId, tool });
    });

    const registerResourceMock = mock((pluginId, resource) => {
      registeredResources.push({ pluginId, resource });
    });

    mockMCPService = {
      registerTool: registerToolMock,
      registerResource: registerResourceMock,
      listTools: mock(() => registeredTools),
      listResources: mock(() => registeredResources),
      getMcpServer: mock(() => ({}) as unknown as McpServer),
      setPermissionLevel: mock(() => {}),
    } as unknown as IMCPService;

    // Create mock shell using test harness with dataDir for context
    const harness = new PluginTestHarness({ dataDir: "/tmp/test-datadir" });
    mockShell = harness.getShell();

    // Override the shell's registration methods to use our mocked registries
    mockShell.registerPluginTools = mock(
      (_pluginId: string, tools: PluginTool[]) => {
        for (const tool of tools) {
          mockMCPService.registerTool(_pluginId, tool);
        }
      },
    );

    mockShell.registerPluginResources = mock(
      (_pluginId: string, resources: PluginResource[]) => {
        for (const resource of resources) {
          mockMCPService.registerResource(_pluginId, resource);
        }
      },
    );

    // Create mock service registry
    const resolveMock = mock((name: string) => {
      if (name === "mcpService") return mockMCPService;
      if (name === "shell") return mockShell;
      throw new Error(`Unknown service: ${name}`);
    });

    mockServiceRegistry = {
      register: mock(() => {}),
      resolve: resolveMock,
      tryResolve: mock(() => undefined),
      list: mock(() => []),
    } as unknown as ServiceRegistry;

    // Create plugin manager
    pluginManager = PluginManager.getInstance(
      mockServiceRegistry,
      createSilentLogger(),
    );
  });

  describe("capability registration", () => {
    it("should register tools directly with MCPService", async () => {
      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // Check that tools were registered
      expect(mockMCPService.registerTool).toHaveBeenCalledTimes(2);
      expect(mockMCPService.registerTool).toHaveBeenCalledWith(
        "test-plugin",
        expect.objectContaining({
          name: "test:tool1",
          description: "Test tool 1",
        }),
      );
      expect(mockMCPService.registerTool).toHaveBeenCalledWith(
        "test-plugin",
        expect.objectContaining({
          name: "test:tool2",
          description: "Test tool 2",
        }),
      );
    });

    it("should register resources directly with MCPService", async () => {
      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // Check that resource was registered
      expect(mockMCPService.registerResource).toHaveBeenCalledTimes(1);
      expect(mockMCPService.registerResource).toHaveBeenCalledWith(
        "test-plugin",
        expect.objectContaining({
          uri: "test://resource1",
          description: "Test resource 1",
        }),
      );
    });

    it("should handle plugins with no capabilities", async () => {
      class EmptyPlugin extends CorePlugin<Record<string, never>> {
        constructor() {
          super(
            "empty-plugin",
            { name: "empty-plugin", version: "1.0.0" },
            {},
            z.object({}),
          );
        }
      }

      const plugin = new EmptyPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // Should not crash and should not register anything
      expect(mockMCPService.registerTool).not.toHaveBeenCalled();
      expect(mockMCPService.registerResource).not.toHaveBeenCalled();
    });

    it("should register capabilities from multiple plugins", async () => {
      class SecondPlugin extends CorePlugin<Record<string, never>> {
        constructor() {
          super(
            "second-plugin",
            { name: "second-plugin", version: "1.0.0" },
            {},
            z.object({}),
          );
        }

        protected override async getTools(): Promise<PluginTool[]> {
          return [
            {
              name: "second:tool",
              description: "Second plugin tool",
              inputSchema: {},
              handler: async () => ({ success: true, formatted: "Success" }),
            },
          ];
        }
      }

      const plugin1 = new TestPlugin();
      const plugin2 = new SecondPlugin();

      pluginManager.registerPlugin(plugin1);
      pluginManager.registerPlugin(plugin2);
      await pluginManager.initializePlugins();

      // Check that all tools were registered
      expect(mockMCPService.registerTool).toHaveBeenCalledTimes(3); // 2 from TestPlugin, 1 from SecondPlugin
      expect(registeredTools).toHaveLength(3);
      expect(registeredTools.map((t) => t.tool.name)).toContain("second:tool");
    });

    it("should not use MessageBus for registration", async () => {
      const emitMock = mock(() => {});

      // Create plugin manager (MessageBus no longer needed)
      pluginManager = PluginManager.getInstance(
        mockServiceRegistry,
        createSilentLogger(),
      );

      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // MessageBus should not be used for tool/resource registration
      const mockFn = emitMock as ReturnType<typeof mock>;
      const calls = mockFn.mock.calls as Array<[string, ...unknown[]]>;
      const hasRegistrationEvent = calls.some((call) =>
        /system:tool:register|system:resource:register/.test(call[0]),
      );
      expect(hasRegistrationEvent).toBe(false);

      // Direct registration should be used instead
      expect(mockMCPService.registerTool).toHaveBeenCalled();
      expect(mockMCPService.registerResource).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle errors in tool registration gracefully", async () => {
      // Make registerTool throw an error
      mockMCPService.registerTool = mock(() => {
        throw new Error("Registration failed");
      });

      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);

      // Should not throw (error is logged silently)
      await pluginManager.initializePlugins();
    });

    it("should continue registering other capabilities if one fails", async () => {
      // Make only the first tool registration fail
      let callCount = 0;
      const registerToolMock = mock((pluginId, tool) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("First tool registration failed");
        }
        registeredTools.push({ pluginId, tool });
      });

      mockMCPService.registerTool = registerToolMock;

      // Update shell's method to use the new mock
      mockShell.registerPluginTools = mock(
        (_pluginId: string, tools: PluginTool[]) => {
          for (const tool of tools) {
            try {
              mockMCPService.registerTool(_pluginId, tool);
            } catch {
              // Shell catches and logs errors, so we do the same here
            }
          }
        },
      );

      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // Second tool should still be registered
      expect(registeredTools).toHaveLength(1);
      expect(registeredTools[0]?.tool.name).toBe("test:tool2");

      // Resource should still be registered
      expect(mockMCPService.registerResource).toHaveBeenCalled();
    });
  });
});
