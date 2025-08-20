import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { StreamableHTTPServer } from "../../src/transports/http-server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TransportLogger } from "../../src/transports/types";

// Test helper types
interface RequestOptions {
  port?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface RequestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

// Helper to parse SSE response
function parseSSEResponse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        // Continue to next line
      }
    }
  }
  return text; // Fallback to raw text
}

// Helper to extract headers into object
function extractHeaders(headers: Headers): Record<string, string> {
  const headerObj: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerObj[key] = value;
  });
  return headerObj;
}

// Helper to build default headers for MCP requests
function buildMCPHeaders(method: string, path: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (path === "/mcp") {
    if (method === "POST") {
      headers["Accept"] = "application/json, text/event-stream";
    } else if (method === "GET") {
      headers["Accept"] = "text/event-stream";
    }
  }

  return headers;
}

// Helper to make HTTP requests
async function makeRequest(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<RequestResponse> {
  const port = options.port ?? 3333;
  const url = `http://localhost:${port}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      ...buildMCPHeaders(method, path),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : null,
  });

  let body: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    body = await response.json();
  } else if (contentType?.includes("text/event-stream")) {
    body = parseSSEResponse(await response.text());
  } else {
    body = await response.text();
  }

  return {
    status: response.status,
    body,
    headers: extractHeaders(response.headers),
  };
}

describe("StreamableHTTPServer", () => {
  let server: StreamableHTTPServer;
  let mockLogger: TransportLogger;
  let testPort = 13337; // Use a different port for each test to avoid conflicts

  beforeEach(() => {
    // Create a mock logger with jest-style mock functions
    mockLogger = {
      info: mock(() => {}),
      debug: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    };
    testPort++; // Increment port for each test
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  describe("Server Lifecycle", () => {
    test("should create server with default config", () => {
      server = new StreamableHTTPServer();
      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(false);
    });

    test("should create server with custom config", () => {
      server = new StreamableHTTPServer({
        port: testPort,
        host: "127.0.0.1",
        logger: mockLogger,
      });
      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(false);
    });

    test("should start server successfully", async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });

      await server.start();
      expect(server.isRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `StreamableHTTP server listening on http://0.0.0.0:${testPort}/mcp`,
      );
    });

    test("should stop server successfully", async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });

      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();
      expect(server.isRunning()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "StreamableHTTP server stopped",
      );
    });

    test("should throw when starting already running server", async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });

      await server.start();
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(server.start()).rejects.toThrow("Server is already running");
    });

    test("should handle port already in use", async () => {
      // Start first server
      const server1 = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server1.start();

      // Try to start second server on same port
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(server.start()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Port ${testPort} is already in use`,
      );

      // Cleanup
      await server1.stop();
    });
  });

  describe("Health Endpoints", () => {
    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server.start();
    });

    test("should respond to health check", async () => {
      const response = await makeRequest("GET", "/health", { port: testPort });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "ok",
        transport: "streamable-http",
        timestamp: expect.any(String),
      });
    });

    test("should respond to status check", async () => {
      const response = await makeRequest("GET", "/status", { port: testPort });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        sessions: 0,
        uptime: expect.any(Number),
        memory: expect.any(Object),
        port: testPort,
      });
    });
  });

  describe("MCP Server Connection", () => {
    let mcpServer: McpServer;

    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server.start();

      // Create a mock MCP server
      mcpServer = new McpServer({
        name: "test-server",
        version: "1.0.0",
      });
    });

    test("should connect MCP server", () => {
      server.connectMCPServer(mcpServer);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "MCP server connected to StreamableHTTP transport",
      );
    });

    test("should return 503 when MCP server not connected", async () => {
      const response = await makeRequest("POST", "/mcp", {
        port: testPort,
        body: { jsonrpc: "2.0", method: "initialize", params: {}, id: 1 },
      });

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Service Unavailable: MCP server not connected",
        },
        id: null,
      });
    });
  });

  describe("Session Management", () => {
    let mcpServer: McpServer;

    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server.start();

      // Create and connect MCP server
      mcpServer = new McpServer({
        name: "test-server",
        version: "1.0.0",
      });
      server.connectMCPServer(mcpServer);
    });

    test("should handle initialization request", async () => {
      const initRequest = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
        id: 1,
      };

      const response = await makeRequest("POST", "/mcp", {
        port: testPort,
        body: initRequest,
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2024-11-05",
          capabilities: expect.any(Object),
          serverInfo: {
            name: "test-server",
            version: "1.0.0",
          },
        },
        id: 1,
      });

      // Session ID is returned in the header
      expect(response.headers["mcp-session-id"]).toBeDefined();
      expect(typeof response.headers["mcp-session-id"]).toBe("string");

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Session initialized: .+/),
      );
    });

    test("should return 400 for non-initialize request without session", async () => {
      const response = await makeRequest("POST", "/mcp", {
        port: testPort,
        body: { jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 },
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Server not initialized",
        },
        id: null,
      });
    });

    test("should track active sessions", async () => {
      expect(server.getSessionCount()).toBe(0);

      // Initialize a session
      const initRequest = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
        id: 1,
      };

      await makeRequest("POST", "/mcp", {
        port: testPort,
        body: initRequest,
      });

      expect(server.getSessionCount()).toBe(1);
    });
  });

  describe("Request Handling", () => {
    test("should handle GET request with invalid session", async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server.start();

      const response = await makeRequest("GET", "/mcp", {
        port: testPort,
        headers: { "mcp-session-id": "invalid-session" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toBe("Invalid or missing session ID");
    });

    test("should handle DELETE request with invalid session", async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server.start();

      const response = await makeRequest("DELETE", "/mcp", {
        port: testPort,
        headers: { "mcp-session-id": "invalid-session" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toBe("Invalid or missing session ID");
    });
  });

  describe("Express App Access", () => {
    test("should provide access to Express app", () => {
      server = new StreamableHTTPServer();
      const app = server.getApp();

      expect(app).toBeDefined();
      expect(app.listen).toBeDefined();
      expect(app.use).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    test("should handle transport close errors gracefully", async () => {
      server = new StreamableHTTPServer({
        port: testPort,
        logger: mockLogger,
      });
      await server.start();

      // Create and connect MCP server
      const mcpServer = new McpServer({
        name: "test-server",
        version: "1.0.0",
      });
      server.connectMCPServer(mcpServer);

      // Initialize a session
      const initRequest = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
        id: 1,
      };

      await makeRequest("POST", "/mcp", {
        port: testPort,
        body: initRequest,
      });

      // Stop server (which should close transports)
      await server.stop();

      // Check that error was logged if transport close failed
      // This is more of a coverage test
      expect(server.isRunning()).toBe(false);
    });
  });
});
