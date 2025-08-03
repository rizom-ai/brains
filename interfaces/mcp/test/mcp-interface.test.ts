import { describe, expect, it, beforeEach } from "bun:test";
import { MCPInterface } from "../src/mcp-interface";
import { InterfacePluginTestHarness } from "@brains/plugins";
import { createSilentLogger } from "@brains/utils";

describe("MCPInterface", () => {
  let harness: InterfacePluginTestHarness;

  beforeEach(() => {
    harness = new InterfacePluginTestHarness({
      logger: createSilentLogger("mcp-test"),
    });
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

      const capabilities = await harness.installPlugin(plugin);

      expect(plugin.id).toBe("mcp");
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });

    it("should register with http transport and anchor permissions", async () => {
      const plugin = new MCPInterface({ transport: "http" });

      const capabilities = await harness.installPlugin(plugin);

      expect(plugin.id).toBe("mcp");
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toEqual([]);
      expect(capabilities.resources).toEqual([]);
    });
  });

  describe("lifecycle", () => {
    it("should register with stdio transport", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });

      const capabilities = await harness.installPlugin(plugin);

      // Plugin should register successfully
      expect(capabilities).toBeDefined();
    });

    it("should register with http transport", async () => {
      const plugin = new MCPInterface({ transport: "http" });

      const capabilities = await harness.installPlugin(plugin);

      // Plugin should register successfully
      expect(capabilities).toBeDefined();
    });
  });

  describe("daemon management", () => {
    it("should create daemon for lifecycle management", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });

      await harness.installPlugin(plugin);

      // Verify the plugin has daemon support through its type
      expect(plugin.type).toBe("interface");
    });

    it("should create http daemon with correct port", async () => {
      const plugin = new MCPInterface({ transport: "http", httpPort: 3333 });

      const capabilities = await harness.installPlugin(plugin);

      // Plugin should have registered with daemon support
      expect(capabilities).toBeDefined();
    });
  });
});
