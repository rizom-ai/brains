import { describe, expect, it } from "bun:test";
import type { IMCPTransport } from "@brains/mcp-service";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { McpServer } from "@modelcontextprotocol/server";
import { StreamableHTTPServer } from "../../src/transports/http-server";

const version = "2026-07-28";
const maxBytes = 4 * 1024 * 1024;

function body(value = ""): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "fixture",
      arguments: { value },
      _meta: {
        "io.modelcontextprotocol/protocolVersion": version,
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
}

function request(
  text = body(),
  changes: Record<string, string | null> = {},
): Request {
  const headers = new Headers({
    Authorization: "Bearer fixture-token",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": version,
    "Mcp-Method": "tools/call",
    "Mcp-Name": "fixture",
  });
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: text,
  });
}

function setup(): {
  server: StreamableHTTPServer;
  counts: { factories: number; calls: number };
} {
  const counts = { factories: 0, calls: 0 };
  const factory = (): McpServer => {
    counts.factories++;
    const mcp = new McpServer({ name: "boundary-fixture", version: "1" });
    mcp.registerTool(
      "fixture",
      { inputSchema: z.object({ value: z.string() }) },
      () => {
        counts.calls++;
        return { content: [{ type: "text", text: "accepted" }] };
      },
    );
    return mcp;
  };
  const transport: IMCPTransport = {
    getMcpServer: factory,
    createMcpServer: factory,
    setPermissionLevel: () => {},
    setProtocolMode: () => {},
  };
  const server = new StreamableHTTPServer({
    auth: { token: "fixture-token" },
    logger: createMockLogger(),
  });
  server.connectMCPServer(factory(), transport);
  counts.factories = 0;
  return { server, counts };
}

describe("MCP SDK HTTP admission boundaries", () => {
  for (const header of ["MCP-Protocol-Version", "Mcp-Method", "Mcp-Name"]) {
    it(`refuses a modern request missing ${header} before creating a server`, async () => {
      const { server, counts } = setup();
      try {
        const response = await server.handleRequest(
          request(body(), { [header]: null }),
        );
        expect(response.status).toBe(400);
        expect(await response.text()).toContain('"code":-32020');
        expect(counts).toEqual({ factories: 0, calls: 0 });
      } finally {
        await server.stop();
      }
    });
  }

  it("keeps header/body disagreement fail-closed", async () => {
    const { server, counts } = setup();
    try {
      const response = await server.handleRequest(
        request(body(), { "Mcp-Name": "other" }),
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain('"code":-32020');
      expect(counts).toEqual({ factories: 0, calls: 0 });
    } finally {
      await server.stop();
    }
  });

  it("accepts exactly the default body byte ceiling and fresh subsequent requests", async () => {
    const { server, counts } = setup();
    try {
      const text = body("x".repeat(maxBytes - Buffer.byteLength(body())));
      expect(Buffer.byteLength(text)).toBe(maxBytes);
      for (const input of [text, body("next")]) {
        const response = await server.handleRequest(request(input));
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('"text":"accepted"');
      }
      expect(counts).toEqual({ factories: 2, calls: 2 });
    } finally {
      await server.stop();
    }
  });

  for (const mode of ["declared", "observed"]) {
    it(`refuses ${mode} oversized bodies before creating a server`, async () => {
      const { server, counts } = setup();
      try {
        const input =
          mode === "observed"
            ? body("x".repeat(maxBytes + 1 - Buffer.byteLength(body())))
            : body();
        const response = await server.handleRequest(
          request(
            input,
            mode === "declared"
              ? { "Content-Length": String(maxBytes + 1) }
              : {},
          ),
        );
        expect(response.status).toBe(413);
        expect(await response.text()).toContain(
          "Request body must not exceed 4194304 bytes",
        );
        expect(counts).toEqual({ factories: 0, calls: 0 });
      } finally {
        await server.stop();
      }
    });
  }

  it("authenticates before parsing or reporting a body-size refusal", async () => {
    const { server, counts } = setup();
    try {
      const response = await server.handleRequest(
        request("not JSON", {
          Authorization: "Bearer wrong",
          "Content-Length": String(maxBytes + 1),
        }),
      );
      expect(response.status).toBe(401);
      expect(await response.text()).toContain("Unauthorized: Invalid token");
      expect(counts).toEqual({ factories: 0, calls: 0 });
    } finally {
      await server.stop();
    }
  });

  for (const size of [100, 101]) {
    it(`handles a ${size}-message legacy batch under the default batch ceiling`, async () => {
      const { server, counts } = setup();
      try {
        const messages = Array.from({ length: size }, (_, id) => ({
          jsonrpc: "2.0",
          id,
          method: "ping",
        }));
        const response = await server.handleRequest(
          request(JSON.stringify(messages), {
            "MCP-Protocol-Version": "2025-11-25",
            "Mcp-Method": null,
            "Mcp-Name": null,
          }),
        );
        expect(response.status).toBe(size === 100 ? 200 : 400);
        const text = await response.text();
        expect(text).toContain(
          size === 100 ? '"id":99' : "Batch must not exceed 100 messages",
        );
        expect(counts.calls).toBe(0);
      } finally {
        await server.stop();
      }
    });
  }
});
