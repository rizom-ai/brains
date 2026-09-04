import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { IMCPTransport, ToolVisibility } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { StreamableHTTPServer } from "../../src/transports/http-server";
import type { TransportLogger } from "../../src/transports/types";

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
}

interface RequestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const legacyProtocolVersion =
  SUPPORTED_PROTOCOL_VERSIONS.find((version) => version.startsWith("2025-")) ??
  failMissingLegacyProtocolVersion();

function failMissingLegacyProtocolVersion(): never {
  throw new Error("Expected the SDK to retain a 2025-era protocol revision");
}

function parseSSEResponse(text: string): unknown {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      return JSON.parse(line.slice(6));
    } catch {
      // Continue to the next SSE data line.
    }
  }
  return text;
}

function extractHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function makeRequest(
  port: number,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<RequestResponse> {
  const response = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          }
        : {}),
      ...options.headers,
    },
    body: options.body === undefined ? null : JSON.stringify(options.body),
  });

  const contentType = response.headers.get("content-type");
  let body: unknown;
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

function createInitializeRequest(): {
  jsonrpc: "2.0";
  method: "initialize";
  params: {
    protocolVersion: string;
    capabilities: Record<string, never>;
    clientInfo: { name: string; version: string };
  };
  id: number;
} {
  return {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: legacyProtocolVersion,
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
    id: 1,
  };
}

function createToolServer(
  toolName = "visible_tool",
  onCall?: (context: ServerContext) => void,
): McpServer {
  const mcpServer = new McpServer({
    name: "test-server",
    version: "1.0.0",
  });
  mcpServer.registerTool(
    toolName,
    {
      description: toolName,
      inputSchema: z.object({}),
    },
    async (_params, context) => {
      onCall?.(context);
      return { content: [{ type: "text", text: "ok" }] };
    },
  );
  return mcpServer;
}

function connectFactory(
  server: StreamableHTTPServer,
  factory: (permissionLevel?: ToolVisibility) => McpServer,
): ReturnType<typeof mock<(permissionLevel?: ToolVisibility) => McpServer>> {
  const createMcpServer = mock((permissionLevel?: ToolVisibility) =>
    factory(permissionLevel),
  );
  const mcpTransport: IMCPTransport = {
    getMcpServer: () => factory(),
    createMcpServer,
    setPermissionLevel: mock(() => {}),
    setProtocolMode: mock(() => {}),
  };
  server.connectMCPServer(factory(), mcpTransport);
  return createMcpServer;
}

