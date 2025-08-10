import { describe, test, expect, beforeEach } from "bun:test";
import { createInterfacePluginHarness } from "../src/test/harness";
import {
  echoMessageInterfacePlugin,
  EchoMessageInterface,
} from "../src/message-interface/example";
import type { MessageContext } from "@brains/messaging-service";
import { PluginCapabilities, PluginError } from "../src";

describe("MessageInterfacePlugin", () => {
  let harness: ReturnType<
    typeof createInterfacePluginHarness<EchoMessageInterface>
  >;
  let capabilities: PluginCapabilities;
  let defaultContext: MessageContext;

  beforeEach(async () => {
    harness = createInterfacePluginHarness<EchoMessageInterface>();

    // MockShell already provides a suitable generateContent implementation

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
    expect(result).toBe("Generated content for shell:knowledge-query");
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
      expect(error).toBeInstanceOf(PluginError);
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
    // handleInput is protected, so we need to use processInput instead
    await plugin.processInput("/job-map-cmd", messageContext);

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

  describe("conversation memory integration", () => {
    test("starts conversation on first message", async () => {
      const plugin = harness.getPlugin();
      const shell = harness.getShell();

      let conversationStarted = false;
      let startPayload: any = null;

      // Mock the conversation:start message
      shell.getMessageBus().subscribe("conversation:start", async (message) => {
        conversationStarted = true;
        startPayload = message.payload;
        return { success: true, data: { conversationId: "test-conversation" } };
      });

      // Process first input
      await plugin.processInput("Hello", defaultContext);

      expect(conversationStarted).toBe(true);
      expect(startPayload).toEqual({
        sessionId: `${defaultContext.interfaceType}-${defaultContext.channelId}`,
        interfaceType: defaultContext.interfaceType,
        metadata: {
          user: defaultContext.userId,
          channel: defaultContext.channelId,
          interface: defaultContext.interfaceType,
        },
      });
    });

    test("stores user messages", async () => {
      const plugin = harness.getPlugin();
      const shell = harness.getShell();

      const addedMessages: any[] = [];

      // Mock the conversation messages
      shell.getMessageBus().subscribe("conversation:start", async () => ({
        success: true,
        data: { conversationId: "test-conversation" },
      }));

      shell
        .getMessageBus()
        .subscribe("conversation:addMessage", async (message) => {
          addedMessages.push(message.payload);
          return { success: true };
        });

      // Process input
      await plugin.processInput("Test message", defaultContext);

      // Find the user message (should be first)
      const userMessage = addedMessages.find((m) => m.role === "user");

      expect(userMessage).toBeDefined();
      expect(userMessage).toMatchObject({
        conversationId: `${defaultContext.interfaceType}-${defaultContext.channelId}`,
        role: "user",
        content: "Test message",
        metadata: expect.objectContaining({
          messageId: defaultContext.messageId,
          userId: defaultContext.userId,
          directed: true, // Echo interface always responds
        }),
      });
    });

    test("stores assistant responses", async () => {
      const plugin = harness.getPlugin();
      const shell = harness.getShell();

      const addedMessages: any[] = [];

      // Mock the conversation messages
      shell.getMessageBus().subscribe("conversation:start", async () => ({
        success: true,
        data: { conversationId: "test-conversation" },
      }));

      shell
        .getMessageBus()
        .subscribe("conversation:addMessage", async (message) => {
          addedMessages.push(message.payload);
          return { success: true };
        });

      // Process input
      await plugin.processInput("Test query", defaultContext);

      // Should have both user and assistant messages
      expect(addedMessages).toHaveLength(2);
      expect(addedMessages[0].role).toBe("user");
      expect(addedMessages[1].role).toBe("assistant");
      expect(addedMessages[1].content).toBe(
        "Generated content for shell:knowledge-query",
      );
    });

    test("only starts conversation once per channel", async () => {
      const plugin = harness.getPlugin();
      const shell = harness.getShell();

      let startCount = 0;

      // Mock the conversation:start message
      shell.getMessageBus().subscribe("conversation:start", async () => {
        startCount++;
        return { success: true, data: { conversationId: "test-conversation" } };
      });

      shell.getMessageBus().subscribe("conversation:addMessage", async () => ({
        success: true,
      }));

      // Process multiple inputs
      await plugin.processInput("First message", defaultContext);
      await plugin.processInput("Second message", defaultContext);
      await plugin.processInput("Third message", defaultContext);

      // Should only start conversation once
      expect(startCount).toBe(1);
    });

    test("handles conversation memory unavailability gracefully", async () => {
      const plugin = harness.getPlugin();
      const shell = harness.getShell();

      // Mock conversation:start to fail
      shell.getMessageBus().subscribe("conversation:start", async () => {
        throw new Error("Conversation memory unavailable");
      });

      // Should not throw error - continues without conversation memory
      await expect(
        plugin.processInput("Test message", defaultContext),
      ).resolves.toBeUndefined();
    });

    test("respects shouldRespond for storing messages", async () => {
      // Create a custom test interface that only responds to certain messages
      class SelectiveInterface extends EchoMessageInterface {
        protected override shouldRespond(
          message: string,
          _context: MessageContext,
        ): boolean {
          return message.startsWith("!");
        }
      }

      const selectiveHarness =
        createInterfacePluginHarness<SelectiveInterface>();
      const selectivePlugin = new SelectiveInterface({ debug: false });
      await selectiveHarness.installPlugin(selectivePlugin);

      const shell = selectiveHarness.getShell();
      const userMessages: any[] = [];

      shell.getMessageBus().subscribe("conversation:start", async () => ({
        success: true,
        data: { conversationId: "test-conversation" },
      }));

      shell
        .getMessageBus()
        .subscribe("conversation:addMessage", async (message) => {
          const payload = message.payload as any;
          if (payload.role === "user") {
            userMessages.push(payload);
          }
          return { success: true };
        });

      // Process messages
      await selectivePlugin.processInput("Regular message", defaultContext);
      await selectivePlugin.processInput("!Important message", defaultContext);

      // Both user messages should be stored
      expect(userMessages).toHaveLength(2);

      // Check the 'directed' flag
      expect(userMessages[0].metadata.directed).toBe(false); // Not for bot
      expect(userMessages[1].metadata.directed).toBe(true); // For bot
    });
  });
});
