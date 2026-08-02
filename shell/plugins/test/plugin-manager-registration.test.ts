import { describe, it, expect, beforeEach, mock } from "bun:test";
import { PluginManager } from "../src/manager/pluginManager";
import { ServicePlugin } from "../src/service/service-plugin";
import type { PluginCapabilities, Resource, Tool } from "../src/interfaces";
import type { ProjectionDeclaration } from "../src/entity/projection-registry";
import {
  defineProjectionRule,
  type ProjectionRule,
} from "../src/entity/projection-rule";
import type { ServicePluginContext } from "../src/service/context";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { createMockMCPService, createSilentLogger } from "@brains/test-utils";
import type { IMCPService } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import {
  FallbackEntityAdapter,
  baseEntitySchema,
} from "@brains/entity-service";

// Mock plugin for testing
class ProjectionCapabilityPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  private readonly declarations: ProjectionDeclaration[];

  constructor(id: string, declarations: ProjectionDeclaration[]) {
    super(id, { name: id, version: "1.0.0" }, {}, z.object({}));
    this.declarations = declarations;
  }

  protected override async getCapabilities(): Promise<PluginCapabilities> {
    return { tools: [], resources: [], projections: this.declarations };
  }
}

class ProjectionRuleCapabilityPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  private readonly rule: ProjectionRule;

  constructor(rule: ProjectionRule) {
    super(
      "rule-plugin",
      { name: "rule-plugin", version: "1.0.0" },
      {},
      z.object({}),
    );
    this.rule = rule;
  }

  protected override async getCapabilities(): Promise<PluginCapabilities> {
    return { tools: [], resources: [], projectionRules: [this.rule] };
  }
}

class TestPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  constructor() {
    super(
      "test-plugin",
      { name: "test-plugin", version: "1.0.0" },
      {}, // config
      z.object({}), // configSchema
    );
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      {
        name: "test_tool1",
        description: "Test tool 1",
        inputSchema: {},
        visibility: "admin",
        handler: async () => ({ success: true, formatted: "Success" }),
      },
      {
        name: "test_tool2",
        description: "Test tool 2",
        inputSchema: {},
        visibility: "public",
        handler: async () => ({ success: true, formatted: "Success" }),
      },
    ];
  }

  protected override async getResources(): Promise<Resource[]> {
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
  let mockMCPService: IMCPService;
  let mockShell: MockShell;
  let registeredTools: Array<{ pluginId: string; tool: Tool }> = [];
  let registeredResources: Array<{
    pluginId: string;
    resource: Resource;
  }> = [];

  beforeEach(() => {
    // Reset registered items
    registeredTools = [];
    registeredResources = [];

    // Create mock MCP service — override the registry methods so we
    // can observe what gets registered, leave the rest as default mocks.
    mockMCPService = createMockMCPService();
    mockMCPService.registerTool = mock((pluginId, tool) => {
      registeredTools.push({ pluginId, tool });
    });
    mockMCPService.registerResource = mock((pluginId, resource) => {
      registeredResources.push({ pluginId, resource });
    });
    mockMCPService.listTools = mock(() => registeredTools);
    mockMCPService.listResources = mock(() => registeredResources);

    mockShell = createMockShell({ dataDir: "/tmp/test-datadir" });

    // Override the shell's registration methods to use our mocked registries
    mockShell.registerTools = mock((_pluginId: string, tools: Tool[]) => {
      for (const tool of tools) {
        mockMCPService.registerTool(_pluginId, tool);
      }
    });

    mockShell.registerResources = mock(
      (_pluginId: string, resources: Resource[]) => {
        for (const resource of resources) {
          mockMCPService.registerResource(_pluginId, resource);
        }
      },
    );

    // Create plugin manager and wire shell
    pluginManager = PluginManager.createFresh(
      createSilentLogger(),
      mockShell.getDaemonRegistry(),
    );
    pluginManager.setShell(mockShell);
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
          name: "test_tool1",
          description: "Test tool 1",
        }),
      );
      expect(mockMCPService.registerTool).toHaveBeenCalledWith(
        "test-plugin",
        expect.objectContaining({
          name: "test_tool2",
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
      class EmptyPlugin extends ServicePlugin<
        Record<string, never>,
        Record<string, never>
      > {
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
      class SecondPlugin extends ServicePlugin<
        Record<string, never>,
        Record<string, never>
      > {
        constructor() {
          super(
            "second-plugin",
            { name: "second-plugin", version: "1.0.0" },
            {},
            z.object({}),
          );
        }

        protected override async getTools(): Promise<Tool[]> {
          return [
            {
              name: "second_tool",
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
      expect(registeredTools.map((t) => t.tool.name)).toContain("second_tool");
    });

    it("should use direct registration instead of MessageBus", async () => {
      // Create plugin manager (MessageBus no longer needed)
      pluginManager = PluginManager.createFresh(
        createSilentLogger(),
        mockShell.getDaemonRegistry(),
      );
      pluginManager.setShell(mockShell);

      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // Direct registration should be used instead of MessageBus events
      expect(mockMCPService.registerTool).toHaveBeenCalled();
      expect(mockMCPService.registerResource).toHaveBeenCalled();
    });
  });

  describe("post-registration finalization", () => {
    it("registers projection capabilities and publishes a frozen graph snapshot", async () => {
      mockShell
        .getEntityRegistry()
        .registerEntityType("topic", z.any(), {} as never, {
          projectionSource: false,
        });
      pluginManager.registerPlugin(
        new ProjectionCapabilityPlugin("topics", [
          {
            id: "topic-projection",
            targetType: "topic",
            sources: [{ kind: "entity", types: ["*"] }],
          },
        ]),
      );

      await pluginManager.initializePlugins();
      await pluginManager.finalizePluginRegistrations();

      const graph = pluginManager.getProjectionGraphSnapshot();
      expect(graph.projections.map(({ id }) => id)).toEqual([
        "topic-projection",
      ]);
      expect(Object.isFrozen(graph)).toBe(true);
      expect(Object.isFrozen(graph.projections)).toBe(true);
    });

    it("keeps executable projection rules behind the finalized manager snapshot", async () => {
      const rule = defineProjectionRule({
        id: "note-rule",
        version: "1",
        targetType: "note",
        sources: [{ kind: "entity", types: ["document"] }],
        inputSchema: z.object({}),
        selectInput: async () => ({}),
        derive: async () => [],
      });
      mockShell
        .getEntityRegistry()
        .registerEntityType(
          "note",
          baseEntitySchema,
          new FallbackEntityAdapter(),
          { projectionSource: false },
        );
      pluginManager.registerPlugin(new ProjectionRuleCapabilityPlugin(rule));

      await pluginManager.initializePlugins();
      expect(() => pluginManager.getProjectionRulesSnapshot()).toThrow(
        "Projection graph has not been finalized",
      );

      await pluginManager.finalizePluginRegistrations();

      const rules = pluginManager.getProjectionRulesSnapshot();
      expect(rules).toEqual([rule]);
      expect(Object.isFrozen(rules)).toBe(true);
      expect(pluginManager.getProjectionGraphSnapshot().projections).toEqual([
        expect.objectContaining({
          id: "note-rule",
          executionOwner: "wave-owned",
        }),
      ]);
    });

    it("rejects a cycle crossing entity and semantic-event capabilities", async () => {
      for (const type of ["document", "topic", "skill"]) {
        mockShell
          .getEntityRegistry()
          .registerEntityType(type, z.any(), {} as never);
      }
      pluginManager.registerPlugin(
        new ProjectionCapabilityPlugin("topics", [
          {
            id: "topic-projection",
            targetType: "topic",
            sources: [{ kind: "entity", types: ["document"] }],
            emittedEvents: ["topics:batch-completed"],
          },
        ]),
      );
      pluginManager.registerPlugin(
        new ProjectionCapabilityPlugin("skills", [
          {
            id: "skill-projection",
            targetType: "skill",
            sources: [{ kind: "event", events: ["topics:batch-completed"] }],
          },
        ]),
      );
      pluginManager.registerPlugin(
        new ProjectionCapabilityPlugin("documents", [
          {
            id: "document-projection",
            targetType: "document",
            sources: [{ kind: "entity", types: ["skill"] }],
          },
        ]),
      );

      await pluginManager.initializePlugins();

      expect(pluginManager.finalizePluginRegistrations()).rejects.toThrow(
        "Projection cycle is not supported",
      );
    });

    it("runs only after every plugin has registered", async () => {
      const events: string[] = [];

      class OrderedPlugin extends ServicePlugin<
        Record<string, never>,
        Record<string, never>
      > {
        private readonly pluginName: string;

        constructor(pluginName: string) {
          super(
            pluginName,
            { name: pluginName, version: "1.0.0" },
            {},
            z.object({}),
          );
          this.pluginName = pluginName;
        }

        protected override async onRegister(): Promise<void> {
          events.push(`register:${this.pluginName}`);
        }

        protected override async onRegistrationComplete(): Promise<void> {
          events.push(`finalize:${this.pluginName}`);
        }
      }

      pluginManager.registerPlugin(new OrderedPlugin("first"));
      pluginManager.registerPlugin(new OrderedPlugin("second"));
      await pluginManager.initializePlugins();

      expect(events).toEqual(["register:first", "register:second"]);
      await pluginManager.finalizePluginRegistrations();
      expect(events).toEqual([
        "register:first",
        "register:second",
        "finalize:first",
        "finalize:second",
      ]);
    });

    it("rolls back kind registrations when finalization fails", async () => {
      class FailingKindPlugin extends ServicePlugin<
        Record<string, never>,
        Record<string, never>
      > {
        constructor() {
          super(
            "artist-plugin",
            { name: "artist-plugin", version: "1.0.0" },
            {},
            z.object({}),
          );
        }

        protected override async onRegister(
          context: ServicePluginContext,
        ): Promise<void> {
          context.profileKinds.register({
            kind: "artist",
            category: "person",
            fields: z.object({ mediums: z.array(z.string()).optional() }),
            labels: { singular: "Artist", plural: "Artists" },
          });
        }

        protected override async onRegistrationComplete(): Promise<void> {
          throw new Error("finalization failed");
        }
      }

      mockShell = createMockShell({ profileKind: "artist" });
      pluginManager = PluginManager.createFresh(
        createSilentLogger(),
        mockShell.getDaemonRegistry(),
      );
      pluginManager.setShell(mockShell);
      pluginManager.registerPlugin(new FailingKindPlugin());
      await pluginManager.initializePlugins();

      expect(pluginManager.finalizePluginRegistrations()).rejects.toThrow(
        "finalization failed",
      );
      expect(() => mockShell.getProfileKindRegistry().finalize()).toThrow(
        'Selected profile kind "artist" is not registered',
      );
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
      mockShell.registerTools = mock((_pluginId: string, tools: Tool[]) => {
        for (const tool of tools) {
          try {
            mockMCPService.registerTool(_pluginId, tool);
          } catch {
            // Shell catches and logs errors, so we do the same here
          }
        }
      });

      const plugin = new TestPlugin();
      pluginManager.registerPlugin(plugin);
      await pluginManager.initializePlugins();

      // Second tool should still be registered
      expect(registeredTools).toHaveLength(1);
      expect(registeredTools[0]?.tool.name).toBe("test_tool2");

      // Resource should still be registered
      expect(mockMCPService.registerResource).toHaveBeenCalled();
    });
  });
});
