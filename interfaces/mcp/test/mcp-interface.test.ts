import { describe, expect, it, beforeEach } from "bun:test";
import { MCPInterface } from "../src/mcp-interface";
import { PluginTestHarness } from "@brains/test-utils";

describe("MCPInterface", () => {
  let harness: PluginTestHarness;

  beforeEach(() => {
    harness = new PluginTestHarness();
  });

  describe("initialization", () => {
    it("should create instance with default config", () => {
      const plugin = new MCPInterface();
      expect(plugin.id).toBe("mcp");
      expect(plugin.packageName).toBe("@brains/mcp");
    });

    it("should create instance with stdio transport", () => {
      const plugin = new MCPInterface({ transport: "stdio" });
      expect(plugin.id).toBe("mcp");
    });

    it("should create instance with http transport", () => {
      const plugin = new MCPInterface({
        transport: "http",
        httpPort: 3001,
      });
      expect(plugin.id).toBe("mcp");
    });
  });

  describe("registration", () => {
    it("should register with stdio transport and anchor permissions", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });
      const context = harness.getPluginContext();

      const capabilities = await plugin.register(context);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });

    it("should register with http transport and public permissions", async () => {
      const plugin = new MCPInterface({ transport: "http" });
      const context = harness.getPluginContext();

      const capabilities = await plugin.register(context);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });
  });

  describe("lifecycle", () => {
    it("should handle start/stop with stdio transport", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });
      const context = harness.getPluginContext();

      await plugin.register(context);

      // Should not throw
      await expect(plugin.start()).resolves.toBeUndefined();
      await expect(plugin.stop()).resolves.toBeUndefined();
    });

    it("should warn about unimplemented http transport", async () => {
      const plugin = new MCPInterface({ transport: "http" });
      const context = harness.getPluginContext();

      await plugin.register(context);

      // Start should complete without error (logs warning)
      await expect(plugin.start()).resolves.toBeUndefined();
      await expect(plugin.stop()).resolves.toBeUndefined();
    });
  });
});
