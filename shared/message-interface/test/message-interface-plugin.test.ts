import { describe, expect, it, beforeEach, mock } from "bun:test";
import { MessageInterfacePlugin } from "../src/base/message-interface-plugin";
import type { MessageContext, Command } from "../src/base/types";
import type { JobProgressEvent } from "@brains/job-queue";
import type { JobContext } from "@brains/db";
import { PluginTestHarness } from "@brains/test-utils";
import { z } from "zod";

// Test implementation
class TestMessageInterface extends MessageInterfacePlugin<object> {
  private customCommands: Command[] = [];

  constructor(customCommands: Command[] = []) {
    super(
      "test-interface",
      { name: "test-interface", version: "1.0.0" },
      {},
      z.object({}),
      {},
    );
    this.customCommands = customCommands;
  }

  protected async handleProgressEvent(
    _progressEvent: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    // Test implementation
  }

  protected async sendMessage(
    _content: string,
    _context: MessageContext,
    _replyToId?: string,
  ): Promise<string> {
    return "test-message-id";
  }

  protected async editMessage(
    _messageId: string,
    _content: string,
    _context: MessageContext,
  ): Promise<void> {
    // Test implementation
  }

  public async start(): Promise<void> {
    // Test implementation
  }

  public async stop(): Promise<void> {
    // Test implementation
  }

  // Override getCommands to add custom test commands
  protected override async getCommands(): Promise<Command[]> {
    const baseCommands = await super.getCommands();
    return [...baseCommands, ...this.customCommands];
  }
}

