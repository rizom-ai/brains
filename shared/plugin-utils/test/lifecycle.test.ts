import { describe, expect, it } from "bun:test";
import { composePlugins } from "../src/lifecycle";
import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
} from "../src/interfaces";
import type { Command, MessageContext } from "@brains/message-interface";
import { createSilentLogger } from "@brains/utils";
import { z } from "zod";

// Mock plugin context
const mockContext: PluginContext = {
  pluginId: "composite-plugin",
  logger: createSilentLogger("composite-plugin"),
  sendMessage: async () => {},
  subscribe: () => {},
  registerEntityType: () => {},
  generateContent: async () => ({}),
  parseContent: () => ({}),
  formatContent: () => "",
  generateWithRoute: async () => "",
  registerTemplate: () => {},
  registerTemplates: () => {},
  registerRoutes: () => {},
  getViewTemplate: () => undefined,
  getRoute: () => undefined,
  findRoute: () => undefined,
  listRoutes: () => [],
  validateRoute: () => true,
  findViewTemplate: () => undefined,
  listViewTemplates: () => [],
  validateTemplate: () => true,
  getPluginPackageName: () => undefined,
  entityService: {} as PluginContext["entityService"],
  waitForJob: async () => {},
  enqueueJob: async () => "job-123",
  getJobStatus: async () => null,
  enqueueBatch: async () => "batch-123",
  getBatchStatus: async () => null,
  getActiveJobs: async () => [],
  getActiveBatches: async () => [],
  registerJobHandler: () => {},
  registerDaemon: () => {},
};

// Helper to create mock plugins
function createMockPlugin(
  id: string,
  commands: Command[] = [],
  tools: unknown[] = [],
  resources: unknown[] = [],
): Plugin {
  return {
    id,
    version: "1.0.0",
    packageName: `@test/${id}`,
    description: `Test plugin ${id}`,
    async register(_context: PluginContext): Promise<PluginCapabilities> {
      return {
        tools,
        resources,
        commands,
      };
    },
  };
}

