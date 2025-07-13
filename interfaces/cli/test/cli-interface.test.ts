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
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