async function connectClient(
  port: number,
  options: {
    modern: boolean;
    headers?: Record<string, string>;
  },
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${port}/mcp`),
    options.headers ? { requestInit: { headers: options.headers } } : undefined,
  );
  const client = options.modern
    ? new Client(
        { name: "test-client", version: "1.0.0" },
        {
          versionNegotiation: {
            mode: { pin: MODERN_PROTOCOL_VERSION },
          },
        },
      )
    : new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

describe("StreamableHTTPServer", () => {
  let server: StreamableHTTPServer | undefined;
  let mockLogger: TransportLogger;

  beforeEach(() => {
    mockLogger = {
      info: mock(() => {}),
      debug: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    };
    server = undefined;
  });

  afterEach(async () => {
    await server?.stop();
  });

  describe("lifecycle", () => {
    test("requires authentication unless explicitly disabled", () => {
      expect(() => new StreamableHTTPServer()).toThrow(
        /requires an auth token/,
      );
    });

    test("starts and stops the standalone test listener", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });

      await server.start();
      expect(server.isRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `StreamableHTTP server listening on http://0.0.0.0:${server.getPort()}/mcp`,
      );

      await server.stop();
      expect(server.isRunning()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "StreamableHTTP server stopped",
      );
    });

    test("rejects a second start", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();

      // eslint-disable-next-line @typescript-eslint/await-thenable -- bun expect(...).rejects returns a thenable the rule does not recognise
      await expect(server.start()).rejects.toThrow("Server is already running");
    });

    test("reports a port collision", async () => {
      const first = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await first.start();
      try {
        server = new StreamableHTTPServer({
          port: first.getPort(),
          logger: mockLogger,
          auth: { disabled: true },
        });
        // eslint-disable-next-line @typescript-eslint/await-thenable -- bun expect(...).rejects returns a thenable the rule does not recognise
        await expect(server.start()).rejects.toThrow();
        expect(mockLogger.error).toHaveBeenCalledWith(
          `Port ${first.getPort()} is already in use`,
        );
      } finally {
        await first.stop();
      }
    });
  });

  describe("shared HTTP surface", () => {
    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      await server.start();
    });

    test("serves health and stateless status", async () => {
      if (!server) throw new Error("Server not initialized");
      const health = await makeRequest(server.getPort(), "GET", "/health");
      expect(health.status).toBe(200);
      expect(health.body).toMatchObject({
        status: "ok",
        transport: "streamable-http",
        timestamp: expect.any(String),
      });

      const status = await makeRequest(server.getPort(), "GET", "/status");
      expect(status.body).toEqual({
        status: "ok",
        protocol: "stateless",
      });
    });

    test("returns 503 before an MCP factory is connected", async () => {
      if (!server) throw new Error("Server not initialized");
      const response = await makeRequest(server.getPort(), "POST", "/mcp", {
        body: createInitializeRequest(),
      });
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: {
          code: -32603,
          message: "Service Unavailable: MCP server not connected",
        },
      });
    });

    test("serves CORS preflight without authentication", async () => {
      if (!server) throw new Error("Server not initialized");
      const response = await makeRequest(server.getPort(), "OPTIONS", "/mcp", {
        headers: {
          Origin: "https://inspector.modelcontextprotocol.io",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type,mcp-protocol-version,mcp-method,mcp-name",
          "Access-Control-Request-Private-Network": "true",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["access-control-allow-private-network"]).toBe(
        "true",
      );
      expect(response.headers["access-control-allow-headers"]).toContain(
        "MCP-Protocol-Version",
      );
      expect(response.headers["access-control-allow-headers"]).toContain(
        "Mcp-Method",
      );
    });

    test.each(["/api/chat", "/api/chat/confirm"])(
      "keeps removed endpoint %s unavailable",
      async (path) => {
        if (!server) throw new Error("Server not initialized");
        const response = await makeRequest(server.getPort(), "POST", path, {
          body: { message: "hi" },
        });
        expect(response.status).toBe(404);
      },
    );

    test("provides a fetch handler for shared-host mounting", () => {
      // Mounting calls this; a defined non-function would fail there, not here.
      expect(typeof server?.getApp().fetch).toBe("function");
    });
  });

  describe("protocol eras", () => {
    beforeEach(async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { disabled: true },
      });
      connectFactory(server, () => createToolServer());
      await server.start();
    });

    test("serves 2025-era clients through the stateless legacy path", async () => {
      if (!server) throw new Error("Server not initialized");
      const client = await connectClient(server.getPort(), { modern: false });
      try {
        expect(client.getProtocolEra()).toBe("legacy");
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toEqual(["visible_tool"]);
      } finally {
        await client.close();
      }
    });

    test("serves 2026-07-28 clients without an initialize session", async () => {
      if (!server) throw new Error("Server not initialized");
      const client = await connectClient(server.getPort(), { modern: true });
      try {
        expect(client.getProtocolEra()).toBe("modern");
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toEqual(["visible_tool"]);
      } finally {
        await client.close();
      }
    });

    test("does not issue session IDs to legacy initialize requests", async () => {
      if (!server) throw new Error("Server not initialized");
      const response = await makeRequest(server.getPort(), "POST", "/mcp", {
        body: createInitializeRequest(),
      });

      expect(response.status).toBe(200);
      expect(response.headers["mcp-session-id"]).toBeUndefined();
      expect(response.body).toMatchObject({
        result: {
          protocolVersion: legacyProtocolVersion,
          serverInfo: { name: "test-server", version: "1.0.0" },
        },
      });
    });

    test.each(["GET", "DELETE"])(
      "rejects legacy %s session operations because HTTP is stateless",
      async (method) => {
        if (!server) throw new Error("Server not initialized");
        const response = await makeRequest(server.getPort(), method, "/mcp", {
          headers: { "mcp-session-id": "obsolete-session" },
        });
        expect(response.status).toBe(405);
      },
    );

    test("rejects malformed JSON", async () => {
      if (!server) throw new Error("Server not initialized");
      const response = await fetch(`http://localhost:${server.getPort()}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "{not json",
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: -32700 },
      });
    });

    test("consults the live registry for each request", async () => {
      if (!server) throw new Error("Server not initialized");
      let toolName = "first_tool";
      connectFactory(server, () => createToolServer(toolName));

      const first = await connectClient(server.getPort(), { modern: true });
      try {
        expect(
          (await first.listTools()).tools.map((tool) => tool.name),
        ).toEqual(["first_tool"]);
      } finally {
        await first.close();
      }

      toolName = "second_tool";
      const second = await connectClient(server.getPort(), { modern: true });
      try {
        expect(
          (await second.listTools()).tools.map((tool) => tool.name),
        ).toEqual(["second_tool"]);
      } finally {
        await second.close();
      }
    });
  });

  describe("authentication", () => {
    const staticToken = "test-secret-token-minimum-32-characters-long";

    test("rejects an unauthenticated legacy request before invoking the factory", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { token: staticToken },
      });
      const createMcpServer = connectFactory(server, () => createToolServer());
      await server.start();
      createMcpServer.mockClear();

      const response = await makeRequest(server.getPort(), "POST", "/mcp", {
        body: createInitializeRequest(),
      });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { message: "Unauthorized: Bearer token required" },
      });
      expect(createMcpServer).not.toHaveBeenCalled();
    });

    test("rejects invalid static tokens without advertising OAuth", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { token: staticToken },
      });
      connectFactory(server, () => createToolServer());
      await server.start();

      const response = await makeRequest(server.getPort(), "POST", "/mcp", {
        headers: { Authorization: "Bearer wrong-token" },
        body: createInitializeRequest(),
      });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { message: "Unauthorized: Invalid token" },
      });
      expect(response.headers["www-authenticate"]).not.toContain(
        "resource_metadata",
      );
    });

    test("passes static-token identity to modern tool handlers", async () => {
      let observedContext: ServerContext | undefined;
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { token: staticToken },
      });
      connectFactory(server, () =>
        createToolServer("capture_subject", (context) => {
          observedContext = context;
        }),
      );
      await server.start();

      const client = await connectClient(server.getPort(), {
        modern: true,
        headers: { Authorization: `Bearer ${staticToken}` },
      });
      try {
        await client.callTool({ name: "capture_subject", arguments: {} });
        expect(observedContext?.http?.authInfo?.extra?.["subject"]).toBe(
          "static-token-operator",
        );
      } finally {
        await client.close();
      }
    });

    test("passes verified OAuth identity and permission to every request factory", async () => {
      let permissionLevel: ToolVisibility = "trusted";
      let observedContext: ServerContext | undefined;
      const verifyBearerToken = mock(async () => ({
        subject: "usr_operator",
        scope: ["openid", "mcp"],
        permissionLevel,
        isAnchor: true,
        actor: {
          kind: "user" as const,
          userId: "usr_operator",
          canonicalId: "user:operator",
        },
        displayName: "Mira",
      }));
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: { verifyBearerToken, requiredScopes: ["mcp"] },
      });
      const createMcpServer = connectFactory(server, () =>
        createToolServer("capture_subject", (context) => {
          observedContext = context;
        }),
      );
      await server.start();

      const trustedClient = await connectClient(server.getPort(), {
        modern: true,
        headers: { Authorization: "Bearer trusted-token" },
      });
      try {
        await trustedClient.callTool({
          name: "capture_subject",
          arguments: {},
        });
      } finally {
        await trustedClient.close();
      }

      expect(createMcpServer.mock.calls.length).toBeGreaterThan(0);
      expect(
        createMcpServer.mock.calls.every(([level]) => level === "trusted"),
      ).toBe(true);
      expect(observedContext?.http?.authInfo?.extra).toMatchObject({
        subject: "usr_operator",
        actor: {
          kind: "user",
          userId: "usr_operator",
          canonicalId: "user:operator",
        },
        displayName: "Mira",
        isAnchor: true,
      });

      createMcpServer.mockClear();
      permissionLevel = "public";
      const publicClient = await connectClient(server.getPort(), {
        modern: true,
        headers: { Authorization: "Bearer public-token" },
      });
      try {
        await publicClient.listTools();
      } finally {
        await publicClient.close();
      }
      expect(createMcpServer.mock.calls.length).toBeGreaterThan(0);
      expect(
        createMcpServer.mock.calls.every(([level]) => level === "public"),
      ).toBe(true);
    });

    test("rejects OAuth tokens missing the required scope with 403", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: {
          requiredScopes: ["mcp"],
          verifyBearerToken: async (): Promise<{
            subject: string;
            scope: string[];
          }> => ({
            subject: "usr_public",
            scope: ["openid"],
          }),
        },
      });
      const createMcpServer = connectFactory(server, () => createToolServer());
      await server.start();
      createMcpServer.mockClear();

      const response = await makeRequest(server.getPort(), "POST", "/mcp", {
        headers: { Authorization: "Bearer no-mcp-scope" },
        body: createInitializeRequest(),
      });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: { message: "Forbidden: Missing required scope" },
      });
      expect(response.headers["www-authenticate"]).toContain(
        'error="insufficient_scope"',
      );
      expect(response.headers["www-authenticate"]).toContain('scope="mcp"');
      expect(createMcpServer).not.toHaveBeenCalled();
    });

    test("advertises OAuth metadata using the forwarded public origin", async () => {
      server = new StreamableHTTPServer({
        port: 0,
        logger: mockLogger,
        auth: {
          requiredScopes: ["mcp"],
          verifyBearerToken: async (): Promise<undefined> => undefined,
        },
      });
      connectFactory(server, () => createToolServer());
      await server.start();

      const response = await makeRequest(server.getPort(), "POST", "/mcp", {
        headers: {
          Host: "docs.rizom.ai",
          "X-Forwarded-Proto": "https",
        },
        body: createInitializeRequest(),
      });

      expect(response.status).toBe(401);
      expect(response.headers["www-authenticate"]).toContain(
        'resource_metadata="https://docs.rizom.ai/.well-known/oauth-protected-resource"',
      );
    });
  });
});