describe("MessageInterfacePlugin", () => {
  let plugin: TestMessageInterface;

  beforeEach(() => {
    plugin = new TestMessageInterface();
  });

  it("should create instance with session ID", () => {
    expect(plugin.sessionId).toMatch(/^test-interface-session-\d+$/);
  });

  it("should handle commands", async () => {
    const result = await plugin.executeCommand("/help", {
      userId: "test-user",
      channelId: "test-channel",
      messageId: "test-message",
      timestamp: new Date(),
      interfaceType: "test",
      userPermissionLevel: "public",
    });

    expect(result.message).toContain("Available commands:");
    expect(result.message).toContain("/help");
    expect(result.message).toContain("/search");
    expect(result.message).toContain("/list");
  });

  it("should handle unknown commands", async () => {
    const result = await plugin.executeCommand("/unknown", {
      userId: "test-user",
      channelId: "test-channel",
      messageId: "test-message",
      timestamp: new Date(),
      interfaceType: "test",
      userPermissionLevel: "public",
    });

    expect(result.message).toBe(
      "Unknown command: /unknown. Type /help for available commands.",
    );
  });

  describe("Command Registration System", () => {
    it("should return default base commands", async () => {
      const commands = await plugin.getCommands();

      expect(commands).toHaveLength(5); // help, search, list, test-progress, test-batch

      const commandNames = commands.map((cmd) => cmd.name);
      expect(commandNames).toContain("help");
      expect(commandNames).toContain("search");
      expect(commandNames).toContain("list");
      expect(commandNames).toContain("test-progress");
      expect(commandNames).toContain("test-batch");
    });

    it("should allow plugins to add custom commands", async () => {
      const customCommands: Command[] = [
        {
          name: "custom",
          description: "A custom test command",
          handler: async () => ({
            type: "message",
            message: "Custom command executed",
          }),
        },
        {
          name: "another",
          description: "Another custom command",
          usage: "/another <arg>",
          handler: async (args) => ({
            type: "message",
            message: `Another command with args: ${args.join(" ")}`,
          }),
        },
      ];

      const pluginWithCustomCommands = new TestMessageInterface(customCommands);
      const commands = await pluginWithCustomCommands.getCommands();

      expect(commands).toHaveLength(7); // 5 base + 2 custom

      const commandNames = commands.map((cmd) => cmd.name);
      expect(commandNames).toContain("custom");
      expect(commandNames).toContain("another");
    });

    it("should execute custom commands correctly", async () => {
      const customCommands: Command[] = [
        {
          name: "test-cmd",
          description: "Test command",
          handler: async (args, context) => ({
            type: "message",
            message: `Test executed by ${context.userId} with args: ${args.join(" ")}`,
          }),
        },
      ];

      const pluginWithCustomCommands = new TestMessageInterface(customCommands);

      const result = await pluginWithCustomCommands.executeCommand(
        "/test-cmd arg1 arg2",
        {
          userId: "test-user",
          channelId: "test-channel",
          messageId: "test-message",
          timestamp: new Date(),
          interfaceType: "test",
          userPermissionLevel: "public",
        },
      );

      expect(result.message).toBe(
        "Test executed by test-user with args: arg1 arg2",
      );
    });

    it("should handle job-operation commands", async () => {
      const customCommands: Command[] = [
        {
          name: "job-cmd",
          description: "Command that creates a job",
          handler: async () => ({
            type: "job-operation",
            message: "Job started",
            jobId: "test-job-123",
          }),
        },
      ];

      const pluginWithCustomCommands = new TestMessageInterface(customCommands);

      const result = await pluginWithCustomCommands.executeCommand("/job-cmd", {
        userId: "test-user",
        channelId: "test-channel",
        messageId: "test-message",
        timestamp: new Date(),
        interfaceType: "test",
        userPermissionLevel: "public",
      });

      expect(result.message).toBe("Job started");
      expect(result.jobId).toBe("test-job-123");
    });

    it("should handle batch-operation commands", async () => {
      const customCommands: Command[] = [
        {
          name: "batch-cmd",
          description: "Command that creates a batch",
          handler: async () => ({
            type: "batch-operation",
            message: "Batch started",
            batchId: "test-batch-456",
            operationCount: 5,
          }),
        },
      ];

      const pluginWithCustomCommands = new TestMessageInterface(customCommands);

      const result = await pluginWithCustomCommands.executeCommand(
        "/batch-cmd",
        {
          userId: "test-user",
          channelId: "test-channel",
          messageId: "test-message",
          timestamp: new Date(),
          interfaceType: "test",
          userPermissionLevel: "public",
        },
      );

      expect(result.message).toBe("Batch started");
      expect(result.batchId).toBe("test-batch-456");
    });

    it("should include custom commands in help text", async () => {
      const customCommands: Command[] = [
        {
          name: "custom-help",
          description: "Custom command for help test",
          usage: "/custom-help [option]",
          handler: async () => ({
            type: "message",
            message: "Custom help executed",
          }),
        },
      ];

      const pluginWithCustomCommands = new TestMessageInterface(customCommands);
      const helpText = await pluginWithCustomCommands.getHelpText();

      expect(helpText).toContain(
        "/custom-help [option] - Custom command for help test",
      );
      // Should also contain base commands
      expect(helpText).toContain("/help - Show this help message");
      expect(helpText).toContain(
        "/search <query> - Search your knowledge base",
      );
    });

    it("should preserve command order (base commands first, then custom)", async () => {
      const customCommands: Command[] = [
        {
          name: "z-last",
          description:
            "Should come after base commands despite alphabetical order",
          handler: async () => ({ type: "message", message: "Last command" }),
        },
        {
          name: "a-first",
          description:
            "Should come after base commands despite alphabetical order",
          handler: async () => ({ type: "message", message: "First command" }),
        },
      ];

      const pluginWithCustomCommands = new TestMessageInterface(customCommands);
      const commands = await pluginWithCustomCommands.getCommands();

      const commandNames = commands.map((cmd) => cmd.name);

      // Base commands should come first
      expect(commandNames[0]).toBe("help");
      expect(commandNames[1]).toBe("search");
      expect(commandNames[2]).toBe("list");
      expect(commandNames[3]).toBe("test-progress");
      expect(commandNames[4]).toBe("test-batch");

      // Custom commands should come after, in the order they were added
      expect(commandNames[5]).toBe("z-last");
      expect(commandNames[6]).toBe("a-first");
    });
  });

  describe("Command Deduplication", () => {
    it("should include plugin commands in help text without duplicates", async () => {
      const testHarness = new PluginTestHarness();
      await testHarness.setup();

      const mockPluginCommands: Command[] = [
        {
          name: "generate-all",
          description: "Generate content for all sections",
          usage: "/generate-all [--dry-run]",
          handler: async () => ({ type: "message", message: "Generating..." }),
        },
      ];

      const context = testHarness.getPluginContext();
      context.getAllCommands = mock(() => Promise.resolve(mockPluginCommands));

      const plugin = new TestMessageInterface();
      await plugin.register(context);

      const helpText = await plugin.getHelpText();

      // Should contain both interface and plugin commands
      expect(helpText).toContain("/help - Show this help message");
      expect(helpText).toContain(
        "/generate-all [--dry-run] - Generate content for all sections",
      );

      // Count occurrences of each command to ensure no duplicates
      const helpLines = helpText.split("\n");
      const helpCount = helpLines.filter((line) =>
        line.includes("/help"),
      ).length;
      const generateCount = helpLines.filter((line) =>
        line.includes("/generate-all"),
      ).length;

      expect(helpCount).toBe(1);
      expect(generateCount).toBe(1);

      await testHarness.cleanup();
    });

    it("should execute plugin commands correctly", async () => {
      const testHarness = new PluginTestHarness();
      await testHarness.setup();

      const mockPluginCommands: Command[] = [
        {
          name: "plugin-exec",
          description: "Test plugin command execution",
          handler: async (args) => ({
            type: "message",
            message: `Plugin executed with: ${args.join(" ")}`,
          }),
        },
      ];

      const context = testHarness.getPluginContext();
      context.getAllCommands = mock(() => Promise.resolve(mockPluginCommands));

      const plugin = new TestMessageInterface();
      await plugin.register(context);

      const result = await plugin.executeCommand("/plugin-exec arg1 arg2", {
        userId: "test-user",
        channelId: "test-channel",
        messageId: "test-message",
        timestamp: new Date(),
        interfaceType: "test",
        userPermissionLevel: "public",
      });

      expect(result.message).toBe("Plugin executed with: arg1 arg2");

      await testHarness.cleanup();
    });

    it("should handle missing plugin context gracefully", async () => {
      const plugin = new TestMessageInterface();
      // No context set - not calling register()

      const helpText = await plugin.getHelpText();

      // Should still work with only interface commands
      expect(helpText).toContain("/help - Show this help message");
      expect(helpText).toContain(
        "/search <query> - Search your knowledge base",
      );

      // But no plugin commands
      expect(helpText).not.toContain("/generate-all");
    });

    it("should handle plugin command errors gracefully", async () => {
      const testHarness = new PluginTestHarness();
      await testHarness.setup();

      const context = testHarness.getPluginContext();
      context.getAllCommands = mock(() =>
        Promise.reject(new Error("Registry error")),
      );

      const plugin = new TestMessageInterface();
      await plugin.register(context);

      // Should not throw when getting help
      const helpText = await plugin.getHelpText();

      // Should still show interface commands
      expect(helpText).toContain("/help - Show this help message");

      await testHarness.cleanup();
    });
  });
});
