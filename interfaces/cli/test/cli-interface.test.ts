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
  let listCommandsMock: ReturnType<typeof mock>;
  let executeCommandMock: ReturnType<typeof mock>;

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

    // Mock listCommands to simulate plugin commands
    listCommandsMock = mock(() =>
      Promise.resolve([
        {
          name: "generate-all",
          description: "Generate content for all sections",
        },
        {
          name: "help",
          description: "Show available commands",
        },
        {
          name: "progress",
          description: "Toggle detailed progress display",
        },
        {
          name: "clear",
          description: "Clear the screen",
        },
      ]),
    );
    mockContext.listCommands = listCommandsMock;

    // Mock executeCommand
    executeCommandMock = mock((commandName: string) => {
      if (commandName === "generate-all") {
        return Promise.resolve({
          type: "message",
          message: "Generating all content...",
        });
      }
      if (commandName === "clear") {
        return Promise.resolve({
          type: "message",
          message: "\x1B[2J\x1B[H",
        });
      }
      if (commandName === "progress") {
        return Promise.resolve({
          type: "message",
          message:
            "Progress display toggled. You can also use Ctrl+P for quick toggle.",
        });
      }
      return Promise.resolve({
        type: "message",
        message: `Unknown command: /${commandName}`,
      });
    });
    mockContext.executeCommand = executeCommandMock;
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

      // /clear returns ANSI escape codes to clear the screen
      expect(responseHandler).toHaveBeenCalledWith("\x1B[2J\x1B[H");
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

      // CLI provides its own commands (progress and clear)
      expect(capabilities.commands).toBeDefined();
      expect(capabilities.commands).toHaveLength(2);

      // Should still have tools and resources
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
    });

    it("should provide CLI-specific commands through getCommands", async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      // Get commands directly (not through plugin system)
      const commands = await cliInterface.getCommands();

      // Should have CLI-specific commands
      expect(commands.length).toBe(2); // progress and clear

      const commandNames = commands.map((cmd) => cmd.name);
      // CLI-specific commands
      expect(commandNames).toContain("progress");
      expect(commandNames).toContain("clear");
    });

    it("should execute plugin commands correctly", async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("/generate-all");

      // Since executeCommandMock returns the message for generate-all,
      // verify it was called
      expect(executeCommandMock).toHaveBeenCalledWith(
        "generate-all",
        [],
        expect.any(Object),
      );
    });
  });
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