describe("Lifecycle Command Aggregation", () => {
  describe("composePlugins", () => {
    it("should aggregate commands from multiple plugins", async () => {
      const plugin1Commands: Command[] = [
        {
          name: "command1",
          description: "Command from plugin 1",
          handler: async () => ({
            type: "message",
            message: "Plugin 1 command",
          }),
        },
      ];

      const plugin2Commands: Command[] = [
        {
          name: "command2",
          description: "Command from plugin 2",
          handler: async () => ({
            type: "message",
            message: "Plugin 2 command",
          }),
        },
        {
          name: "command3",
          description: "Another command from plugin 2",
          handler: async () => ({
            type: "message",
            message: "Plugin 2 command 3",
          }),
        },
      ];

      const plugin1 = createMockPlugin("plugin1", plugin1Commands);
      const plugin2 = createMockPlugin("plugin2", plugin2Commands);

      const composite = composePlugins(
        "composite-test",
        "@test/composite",
        "Composite plugin for testing",
        [plugin1, plugin2],
      );

      const capabilities = await composite.register(mockContext);

      expect(capabilities.commands).toHaveLength(3);
      expect(capabilities.commands[0].name).toBe("command1");
      expect(capabilities.commands[1].name).toBe("command2");
      expect(capabilities.commands[2].name).toBe("command3");
    });

    it("should aggregate tools, resources, and commands together", async () => {
      const plugin1Commands: Command[] = [
        {
          name: "cmd1",
          description: "Command 1",
          handler: async () => ({ type: "message", message: "Cmd 1" }),
        },
      ];

      const plugin1Tools = [
        {
          name: "tool1",
          description: "Tool 1",
          inputSchema: { input: z.string() },
          handler: async (): Promise<string> => "tool1 result",
        },
      ];

      const plugin2Resources = [
        {
          uri: "resource2",
          name: "Resource 2",
          description: "Resource from plugin 2",
          handler: async (): Promise<{
            contents: Array<{ text: string; uri: string }>;
          }> => ({
            contents: [{ text: "resource2", uri: "res2" }],
          }),
        },
      ];

      const plugin2Commands: Command[] = [
        {
          name: "cmd2",
          description: "Command 2",
          handler: async () => ({ type: "message", message: "Cmd 2" }),
        },
      ];

      const plugin1 = createMockPlugin(
        "plugin1",
        plugin1Commands,
        plugin1Tools,
      );
      const plugin2 = createMockPlugin(
        "plugin2",
        plugin2Commands,
        [],
        plugin2Resources,
      );

      const composite = composePlugins(
        "multi-capability",
        "@test/multi-capability",
        "Multi-capability composite plugin",
        [plugin1, plugin2],
      );

      const capabilities = await composite.register(mockContext);

      expect(capabilities.tools).toHaveLength(1);
      expect(capabilities.resources).toHaveLength(1);
      expect(capabilities.commands).toHaveLength(2);

      expect(capabilities.tools[0].name).toBe("tool1");
      expect(capabilities.resources[0].uri).toBe("resource2");
      expect(capabilities.commands[0].name).toBe("cmd1");
      expect(capabilities.commands[1].name).toBe("cmd2");
    });

    it("should handle empty plugins", async () => {
      const emptyPlugin1 = createMockPlugin("empty1");
      const emptyPlugin2 = createMockPlugin("empty2");

      const composite = composePlugins(
        "empty-composite",
        "@test/empty-composite",
        "Composite with empty plugins",
        [emptyPlugin1, emptyPlugin2],
      );

      const capabilities = await composite.register(mockContext);

      expect(capabilities.tools).toHaveLength(0);
      expect(capabilities.resources).toHaveLength(0);
      expect(capabilities.commands).toHaveLength(0);
    });

    it("should handle single plugin", async () => {
      const singlePluginCommands: Command[] = [
        {
          name: "solo-command",
          description: "Single plugin command",
          handler: async () => ({ type: "message", message: "Solo command" }),
        },
      ];

      const singlePlugin = createMockPlugin("solo", singlePluginCommands);

      const composite = composePlugins(
        "single-composite",
        "@test/single-composite",
        "Composite with single plugin",
        [singlePlugin],
      );

      const capabilities = await composite.register(mockContext);

      expect(capabilities.commands).toHaveLength(1);
      expect(capabilities.commands[0].name).toBe("solo-command");
    });

    it("should maintain command order across plugins", async () => {
      const plugin1Commands: Command[] = [
        {
          name: "a-command",
          description: "First alphabetically but from plugin 1",
          handler: async () => ({ type: "message", message: "A command" }),
        },
        {
          name: "c-command",
          description: "Third alphabetically from plugin 1",
          handler: async () => ({ type: "message", message: "C command" }),
        },
      ];

      const plugin2Commands: Command[] = [
        {
          name: "b-command",
          description: "Second alphabetically but from plugin 2",
          handler: async () => ({ type: "message", message: "B command" }),
        },
      ];

      const plugin1 = createMockPlugin("plugin1", plugin1Commands);
      const plugin2 = createMockPlugin("plugin2", plugin2Commands);

      const composite = composePlugins(
        "order-test",
        "@test/order-test",
        "Plugin order test",
        [plugin1, plugin2],
      );

      const capabilities = await composite.register(mockContext);

      // Commands should maintain plugin order, not alphabetical order
      expect(capabilities.commands).toHaveLength(3);
      expect(capabilities.commands[0].name).toBe("a-command");
      expect(capabilities.commands[1].name).toBe("c-command");
      expect(capabilities.commands[2].name).toBe("b-command");
    });

    it("should handle command name conflicts gracefully", async () => {
      const plugin1Commands: Command[] = [
        {
          name: "duplicate-command",
          description: "Command from plugin 1",
          handler: async () => ({
            type: "message",
            message: "Plugin 1 version",
          }),
        },
      ];

      const plugin2Commands: Command[] = [
        {
          name: "duplicate-command",
          description: "Command from plugin 2",
          handler: async () => ({
            type: "message",
            message: "Plugin 2 version",
          }),
        },
      ];

      const plugin1 = createMockPlugin("plugin1", plugin1Commands);
      const plugin2 = createMockPlugin("plugin2", plugin2Commands);

      const composite = composePlugins(
        "conflict-test",
        "@test/conflict-test",
        "Command conflict test",
        [plugin1, plugin2],
      );

      const capabilities = await composite.register(mockContext);

      // Both commands should be present (first one wins, but both are included)
      expect(capabilities.commands).toHaveLength(2);
      expect(capabilities.commands[0].name).toBe("duplicate-command");
      expect(capabilities.commands[1].name).toBe("duplicate-command");

      // Execution should use the first matching command
      const result1 = await capabilities.commands[0].handler(
        [],
        {} as MessageContext,
      );
      const result2 = await capabilities.commands[1].handler(
        [],
        {} as MessageContext,
      );

      expect(result1.message).toBe("Plugin 1 version");
      expect(result2.message).toBe("Plugin 2 version");
    });

    it("should preserve command metadata", async () => {
      const commandWithMetadata: Command = {
        name: "metadata-command",
        description: "Command with all metadata",
        usage: "/metadata-command <arg1> [arg2]",
        handler: async (args, context) => ({
          type: "job-operation",
          message: `Processing ${args.length} args for ${context.userId}`,
          jobId: "metadata-job-123",
        }),
      };

      const plugin = createMockPlugin("metadata-plugin", [commandWithMetadata]);

      const composite = composePlugins(
        "metadata-test",
        "@test/metadata-test",
        "Metadata preservation test",
        [plugin],
      );

      const capabilities = await composite.register(mockContext);

      expect(capabilities.commands).toHaveLength(1);
      const command = capabilities.commands[0];

      expect(command.name).toBe("metadata-command");
      expect(command.description).toBe("Command with all metadata");
      expect(command.usage).toBe("/metadata-command <arg1> [arg2]");

      // Test that handler is preserved and functional
      const result = await command.handler(["arg1", "arg2"], {
        userId: "test-user",
        channelId: "test-channel",
        messageId: "test-message",
        timestamp: new Date(),
        interfaceType: "test",
        userPermissionLevel: "public",
      });

      expect(result.type).toBe("job-operation");
      expect(result.message).toBe("Processing 2 args for test-user");
      expect(result.jobId).toBe("metadata-job-123");
    });
  });
});
