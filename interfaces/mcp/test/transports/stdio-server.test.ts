import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { StdioMCPServer } from "../../src/transports/stdio-server";
import { createSilentLogger } from "@brains/test-utils";
import type { ConnectableMcpServer } from "../../src/transports/stdio-server";

describe("StdioMCPServer", () => {
  let stdioServer: StdioMCPServer;
  let mockMcpServer: ConnectableMcpServer;

  beforeEach(() => {
    stdioServer = StdioMCPServer.createFresh({
      logger: createSilentLogger(),
    });

    // connect is the whole surface the transport uses; close, tool and
    // resource were on the old fake but nothing ever called them.
    mockMcpServer = {
      connect: mock(() => Promise.resolve()),
    } satisfies ConnectableMcpServer;
  });

  afterEach(() => {
    stdioServer.stop();
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
