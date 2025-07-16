import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  afterAll,
} from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import type { PluginContext } from "@brains/plugin-utils";
import type { MessageContext } from "@brains/message-interface";
import { PluginTestHarness } from "@brains/test-utils";
import type { CLIConfig } from "../src/types";

// Mock console.clear
const originalClear = console.clear;
console.clear = mock(() => {});

// Mock process.exit
const mockExit = mock(() => {});
process.exit = mockExit as any;

describe("CLIInterface", () => {
  let cliInterface: CLIInterface;
  let mockContext: PluginContext;
  let testHarness: PluginTestHarness;
  let generateContentMock: ReturnType<typeof mock>;
  let getAllCommandsMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    mock.restore();

    // Set up test harness
    testHarness = new PluginTestHarness();
    await testHarness.setup();
    mockContext = testHarness.getPluginContext();

    // Mock the generateContent method to track calls
    generateContentMock = mock(() =>
      Promise.resolve({
        message: "Query processed",
        success: true,
        sources: [],
      }),
    );
    mockContext.generateContent = generateContentMock;

    // Mock getAllCommands to simulate plugin commands
    getAllCommandsMock = mock(() =>
      Promise.resolve([
        {
          name: "generate-all",
          description: "Generate content for all sections",
          handler: async () => ({
            type: "message",
            message: "Generating all content...",
          }),
        },
      ]),
    );
    mockContext.getAllCommands = getAllCommandsMock;
  });

  afterEach(async () => {
    if (testHarness) {
      await testHarness.cleanup();
    }
  });

  describe("constructor and configuration", () => {
    it("should create instance with context and default config", async () => {
      cliInterface = new CLIInterface();
      // Register the plugin to set context
      await cliInterface.register(mockContext);
      expect(cliInterface.id).toBe("cli");
      expect(cliInterface.packageName).toBe("@brains/cli");
    });

    it("should create instance with custom config", async () => {
      const config = {
        theme: {
          primaryColor: "#ff0000",
          accentColor: "#00ff00",
        },
      };
      cliInterface = new CLIInterface(config);
      await cliInterface.register(mockContext);
      expect(cliInterface).toBeDefined();
    });
  });

  // Remove handleLocalCommand tests - it's a protected method
  // Test commands through the public processInput method instead

  describe("processInput", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);
    });

    it("should process regular input through handleInput", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("Hello world");

      expect(generateContentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Hello world",
          templateName: "shell:knowledge-query",
          interfacePermissionGrant: "anchor", // CLI grants anchor permissions
        }),
      );
      expect(responseHandler).toHaveBeenCalledWith("Query processed");
    });

    it("should handle /help command", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("/help");

      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Available commands:"),
      );
    });

    it("should handle /clear command", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("/clear");

      // /clear is now handled in EnhancedApp component, not by calling console.clear
      // The handler returns a message about clearing being handled in the component
      expect(responseHandler).toHaveBeenCalledWith("Screen cleared.");
    });

    it("should emit error event on failure", async () => {
      // Override the mock to throw an error
      mockContext.generateContent = mock(() =>
        Promise.reject(new Error("Process failed")),
      );
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await expect(cliInterface.processInput("Failing input")).rejects.toThrow(
        "Process failed",
      );
    });
  });

  describe("callback registration", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);
    });

    it("should support callback registration and unregistration", () => {
      const responseHandler = mock(() => {});
      const progressHandler = mock(() => {});

      // Test registering callbacks
      cliInterface.registerResponseCallback(responseHandler);
      cliInterface.registerProgressCallback(progressHandler);

      // Test unregistering callbacks
      cliInterface.unregisterProgressCallback();
      cliInterface.unregisterMessageCallbacks();
    });
  });

  describe("start and stop", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);
    });

    it("should handle stop when no inkApp", async () => {
      await cliInterface.stop();
      // stop() returns Promise<void>, so we just check it doesn't throw
    });

    // Remove test that accesses private inkApp property
  });

  describe("Command Registration", () => {
    it("should not register interface commands through plugin system", async () => {
      cliInterface = new CLIInterface({
        theme: {
          primaryColor: "#0066cc",
          accentColor: "#ff6600",
        },
      });

      // Register the CLI interface
      const capabilities = await cliInterface.register(mockContext);

      // Should return empty commands array - interface commands are handled separately
      expect(capabilities.commands).toBeDefined();
      expect(capabilities.commands).toHaveLength(0);

      // Should still have tools and resources
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
    });

    it("should provide CLI-specific commands through getCommands", async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      // Get commands directly (not through plugin system)
      const commands = await cliInterface.getCommands();

      // Should have base commands + CLI-specific commands
      expect(commands.length).toBeGreaterThan(5); // More than just base commands

      const commandNames = commands.map((cmd) => cmd.name);
      // Base commands
      expect(commandNames).toContain("help");
      expect(commandNames).toContain("search");
      expect(commandNames).toContain("list");

      // CLI-specific commands
      expect(commandNames).toContain("progress");
      expect(commandNames).toContain("clear");
    });

    it("should combine interface and plugin commands in help text", async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      const helpText = await cliInterface.getHelpText();

      // Should contain interface commands
      expect(helpText).toContain("/help - Show this help message");
      expect(helpText).toContain(
        "/progress - Toggle detailed progress display",
      );
      expect(helpText).toContain("/clear - Clear the screen");

      // Should contain plugin commands from registry
      expect(helpText).toContain(
        "/generate-all - Generate content for all sections",
      );

      // Verify getAllCommands was called to get plugin commands
      expect(getAllCommandsMock).toHaveBeenCalled();
    });

    it("should execute plugin commands correctly", async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      const context: MessageContext = {
        userId: "test-user",
        channelId: "test-channel",
        messageId: "test-message",
        timestamp: new Date(),
        interfaceType: "cli",
        userPermissionLevel: "anchor",
      };

      const result = await cliInterface.executeCommand(
        "/generate-all",
        context,
      );

      expect(result.message).toBe("Generating all content...");
      expect(getAllCommandsMock).toHaveBeenCalled();
    });
  });
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
