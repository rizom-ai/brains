import { describe, expect, it, beforeEach } from "bun:test";
import { BasePlugin } from "../src/base-plugin";
import type {
  PluginContext,
  PluginTool,
  PluginResource,
} from "../src/interfaces";
import type { Command } from "@brains/message-interface";
import type { MessageContext } from "../src/interfaces";
import { createSilentLogger } from "@brains/utils";
import { z } from "zod";

// Mock plugin context
const mockContext: PluginContext = {
  pluginId: "test-plugin",
  logger: createSilentLogger("test-plugin"),
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

// Test plugin implementation
class TestPlugin extends BasePlugin {
  private customTools: PluginTool[] = [];
  private customResources: PluginResource[] = [];
  private customCommands: Command[] = [];

  constructor(
    id = "test-plugin",
    customTools: PluginTool[] = [],
    customResources: PluginResource[] = [],
    customCommands: Command[] = [],
  ) {
    super(
      id,
      { name: "test-plugin", version: "1.0.0", description: "Test plugin" },
      {},
      z.object({}),
      {},
    );
    this.customTools = customTools;
    this.customResources = customResources;
    this.customCommands = customCommands;
  }

  protected override async getTools(): Promise<PluginTool[]> {
    return this.customTools;
  }

  protected override async getResources(): Promise<PluginResource[]> {
    return this.customResources;
  }

  protected override async getCommands(): Promise<Command[]> {
    return this.customCommands;
  }
}

describe("BasePlugin Command Registration", () => {
  let plugin: TestPlugin;

  beforeEach(() => {
    plugin = new TestPlugin();
  });

  describe("Default Command Capabilities", () => {
    it("should return empty commands array by default", async () => {
      const capabilities = await plugin.register(mockContext);

      expect(capabilities.commands).toEqual([]);
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });

    it("should include all capability types in registration", async () => {
      const capabilities = await plugin.register(mockContext);

      expect(capabilities).toHaveProperty("tools");
      expect(capabilities).toHaveProperty("resources");
      expect(capabilities).toHaveProperty("commands");
      expect(Array.isArray(capabilities.commands)).toBe(true);
    });
  });

  describe("Custom Command Registration", () => {
    it("should register custom commands", async () => {
      const customCommands: Command[] = [
        {
          name: "test-command",
          description: "A test command",
          handler: async () => ({ type: "message", message: "Test executed" }),
        },
        {
          name: "another-command",
          description: "Another test command",
          usage: "/another-command <arg>",
          handler: async (args) => ({
            type: "message",
            message: `Args: ${args.join(" ")}`,
          }),
        },
      ];

      plugin = new TestPlugin("test-plugin", [], [], customCommands);
      const capabilities = await plugin.register(mockContext);

      expect(capabilities.commands).toHaveLength(2);
      expect(capabilities.commands[0].name).toBe("test-command");
      expect(capabilities.commands[0].description).toBe("A test command");
      expect(capabilities.commands[1].name).toBe("another-command");
      expect(capabilities.commands[1].usage).toBe("/another-command <arg>");
    });

    it("should register commands alongside tools and resources", async () => {
      const customTools: PluginTool[] = [
        {
          name: "test-tool",
          description: "A test tool",
          inputSchema: { input: z.string() },
          handler: async () => "tool result",
        },
      ];

      const customResources: PluginResource[] = [
        {
          uri: "test-resource",
          name: "Test Resource",
          description: "A test resource",
          handler: async () => ({
            contents: [{ text: "resource content", uri: "test" }],
          }),
        },
      ];

      const customCommands: Command[] = [
        {
          name: "test-command",
          description: "A test command",
          handler: async () => ({ type: "message", message: "Test executed" }),
        },
      ];

      plugin = new TestPlugin(
        "test-plugin",
        customTools,
        customResources,
        customCommands,
      );
      const capabilities = await plugin.register(mockContext);

      expect(capabilities.tools).toHaveLength(1);
      expect(capabilities.resources).toHaveLength(1);
      expect(capabilities.commands).toHaveLength(1);

      expect(capabilities.tools[0].name).toBe("test-tool");
      expect(capabilities.resources[0].uri).toBe("test-resource");
      expect(capabilities.commands[0].name).toBe("test-command");
    });

    it("should handle command execution patterns", async () => {
      const messageCommand: Command = {
        name: "message-cmd",
        description: "Returns a simple message",
        handler: async (args, context) => ({
          type: "message",
          message: `Message from ${context.userId}: ${args.join(" ")}`,
        }),
      };

      const jobCommand: Command = {
        name: "job-cmd",
        description: "Creates a job",
        handler: async () => ({
          type: "job-operation",
          message: "Job created",
          jobId: "test-job-123",
        }),
      };

      const batchCommand: Command = {
        name: "batch-cmd",
        description: "Creates a batch operation",
        handler: async () => ({
          type: "batch-operation",
          message: "Batch created",
          batchId: "test-batch-456",
          operationCount: 3,
        }),
      };

      plugin = new TestPlugin(
        "test-plugin",
        [],
        [],
        [messageCommand, jobCommand, batchCommand],
      );
      const capabilities = await plugin.register(mockContext);

      expect(capabilities.commands).toHaveLength(3);

      // Test command execution patterns
      const messageResult = await messageCommand.handler(["arg1", "arg2"], {
        userId: "test-user",
        channelId: "test-channel",
        messageId: "test-message",
        timestamp: new Date(),
        interfaceType: "test",
        userPermissionLevel: "public",
      });
      expect(messageResult.type).toBe("message");
      expect(messageResult.message).toBe("Message from test-user: arg1 arg2");

      const jobResult = await jobCommand.handler([], {} as MessageContext);
      expect(jobResult.type).toBe("job-operation");
      expect(jobResult.jobId).toBe("test-job-123");

      const batchResult = await batchCommand.handler([], {} as MessageContext);
      expect(batchResult.type).toBe("batch-operation");
      expect(batchResult.batchId).toBe("test-batch-456");
      expect(batchResult.operationCount).toBe(3);
    });
  });

  describe("Plugin Lifecycle with Commands", () => {
    it("should call getCommands during registration", async () => {
      let getCommandsCalled = false;

      class TestLifecyclePlugin extends BasePlugin {
        constructor() {
          super(
            "lifecycle-test",
            { name: "lifecycle-test", version: "1.0.0" },
            {},
            z.object({}),
            {},
          );
        }

        protected override async getCommands(): Promise<Command[]> {
          getCommandsCalled = true;
          return [
            {
              name: "lifecycle-command",
              description: "Command to test lifecycle",
              handler: async () => ({
                type: "message",
                message: "Lifecycle test",
              }),
            },
          ];
        }
      }

      const lifecyclePlugin = new TestLifecyclePlugin();
      const capabilities = await lifecyclePlugin.register(mockContext);

      expect(getCommandsCalled).toBe(true);
      expect(capabilities.commands).toHaveLength(1);
      expect(capabilities.commands[0].name).toBe("lifecycle-command");
    });

    it("should maintain plugin context after registration", async () => {
      await plugin.register(mockContext);

      // Plugin should have access to context after registration
      expect(() =>
        plugin.determineUserPermissionLevel("test-user"),
      ).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle errors in command handlers gracefully", async () => {
      const errorCommand: Command = {
        name: "error-command",
        description: "Command that throws an error",
        handler: async () => {
          throw new Error("Test error");
        },
      };

      plugin = new TestPlugin("test-plugin", [], [], [errorCommand]);
      const capabilities = await plugin.register(mockContext);

      expect(capabilities.commands).toHaveLength(1);

      // The command should be registered even if it might throw errors
      expect(capabilities.commands[0].name).toBe("error-command");

      // Error handling should be done at the interface level, not during registration
      expect(errorCommand.handler([], {} as MessageContext)).rejects.toThrow(
        "Test error",
      );
    });
  });
});
