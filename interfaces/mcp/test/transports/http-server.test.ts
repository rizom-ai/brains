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
  let server: StreamableHTTPServer | undefined;
  let mockLogger: TransportLogger;

  beforeEach(() => {
    // Create a mock logger with jest-style mock functions
    mockLogger = {
      info: mock(() => {}),
      debug: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    };
    server = undefined; // Reset server for each test
  });

  afterEach(async () => {
    if (server?.isRunning()) {
      await server.stop();
    }
  });

  describe("Server Lifecycle", () => {
    test("should create server with default config", () => {
      server = new StreamableHTTPServer({ auth: { disabled: true } });
      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(false);
    });

    test("should create server with custom config", () => {
      server = new StreamableHTTPServer({
        port: 0,
        host: "127.0.0.1",
        logger: mockLogger,
        auth: { disabled: true },
      });
      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(false);
    });

    test("should start server successfully", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });

      await server.start();
      expect(server.isRunning()).toBe(true);
      const port = server.getPort();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `StreamableHTTP server listening on http://0.0.0.0:${port}/mcp`,
      );
    });

    test("should stop server successfully", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
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
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });

      await server.start();
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(server.start()).rejects.toThrow("Server is already running");
    });

    test("should handle port already in use", async () => {
      // Start first server on a specific port
      const server1 = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server1.start();
      const boundPort = server1.getPort();

      // Try to start second server on same port
      server = new StreamableHTTPServer({
        port: boundPort,
        logger: mockLogger,
        auth: { disabled: true },
      });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(server.start()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Port ${boundPort} is already in use`,
      );

      // Cleanup
      await server1.stop();
    });
  });

  describe("Health Endpoints", () => {
    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();
    });

    test("should respond to health check", async () => {
      if (!server) throw new Error("Server not initialized");
      const port = server.getPort();
      const response = await makeRequest("GET", "/health", { port });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "ok",
        transport: "streamable-http",
        timestamp: expect.any(String),
      });
    });

    test("should respond to status check", async () => {
      if (!server) throw new Error("Server not initialized");
      const port = server.getPort();
      const response = await makeRequest("GET", "/status", { port });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        sessions: 0,
        uptime: expect.any(Number),
        memory: expect.any(Object),
        port,
      });
    });
  });

  describe("MCP Server Connection", () => {
    let mcpServer: McpServer;

    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();

      // Create a mock MCP server
      mcpServer = new McpServer({
        name: "test-server",
        version: "1.0.0",
      });
    });

    test("should connect MCP server", () => {
      if (!server) throw new Error("Server not initialized");
      server.connectMCPServer(mcpServer);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "MCP server connected to StreamableHTTP transport",
      );
    });

    test("should return 503 when MCP server not connected", async () => {
      if (!server) throw new Error("Server not initialized");
      const port = server.getPort();
      const response = await makeRequest("POST", "/mcp", {
        port,
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
    let port: number;

    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();
      port = server.getPort();

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
        port,
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
        port,
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
      if (!server) throw new Error("Server not initialized");
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
        port,
        body: initRequest,
      });

      expect(server.getSessionCount()).toBe(1);
    });
  });

  describe("Request Handling", () => {
    test("should handle GET request with invalid session", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();
      const port = server.getPort();

      const response = await makeRequest("GET", "/mcp", {
        port,
        headers: { "mcp-session-id": "invalid-session" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toBe("Invalid or missing session ID");
    });

    test("should handle DELETE request with invalid session", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();
      const port = server.getPort();

      const response = await makeRequest("DELETE", "/mcp", {
        port,
        headers: { "mcp-session-id": "invalid-session" },
      });

      expect(response.status).toBe(400);
      expect(response.body).toBe("Invalid or missing session ID");
    });
  });

  describe("Handler Access", () => {
    test("should provide access to a fetch handler", () => {
      server = new StreamableHTTPServer({ auth: { disabled: true } });
      const app = server.getApp();

      expect(app).toBeDefined();
      expect(app.fetch).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    test("should handle transport close errors gracefully", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();
      const port = server.getPort();

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
        port,
        body: initRequest,
      });

      // Stop server (which should close transports)
      await server.stop();

      // Check that error was logged if transport close failed
      // This is more of a coverage test
      expect(server.isRunning()).toBe(false);
    });
  });

  describe("Authentication", () => {
    const testToken = "test-secret-token-minimum-32-characters-long";

    describe("with authentication disabled", () => {
      let port: number;

      beforeEach(async () => {
        server = new StreamableHTTPServer({
          port: 0,
          logger: mockLogger,
          auth: {
            disabled: true,
          },
        });
        await server.start();
        port = server.getPort();

        const mcpServer = new McpServer({
          name: "test-server",
          version: "1.0",
        });
        server.connectMCPServer(mcpServer);
      });

      test("should allow requests without auth header", async () => {
        const response = await makeRequest("GET", "/health", {
          port,
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: "ok",
          transport: "streamable-http",
        });
      });

      test("should allow MCP requests without auth header", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        // Won't be 401, but may be 400 or other error since no session
        expect(response.status).not.toBe(401);
      });
    });

    describe("with authentication enabled", () => {
      let port: number;

      beforeEach(async () => {
        server = new StreamableHTTPServer({
          port: 0,
          logger: mockLogger,
          auth: {
            token: testToken,
          },
        });
        await server.start();
        port = server.getPort();

        const mcpServer = new McpServer({
          name: "test-server",
          version: "1.0",
        });
        server.connectMCPServer(mcpServer);
      });

      test("should allow health check without auth", async () => {
        const response = await makeRequest("GET", "/health", {
          port,
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: "ok",
        });
      });

      test("should allow status check without auth", async () => {
        const response = await makeRequest("GET", "/status", {
          port,
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          sessions: 0,
        });
      });

      test("should reject MCP requests without auth header", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Unauthorized: Bearer token required",
          },
        });
        expect(response.headers["www-authenticate"]).toContain(
          'resource_metadata="http://localhost:',
        );
        expect(response.headers["www-authenticate"]).toContain(
          '/.well-known/oauth-protected-resource"',
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            "Authentication failed: Missing Bearer token",
          ),
        );
      });

      test("should use forwarded origin in OAuth resource metadata challenge", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Host: "docs.rizom.ai",
            "X-Forwarded-Proto": "https",
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).toBe(401);
        expect(response.headers["www-authenticate"]).toContain(
          'resource_metadata="https://docs.rizom.ai/.well-known/oauth-protected-resource"',
        );
        expect(response.headers["www-authenticate"]).not.toContain(
          'resource_metadata="http://docs.rizom.ai/.well-known/oauth-protected-resource"',
        );
      });

      test("should reject MCP requests with invalid token", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Authorization: "Bearer invalid-token",
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Unauthorized: Invalid token",
          },
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("Authentication failed: Invalid token"),
        );
      });

      test("should accept MCP requests with valid token", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Authorization: `Bearer ${testToken}`,
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        // Won't be 401, but may be 400 or other error since no session
        expect(response.status).not.toBe(401);
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining("Authentication successful"),
        );
      });

      test("should reject requests with malformed auth header", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Authorization: "Basic dGVzdDp0ZXN0", // Basic auth instead of Bearer
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Unauthorized: Bearer token required",
          },
        });
      });
    });

    describe("with OAuth bearer verification", () => {
      let port: number;
      let verifyBearerToken: ReturnType<typeof mock>;

      beforeEach(async () => {
        verifyBearerToken = mock(async (_request: Request) => ({
          subject: "single-operator",
          scope: ["openid", "mcp"],
        }));
        server = new StreamableHTTPServer({
          port: 0,
          logger: mockLogger,
          auth: {
            verifyBearerToken,
            requiredScopes: ["mcp"],
          },
        });
        await server.start();
        port = server.getPort();

        const mcpServer = new McpServer({
          name: "test-server",
          version: "1.0",
        });
        server.connectMCPServer(mcpServer);
      });

      test("should accept MCP requests with a verified scoped token", async () => {
        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Authorization: "Bearer oauth-access-token",
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
        expect(verifyBearerToken).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.stringContaining("Authentication successful"),
        );
      });

      test("should reject invalid OAuth bearer tokens", async () => {
        verifyBearerToken.mockImplementation(async () => {
          throw new Error("invalid token");
        });

        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Authorization: "Bearer invalid-token",
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Unauthorized: Invalid token",
          },
        });
      });

      test("should reject OAuth bearer tokens without the mcp scope", async () => {
        verifyBearerToken.mockImplementation(async () => ({
          subject: "single-operator",
          scope: ["openid"],
        }));

        const response = await makeRequest("POST", "/mcp", {
          port,
          headers: {
            Authorization: "Bearer no-mcp-scope",
          },
          body: { jsonrpc: "2.0", method: "test", params: {}, id: 1 },
        });

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Forbidden: Missing required scope",
          },
        });
        expect(response.headers["www-authenticate"]).toContain(
          'error="insufficient_scope"',
        );
        expect(response.headers["www-authenticate"]).toContain('scope="mcp"');
        expect(response.headers["www-authenticate"]).toContain(
          "/.well-known/oauth-protected-resource",
        );
      });
    });

    describe("with no token and auth not disabled", () => {
      test("should throw on construction", () => {
        expect(
          () =>
            new StreamableHTTPServer({
              port: 0,
              logger: mockLogger,
              // No auth config — defaults to auth required
            }),
        ).toThrow(
          "MCP HTTP transport requires an auth token or bearer token verifier",
        );
      });

      test("should throw with empty auth config", () => {
        expect(
          () =>
            new StreamableHTTPServer({
              port: 0,
              logger: mockLogger,
              auth: {},
            }),
        ).toThrow(
          "MCP HTTP transport requires an auth token or bearer token verifier",
        );
      });
    });
  });
});
