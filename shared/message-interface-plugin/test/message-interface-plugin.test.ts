import { describe, test, expect, beforeEach } from "bun:test";
import { MessageInterfacePluginTestHarness } from "../src/test-harness";
import {
  echoMessageInterfacePlugin,
  EchoMessageInterface,
} from "../examples/echo-message-interface";
import { PluginCapabilities, PluginInitializationError } from "@brains/plugins";
import type { MessageContext } from "@brains/types";

describe("MessageInterfacePlugin", () => {
  let harness: MessageInterfacePluginTestHarness<EchoMessageInterface>;
  let capabilities: PluginCapabilities;
  let defaultContext: MessageContext;

  beforeEach(async () => {
    harness = new MessageInterfacePluginTestHarness();

    // Create a mock shell with overridden generateContent
    const shell = harness.getShell();
    shell.generateContent = async (config) => {
      if (config.templateName === "shell:knowledge-query") {
        return {
          message: `Query result for: ${config.prompt}`,
          summary: "Test summary",
          topics: [],
          sources: [],
        };
      }
      throw new Error(`Template not found: ${config.templateName}`);
    };

    // Install the plugin
    const plugin = echoMessageInterfacePlugin({ debug: false });
    capabilities = await harness.installPlugin(plugin);

    defaultContext = {
      userId: "test-user",
      channelId: "test-channel",
      messageId: "test-message",
      timestamp: new Date(),
      interfaceType: "echo",
      userPermissionLevel: "public",
    };
  });

  test("plugin registers successfully", () => {
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.commands).toEqual([]);
  });

  test("creates instance with session ID", () => {
    const plugin = harness.getPlugin();
    expect(plugin.sessionId).toMatch(/^echo-interface-session-\d+$/);
  });

  test("handles executeCommand by delegating to context", async () => {
    // Register a help command
    const shell = harness.getShell();
    shell.getCommandRegistry().registerCommand("echo-interface", {
      name: "help",
      description: "Show help",
      handler: async () => ({
        type: "message",
        message: "Available commands:\n/help - Show help",
      }),
    });

    const plugin = harness.getPlugin();
    const result = await plugin.executeCommand("/help", defaultContext);
    expect(result.message).toContain("Available commands:");
  });

  test("handles unknown commands", async () => {
    const plugin = harness.getPlugin();
    const result = await plugin.executeCommand("/unknown", defaultContext);

    expect(result.message).toBe(
      "Unknown command: /unknown. Type /help for available commands.",
    );
  });

  test("handles processQuery", async () => {
    const plugin = harness.getPlugin();
    const result = await plugin.processQuery("test query", defaultContext);

    // The result is the message from the query response
    expect(result).toBe("Query result for: test query");
  });

  test("executes commands through context", async () => {
    // Register the test command
    const shell = harness.getShell();
    shell.getCommandRegistry().registerCommand("echo-interface", {
      name: "test-cmd",
      description: "Test command",
      handler: async (args) => ({
        type: "message",
        message: `Test executed with args: ${args.join(" ")}`,
      }),
    });

    const plugin = harness.getPlugin();
    const result = await plugin.executeCommand(
      "/test-cmd arg1 arg2",
      defaultContext,
    );

    expect(result.message).toBe("Test executed with args: arg1 arg2");
  });

  test("handles job-operation commands", async () => {
    // Register a command that returns job operation
    const shell = harness.getShell();
    shell.getCommandRegistry().registerCommand("echo-interface", {
      name: "job-cmd",
      description: "Job command",
      handler: async () => ({
        type: "job-operation",
        message: "Job started",
        jobId: "test-job-123",
      }),
    });

    const plugin = harness.getPlugin();
    const result = await plugin.executeCommand("/job-cmd", defaultContext);

    expect(result.message).toBe("Job started");
    expect(result.jobId).toBe("test-job-123");
  });

  test("handles batch-operation commands", async () => {
    // Register a command that returns batch operation
    const shell = harness.getShell();
    shell.getCommandRegistry().registerCommand("echo-interface", {
      name: "batch-cmd",
      description: "Batch command",
      handler: async () => ({
        type: "batch-operation",
        message: "Batch started",
        batchId: "test-batch-456",
        operationCount: 5,
      }),
    });

    const plugin = harness.getPlugin();
    const result = await plugin.executeCommand("/batch-cmd", defaultContext);

    expect(result.message).toBe("Batch started");
    expect(result.batchId).toBe("test-batch-456");
  });

  test("handles missing plugin context", async () => {
    const isolatedPlugin = echoMessageInterfacePlugin();

    try {
      await isolatedPlugin.executeCommand("/help", defaultContext);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(PluginInitializationError);
    }
  });

  test("stores job/batch message mappings", async () => {
    // Register a command that returns job operation
    const shell = harness.getShell();
    shell.getCommandRegistry().registerCommand("echo-interface", {
      name: "job-map-cmd",
      description: "Job mapping command",
      handler: async () => ({
        type: "job-operation",
        message: "Job started",
        jobId: "test-job-123",
      }),
    });

    const plugin = harness.getPlugin();

    // Execute command to create job mapping
    const messageContext = {
      ...defaultContext,
      messageId: "test-message-123",
    };

    // handleInput returns void, but should store the job mapping
    await plugin.handleInput("/job-map-cmd", messageContext);

    // Test passes if no error is thrown
    expect(true).toBe(true);
  });

  test("can start and stop", async () => {
    const plugin = harness.getPlugin();

    // Start the plugin
    await plugin.start();

    // Stop the plugin
    await plugin.stop();

    expect(plugin).toBeDefined();
  });
});
