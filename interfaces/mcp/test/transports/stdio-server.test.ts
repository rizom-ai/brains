import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { StdioMCPServer } from "../../src/transports/stdio-server";
import { createSilentLogger } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("StdioMCPServer", () => {
  let stdioServer: StdioMCPServer;
  let mockMcpServer: McpServer;

  beforeEach(() => {
    stdioServer = StdioMCPServer.createFresh({
      logger: createSilentLogger(),
    });

    // Create a mock MCP server
    mockMcpServer = {
      connect: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
      tool: mock(() => {}),
      resource: mock(() => {}),
    } as unknown as McpServer;
  });

  afterEach(() => {
    stdioServer.stop();
    StdioMCPServer.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const instance1 = StdioMCPServer.getInstance({
        logger: createSilentLogger(),
      });
      const instance2 = StdioMCPServer.getInstance({
        logger: createSilentLogger(),
      });
      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = StdioMCPServer.getInstance({
        logger: createSilentLogger(),
      });
      StdioMCPServer.resetInstance();
      const instance2 = StdioMCPServer.getInstance({
        logger: createSilentLogger(),
      });
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance", () => {
      const instance1 = StdioMCPServer.getInstance({
        logger: createSilentLogger(),
      });
      const instance2 = StdioMCPServer.createFresh({
        logger: createSilentLogger(),
      });
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Server Lifecycle", () => {
    it("should connect MCP server", () => {
      stdioServer.connectMCPServer(mockMcpServer);
      expect(stdioServer.isRunning()).toBe(false);
    });

    it("should start with connected MCP server", async () => {
      stdioServer.connectMCPServer(mockMcpServer);
      await stdioServer.start();
      expect(stdioServer.isRunning()).toBe(true);
      expect(mockMcpServer.connect).toHaveBeenCalled();
    });

    it("should throw when starting without MCP server", async () => {
      expect(stdioServer.start()).rejects.toThrow(
        "MCP server not connected. Call connectMCPServer() first.",
      );
    });

    it("should throw when starting already running server", async () => {
      stdioServer.connectMCPServer(mockMcpServer);
      await stdioServer.start();
      expect(stdioServer.start()).rejects.toThrow("Server is already running");
    });

    it("should stop server", async () => {
      stdioServer.connectMCPServer(mockMcpServer);
      await stdioServer.start();
      expect(stdioServer.isRunning()).toBe(true);
      stdioServer.stop();
      expect(stdioServer.isRunning()).toBe(false);
    });
  });
});
