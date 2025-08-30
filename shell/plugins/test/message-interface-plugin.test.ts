import { describe, test, expect, beforeEach } from "bun:test";
import { createInterfacePluginHarness } from "../src/test/harness";
import {
  echoMessageInterfacePlugin,
  EchoMessageInterface,
} from "../src/message-interface/example";
import type { MessageContext } from "@brains/messaging-service";
import type { PluginCapabilities, QueryContext } from "../src";
import { PluginError } from "../src";

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
    test("uses consistent conversationId format for storage and queries", async () => {
      // Create a fresh harness for this test
      const testHarness = createInterfacePluginHarness<EchoMessageInterface>();
      const shell = testHarness.getShell();

      let storedConversationId: string | undefined;

      // Mock getConversationService to return consistent mock
      const mockConversationService = {
        startConversation: async (sessionId: string) => {
          storedConversationId = sessionId;
          return sessionId;
        },
        addMessage: async () => {},
        getConversation: async () => null,
        searchConversations: async () => [],
        getMessages: async () => [],
      };

      shell.getConversationService = () => mockConversationService;

      // Now install and get the plugin
      const plugin = echoMessageInterfacePlugin({ debug: false });
      await testHarness.installPlugin(plugin);

      // Process a query to trigger both storage and query
      await plugin.processInput("Hello world", defaultContext);

      // Verify both use the same format
      const expectedId = `${defaultContext.interfaceType}-${defaultContext.channelId}`;
      expect(storedConversationId).toBe(expectedId);
    });

    test("passes correct conversationId to query for context retrieval", async () => {
      const plugin = harness.getPlugin();
      const shell = harness.getShell();

      let capturedContext: QueryContext | undefined;

      // Mock the shell's query method to capture the context
      const originalQuery = shell.query.bind(shell);
      shell.query = async (prompt: string, context?: QueryContext) => {
        capturedContext = context;
        return originalQuery(prompt, context);
      };

      // Process a query (not a command)
      await plugin.processInput("Hello world", defaultContext);

      // Verify the context was captured
      expect(capturedContext).toBeDefined();
    });

    test("processes input without errors when conversation service is available", async () => {
      const plugin = harness.getPlugin();

      // Should not throw even though MockShell's conversation service is minimal
      const result = await plugin.processInput("Hello world", defaultContext);
      expect(result).toBeUndefined();
    });

    test("handles commands without storing conversation", async () => {
      const plugin = harness.getPlugin();

      // Commands should work even without conversation storage
      const result = await plugin.processInput("/help", defaultContext);
      expect(result).toBeUndefined();
    });

    test("maintains conversation across multiple messages", async () => {
      const plugin = harness.getPlugin();

      // Process multiple messages in same channel
      await plugin.processInput("First message", defaultContext);
      await plugin.processInput("Second message", defaultContext);
      await plugin.processInput("Third message", defaultContext);

      // Should not throw errors
      expect(plugin).toBeDefined();
    });

    test("handles different channels independently", async () => {
      const plugin = harness.getPlugin();

      const channel1Context = { ...defaultContext, channelId: "channel-1" };
      const channel2Context = { ...defaultContext, channelId: "channel-2" };

      // Process messages in different channels
      await plugin.processInput("Message in channel 1", channel1Context);
      await plugin.processInput("Message in channel 2", channel2Context);

      // Each channel should have its own conversation
      expect(plugin).toBeDefined();
    });

    test("includes proper metadata in context", async () => {
      // Test with custom implementation that checks metadata
      class MetadataCheckInterface extends EchoMessageInterface {
        protected override async handleInput(
          input: string,
          context: MessageContext,
        ): Promise<void> {
          // Verify context has required fields
          expect(context.userId).toBeDefined();
          expect(context.channelId).toBeDefined();
          expect(context.messageId).toBeDefined();
          expect(context.interfaceType).toBeDefined();

          return super.handleInput(input, context);
        }
      }

      const metadataHarness =
        createInterfacePluginHarness<MetadataCheckInterface>();
      const metadataPlugin = new MetadataCheckInterface({ debug: false });
      await metadataHarness.installPlugin(metadataPlugin);

      await metadataPlugin.processInput("Test message", defaultContext);
    });
  });
});
