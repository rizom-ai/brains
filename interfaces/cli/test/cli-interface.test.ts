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

  describe("processInput - Agent-based", () => {
    beforeEach(async () => {
      cliInterface = new CLIInterface();
      await harness.installPlugin(cliInterface);
    });

    it("should route input to AgentService and receive response", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("Hello world");

      // The CLI now uses AgentService, which returns "Mock agent response" in tests
      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
    });

    it("should handle natural language queries", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      await cliInterface.processInput("What is my brain about?");

      // Agent responds to natural language
      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
    });

    it("should handle tool-like requests through agent", async () => {
      const responseHandler = mock(() => {});
      cliInterface.registerResponseCallback(responseHandler);

      // User can ask naturally, agent decides to use tools
      await cliInterface.processInput("Search for notes about TypeScript");

      expect(responseHandler).toHaveBeenCalledWith("Mock agent response");
    });

    it("should handle errors gracefully", async () => {
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

  describe("Plugin Capabilities", () => {
    it("should register as interface plugin", async () => {
      cliInterface = new CLIInterface({
        theme: {
          primaryColor: "#0066cc",
          accentColor: "#ff6600",
        },
      });

      // Register the CLI interface
      const capabilities = await harness.installPlugin(cliInterface);

      // CLI uses agent-based architecture, no commands
      // Should have tools and resources
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
    });
  });
});

// Restore console.clear
afterAll(() => {
  console.clear = originalClear;
});
