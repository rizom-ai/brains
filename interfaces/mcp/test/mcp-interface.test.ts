import { describe, it, expect, beforeEach } from "bun:test";
import { MCPInterface } from "../src/mcp-interface";
import { PluginTestHarness } from "@brains/test-utils";

describe("MCPInterface", () => {
  let harness: PluginTestHarness;

  beforeEach(() => {
    harness = new PluginTestHarness();
  });

  describe("constructor and configuration", () => {
    it("should create instance with default config (stdio)", () => {
      const mcpInterface = new MCPInterface();
      expect(mcpInterface.id).toBe("mcp");
      expect(mcpInterface.packageName).toBe("@brains/mcp");
    });

    it("should create instance with http config", () => {
      const config = {
        transport: "http" as const,
        httpPort: 8080,
      };
      const mcpInterface = new MCPInterface(config);
      expect(mcpInterface).toBeDefined();
    });
  });

  describe("permission levels", () => {
    it("should grant anchor permissions for stdio transport", async () => {
      const mcpInterface = new MCPInterface({ transport: "stdio" });
      await harness.installPlugin(mcpInterface);

      // TODO: Once we integrate McpServerManager, verify anchor permissions are used
    });

    it("should grant public permissions for http transport", async () => {
      const mcpInterface = new MCPInterface({ transport: "http" });
      await harness.installPlugin(mcpInterface);

      // TODO: Once we integrate McpServerManager, verify public permissions are used
    });
  });

  describe("lifecycle methods", () => {
    it("should register without errors", async () => {
      const mcpInterface = new MCPInterface();
      await harness.installPlugin(mcpInterface);
      // Should not throw
    });

    it("should start and stop without errors", async () => {
      const mcpInterface = new MCPInterface();
      await harness.installPlugin(mcpInterface);
      await mcpInterface.start();
      await mcpInterface.stop();
      // Should not throw
    });
  });
});
