import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { MCPServer } from "@/server/mcpServer";
import { createSilentLogger } from "@personal-brain/utils";

describe("MCPServer", () => {
  let mcpServer: MCPServer;

  beforeEach(() => {
    mcpServer = MCPServer.createFresh({
      name: "TestMCP",
      version: "1.0.0",
      logger: createSilentLogger(),
    });
  });

  afterEach(() => {
    mcpServer.stop();
    MCPServer.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const instance1 = MCPServer.getInstance({ logger: createSilentLogger() });
      const instance2 = MCPServer.getInstance({ logger: createSilentLogger() });
      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = MCPServer.getInstance({ logger: createSilentLogger() });
      MCPServer.resetInstance();
      const instance2 = MCPServer.getInstance({ logger: createSilentLogger() });
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance", () => {
      const instance1 = MCPServer.getInstance({ logger: createSilentLogger() });
      const instance2 = MCPServer.createFresh({ logger: createSilentLogger() });
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Server Creation", () => {
    it("should create server with default config", () => {
      const defaultServer = MCPServer.createFresh({
        logger: createSilentLogger(),
      });
      const server = defaultServer.getServer();
      expect(server).toBeDefined();
    });

    it("should create server with custom config", () => {
      const server = mcpServer.getServer();
      expect(server).toBeDefined();
    });
  });

  describe("Server Lifecycle", () => {
    it("should start with stdio transport", async () => {
      expect(mcpServer.isRunning()).toBe(false);

      // Note: We can't fully test stdio transport in unit tests
      // as it requires actual stdin/stdout streams
      // This would be tested in integration tests
    });

    it("should stop server", () => {
      mcpServer.stop();
      expect(mcpServer.isRunning()).toBe(false);
    });
  });

  describe("Tool/Resource Registration", () => {
    it("should expose server for registration", () => {
      const server = mcpServer.getServer();
      expect(server).toBeDefined();

      // Other packages would use this to register tools
      expect(typeof server.tool).toBe("function");
      expect(typeof server.resource).toBe("function");
    });

    it("should allow tool registration", () => {
      const server = mcpServer.getServer();
      const mockHandler = mock(() =>
        Promise.resolve({
          content: [{ type: "text" as const, text: "test" }],
        }),
      );

      // This is how other packages would register tools
      server.tool("test_tool", {}, mockHandler);

      // We can't easily test if it was registered without calling internal methods
      // This would be tested in integration tests
    });

    it("should allow resource registration", () => {
      const server = mcpServer.getServer();
      const mockHandler = mock(() =>
        Promise.resolve({
          contents: [{ uri: "test://example", text: "test" }],
        }),
      );

      // This is how other packages would register resources
      server.resource(
        "test_resource",
        ":id",
        { description: "Test resource" },
        mockHandler,
      );

      // We can't easily test if it was registered without calling internal methods
      // This would be tested in integration tests
    });
  });
});
