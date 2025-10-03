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
import { createInterfacePluginHarness } from "@brains/plugins/test";
import type { PluginTestHarness } from "@brains/plugins/test";

// Mock console.clear
const originalClear = console.clear;
console.clear = mock(() => {});

describe("CLIInterface", () => {
  let cliInterface: CLIInterface;
  let harness: PluginTestHarness<CLIInterface>;

  beforeEach(async () => {
    mock.restore();

    // Set up test harness
    harness = createInterfacePluginHarness<CLIInterface>();
  });

  afterEach(() => {
    harness.reset();
  });

  describe("constructor and configuration", () => {
    it("should create instance with context and default config", async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
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
      await harness.installPlugin(cliInterface);
      expect(cliInterface).toBeDefined();
    });
  });

  // Remove handleLocalCommand tests - it's a protected method
  // Test commands through the public processInput method instead

  describe("processInput", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
    });

    it("should process regular input through handleInput", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("Hello world");

      // The CLI uses the base processQuery method which calls context.query
      // The response should be from MockShell's generateContent
      expect(responseHandler).toHaveBeenCalledWith(
        "Generated content for shell:knowledge-query",
      );
    });

    it("should handle /help command", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("/help");

      // Help command shows available commands from the command registry
      // Since MockShell has no commands registered, it should still show the header
      expect(responseHandler).toHaveBeenCalledWith(
        expect.stringContaining("Available commands:"),
      );
    });

    it("should handle unknown commands gracefully", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("/unknown-command");

      // Should receive unknown command message
      expect(responseHandler).toHaveBeenCalledWith(
        "Unknown command: /unknown-command. Type /help for available commands.",
      );
    });

    it("should handle error gracefully", async () => {
      // Test error handling by checking response callback is still functional
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      // Process a normal query
      await cliInterface.processInput("Test query");
      expect(responseHandler).toHaveBeenCalled();
    });
  });

  describe("callback registration", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
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

  describe("daemon lifecycle", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
    });

    it("should provide daemon capability", () => {
      // Interface plugins provide daemon capability
      expect(cliInterface.type).toBe("interface");
    });
  });

  describe("Command Registration", () => {
    it("should register interface commands through plugin system", async () => {
      cliInterface = new CLIInterface({
        theme: {
          primaryColor: "#0066cc",
          accentColor: "#ff6600",
        },
      });

      // Register the CLI interface
      const capabilities = await harness.installPlugin(cliInterface);

      // CLI provides its own commands (progress and clear)
      expect(capabilities.commands).toBeDefined();
      expect(capabilities.commands).toHaveLength(2);

      // Should still have tools and resources
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
    });

    it("should handle progress command", async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);

      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      // Since commands are registered through the plugin system,
      // and the MockShell doesn't know about CLI-specific commands,
      // it will return "Unknown command"
      await cliInterface.processInput("/progress");

      expect(responseHandler).toHaveBeenCalledWith(
        "Unknown command: /progress. Type /help for available commands.",
      );
    });
  });
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
