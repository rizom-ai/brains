import { describe, it, expect, beforeEach } from "bun:test";
import {
  PluginTester,
  createMockPlugin,
  createMockTool,
  createErrorPlugin,
  createProgressPlugin,
} from "../src";

describe("PluginTester", () => {
  let tester: PluginTester;

  describe("with basic mock plugin", () => {
    beforeEach(() => {
      const plugin = createMockPlugin({
        id: "test-plugin",
        tools: [
          createMockTool("test_tool"),
          createMockTool("validate_tool", {
            inputSchema: {},
          }),
        ],
      });
      tester = new PluginTester(plugin);
    });

    it("should test plugin registration", async () => {
      await tester.testRegistration();
      
      const capabilities = tester.getCapabilities();
      expect(capabilities).toBeDefined();
      expect(capabilities?.tools).toHaveLength(2);
    });

    it("should test tools structure", async () => {
      await tester.testToolsStructure();
    });

    it("should test tool execution", async () => {
      const result = await tester.testToolExecution("test_tool");
      expect(result).toEqual({ success: true, input: {} });
    });

    it("should get tool names", async () => {
      await tester.testRegistration();
      const names = tester.getToolNames();
      expect(names).toEqual(["test_tool", "validate_tool"]);
    });

    it("should find tool by name", async () => {
      await tester.testRegistration();
      const tool = tester.findTool("test_tool");
      expect(tool.name).toBe("test_tool");
    });
  });

  describe("with error plugin", () => {
    it("should handle registration errors", async () => {
      const plugin = createErrorPlugin({
        errorOnRegister: true,
        errorMessage: "Registration failed",
      });
      tester = new PluginTester(plugin);

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(tester.testRegistration()).rejects.toThrow(
        "Registration failed",
      );
    });

    it("should handle tool execution errors", async () => {
      const plugin = createErrorPlugin({
        errorOnToolExecution: true,
        errorMessage: "Tool execution failed",
      });
      tester = new PluginTester(plugin);

      await tester.testRegistration();
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(tester.testToolExecution("error_tool")).rejects.toThrow(
        "Tool execution failed",
      );
    });
  });

  describe("with progress plugin", () => {
    it("should test progress reporting", async () => {
      const plugin = createProgressPlugin();
      tester = new PluginTester(plugin);

      await tester.testRegistration();
      
      // Mock progress callback
      let progressCount = 0;
      const sendProgress = async (): Promise<void> => {
        progressCount++;
      };

      const tool = tester.findTool("progress_tool");
      const result = await tool.handler(
        { steps: 3, delay: 10 },
        { sendProgress },
      );

      expect(result).toEqual({ completed: true, steps: 3 });
      expect(progressCount).toBe(3);
    });
  });

  describe("shutdown testing", () => {
    it("should test plugin shutdown", async () => {
      let shutdownCalled = false;
      const plugin = createMockPlugin({
        onShutdown: async () => {
          shutdownCalled = true;
        },
      });
      tester = new PluginTester(plugin);

      await tester.testShutdown();
      expect(shutdownCalled).toBe(true);
    });
  });
});