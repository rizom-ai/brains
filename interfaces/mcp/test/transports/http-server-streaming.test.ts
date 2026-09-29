import { describe, expect, test } from "bun:test";
import type { IMCPTransport } from "@brains/mcp-service";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { StreamableHTTPServer } from "../../src/transports/http-server";

function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Silent MCP request did not start streaming")),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function createSilentServer(): {
  server: StreamableHTTPServer;
  started: Promise<ServerContext>;
  release: () => void;
} {
  const started = Promise.withResolvers<ServerContext>();
  const gate = Promise.withResolvers<void>();
  const factory = (): McpServer => {
    const mcp = new McpServer({ name: "silent-test", version: "1.0.0" });
    mcp.registerTool(
      "silent_tool",
      { inputSchema: z.object({}) },
      async (_args, context) => {
        started.resolve(context);
        // Model generation can be silent: no progress notification upgrades
        // an auto-mode modern response to SSE while this work is pending.
        await gate.promise;
        return { content: [{ type: "text", text: "finished" }] };
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
    port: 0,
    auth: { disabled: true },
    logger: createMockLogger(),
  });
  server.connectMCPServer(factory(), transport);
  return { server, started: started.promise, release: gate.resolve };
}

function modernToolRequest(signal?: AbortSignal): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": "silent_tool",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "silent_tool",
        arguments: {},
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

describe("silent MCP HTTP requests", () => {
  test("starts modern SSE before a tool produces any result or progress", async () => {
    const { server, started, release } = createSilentServer();
    const responsePromise = server.handleRequest(modernToolRequest());
    try {
      await within(started, 1000);
      const response = await within(responsePromise, 1000);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(response.headers.get("x-accel-buffering")).toBe("no");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("mcp-session-id")).toBeNull();
      release();
      expect(await response.text()).toContain('"text":"finished"');
    } finally {
      release();
      await (await responsePromise).body?.cancel().catch(() => {});
      await server.stop();
    }
  });

  test.each(["disconnect", "shutdown"] as const)(
    "%s cancels a silent modern handler after streaming starts",
    async (operation) => {
      const { server, started, release } = createSilentServer();
      const responsePromise = server.handleRequest(modernToolRequest());
      try {
        const context = await within(started, 1000);
        const response = await within(responsePromise, 1000);
        expect(context.mcpReq.signal.aborted).toBe(false);
        if (operation === "disconnect") await response.body?.cancel();
        else await server.stop();
        expect(context.mcpReq.signal.aborted).toBe(true);
      } finally {
        release();
        await (await responsePromise).body?.cancel().catch(() => {});
        await server.stop();
      }
    },
  );

  test("delivers an SDK keepalive over real HTTP before a silent modern tool completes", async () => {
    const { server, started, release } = createSilentServer();
    const heartbeat = Promise.withResolvers<void>();
    const decoder = new TextDecoder();
    let received = "";
    // Production mounts this handler in the shared webserver (255s idle
    // timeout), not the standalone test listener with Bun's 10s default.
    const host = Bun.serve({
      port: 0,
      idleTimeout: 255,
      fetch: server.getApp().fetch,
    });
    const client = new Client(
      { name: "heartbeat-test", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${host.port}/mcp`),
      {
        fetch: async (input, init): Promise<Response> => {
          const response = await fetch(input, init);
          if (!response.body) return response;
          const body = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller): void {
                received += decoder.decode(chunk, { stream: true });
                if (received.includes(": keepalive\n\n")) heartbeat.resolve();
                controller.enqueue(chunk);
              },
            }),
          );
          return new Response(body, {
            status: response.status,
            headers: response.headers,
          });
        },
      },
    );
    try {
      await client.connect(transport);
      const outcome = client
        .callTool({ name: "silent_tool", arguments: {} })
        .then(
          (result) => ({ result }),
          (error: unknown) => ({ error }),
        );
      try {
        await within(started, 1000);
        // Exercise the SDK's real 15s keepalive, not a fabricated progress
        // notification or a test-only transport setting. This must precede
        // the production proxy's default 30s response-header deadline.
        await within(heartbeat.promise, 20_000);
        expect(received).not.toContain('"text":"finished"');
        release();
        const completed = await outcome;
        if ("error" in completed) throw completed.error;
        expect(completed.result.content).toEqual([
          { type: "text", text: "finished" },
        ]);
      } finally {
        release();
        await outcome;
      }
    } finally {
      await client.close();
      await server.stop();
      await host.stop(true);
    }
  }, 25_000);
});
