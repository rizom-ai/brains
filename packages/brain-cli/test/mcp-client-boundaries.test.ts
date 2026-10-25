import { describe, expect, it } from "bun:test";
import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "@brains/utils/zod";
import { MCPClient } from "../src/lib/mcp-client";

async function expectRefusal(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return;
  }
  throw new Error("Expected MCP request refusal");
}

function url(host: { port: number | undefined }, path: string): string {
  if (!host.port) throw new Error("No local listener port");
  return `http://127.0.0.1:${host.port}${path}`;
}

describe("remote CLI MCP client boundaries", () => {
  it("refuses a cross-origin redirect without contacting its target", async () => {
    let arrivals = 0;
    const target = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => {
        arrivals++;
        return new Response("unexpected target", { status: 503 });
      },
    });
    const source = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => Response.redirect(url(target, "/mcp"), 307),
    });
    const client = new MCPClient(
      url(source, "/mcp"),
      "synthetic-operator-token",
    );
    try {
      await expectRefusal(client.connect());
      expect(arrivals).toBe(0);
    } finally {
      await client.close();
      await source.stop(true);
      await target.stop(true);
    }
  });

  it("refuses a same-origin redirect that would rewrite a POST to GET", async () => {
    const methods: string[] = [];
    const host = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => {
        if (new URL(request.url).pathname === "/mcp")
          return new Response(null, {
            status: 302,
            headers: { Location: "/target" },
          });
        methods.push(request.method);
        return new Response("unexpected target", { status: 503 });
      },
    });
    const client = new MCPClient(url(host, "/mcp"), "synthetic-operator-token");
    try {
      await expectRefusal(client.connect());
      expect(methods).toEqual([]);
    } finally {
      await client.close();
      await host.stop(true);
    }
  });

  it("preserves method, body and static authorization across a same-origin 307", async () => {
    const authorization: (string | null)[] = [];
    let calls = 0;
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "redirect-fixture", version: "1" });
      server.registerTool(
        "echo",
        { inputSchema: z.object({ text: z.string() }) },
        ({ text }) => {
          calls++;
          return { content: [{ type: "text", text }] };
        },
      );
      return server;
    });
    const host = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => {
        if (new URL(request.url).pathname === "/start")
          return new Response(null, {
            status: 307,
            headers: { Location: "/mcp" },
          });
        authorization.push(request.headers.get("authorization"));
        return handler.fetch(request);
      },
    });
    const client = new MCPClient(
      url(host, "/start"),
      "synthetic-operator-token",
    );
    try {
      await client.connect();
      expect((await client.listTools()).map((tool) => tool.name)).toEqual([
        "echo",
      ]);
      expect(await client.callTool("echo", { text: "round trip" })).toBe(
        "round trip",
      );
      expect(calls).toBe(1);
      expect(authorization.length).toBeGreaterThan(0);
      expect(
        authorization.every(
          (value) => value === "Bearer synthetic-operator-token",
        ),
      ).toBe(true);
    } finally {
      await client.close();
      await handler.close();
      await host.stop(true);
    }
  });

  it("stops each transport send after five same-origin redirect hops", async () => {
    let requests = 0;
    const host = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => {
        requests++;
        return new Response(null, {
          status: 307,
          headers: { Location: "/mcp" },
        });
      },
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(url(host, "/mcp")),
    );
    try {
      await transport.start();
      await expectRefusal(
        transport.send({ jsonrpc: "2.0", id: 1, method: "ping" }),
      );
      expect(requests).toBe(6);
    } finally {
      await transport.close();
      await host.stop(true);
    }
  });

  for (const mode of ["progress", "stalled", "endless"]) {
    it(`handles ${mode} pages with a repeated cursor without silently returning a partial list`, async () => {
      let pages = 0;
      const handler = createMcpHandler(() => {
        const server = new McpServer(
          { name: "pagination-fixture", version: "1" },
          { capabilities: { tools: {} } },
        );
        server.server.setRequestHandler("tools/list", () => {
          pages++;
          return {
            tools: [
              {
                name: mode === "stalled" ? "same" : `page-${pages}`,
                inputSchema: { type: "object" },
              },
            ],
            ...(mode !== "progress" || pages < 3
              ? { nextCursor: "same-cursor" }
              : {}),
          };
        });
        return server;
      });
      const host = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: (request) => handler.fetch(request),
      });
      const client = new MCPClient(url(host, "/mcp"));
      try {
        await client.connect();
        if (mode === "endless") {
          await expectRefusal(client.listTools());
          expect(pages).toBe(64);
        } else {
          expect((await client.listTools()).map((tool) => tool.name)).toEqual(
            mode === "progress" ? ["page-1", "page-2", "page-3"] : ["same"],
          );
          expect(pages).toBe(mode === "progress" ? 3 : 2);
        }
      } finally {
        await client.close();
        await handler.close();
        await host.stop(true);
      }
    });
  }

  it("closes an owned stdio transport when its input reaches EOF", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioServerTransport(input, output);
    let closed = 0;
    transport.onclose = (): void => {
      closed++;
    };
    try {
      await transport.start();
      const ended = new Promise<void>((resolve) => input.once("end", resolve));
      input.end();
      await ended;
      expect(closed).toBe(1);
      expect(input.listenerCount("data")).toBe(0);
    } finally {
      await transport.close();
      input.destroy();
      output.destroy();
    }
  });

  it("closes when input ended before the stdio transport started", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const ended = new Promise<void>((resolve) => input.once("end", resolve));
    input.resume();
    input.end();
    await ended;
    const transport = new StdioServerTransport(input, output);
    let closed = 0;
    try {
      await transport.start();
      transport.onclose = (): void => {
        closed++;
      };
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(1);
    } finally {
      await transport.close();
      input.destroy();
      output.destroy();
    }
  });

  it("absorbs late stdout errors without accumulating closed-transport listeners", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    try {
      for (let iteration = 0; iteration < 3; iteration++) {
        const transport = new StdioServerTransport(input, output);
        await transport.start();
        await transport.close();
        expect(() =>
          output.emit("error", new Error("late fixture write")),
        ).not.toThrow();
        expect(output.listenerCount("error")).toBe(1);
      }
    } finally {
      input.destroy();
      output.destroy();
    }
  });

  it("does not combine a provider token with a stale differently-cased Authorization header", async () => {
    const values: (string | null)[] = [];
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        requestInit: { headers: { aUtHoRiZaTiOn: "Bearer stale" } },
        authProvider: { token: async (): Promise<string> => "current" },
        fetch: async (_url, init): Promise<Response> => {
          values.push(new Headers(init?.headers).get("authorization"));
          return Response.json({ jsonrpc: "2.0", id: 1, result: {} });
        },
      },
    );
    try {
      await transport.start();
      await transport.send({ jsonrpc: "2.0", id: 1, method: "ping" });
      expect(values).toEqual(["Bearer current"]);
    } finally {
      await transport.close();
    }
  });
});
