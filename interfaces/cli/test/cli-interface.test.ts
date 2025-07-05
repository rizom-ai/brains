import { describe, it, expect, beforeEach, afterEach, mock, afterAll } from "bun:test";
import { CLIInterface } from "../src/cli-interface";
import type { PluginContext, MessageContext } from "@brains/plugin-utils";
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
        shortcuts: {
          h: "/help",
          q: "/quit",
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
      cliInterface.on("response", responseHandler);

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
      cliInterface.on("response", responseHandler);

      await cliInterface.processInput("/help");

      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Available commands:"),
      );
    });

    it("should handle /clear command", async () => {
      const responseHandler = mock(() => {});
      cliInterface.on("response", responseHandler);

      await cliInterface.processInput("/clear");

      expect(console.clear).toHaveBeenCalled();
      expect(responseHandler).toHaveBeenCalledWith("");
    });

    it("should emit error event on failure", async () => {
      // Override the mock to throw an error
      mockContext.generateContent = mock(() =>
        Promise.reject(new Error("Process failed")),
      );
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);

      const errorHandler = mock(() => {});
      cliInterface.on("error", errorHandler);

      await cliInterface.processInput("Failing input");

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("event emitter", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await cliInterface.register(mockContext);
    });

    it("should support event listeners", () => {
      const responseHandler = mock(() => {});
      const errorHandler = mock(() => {});

      // Test adding listeners
      cliInterface.on("response", responseHandler);
      cliInterface.on("error", errorHandler);

      // Listeners will be called when processInput triggers events
      // We've already tested this in the processInput tests above

      // Test removing listeners
      cliInterface.off("response", responseHandler);
      cliInterface.off("error", errorHandler);
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
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
