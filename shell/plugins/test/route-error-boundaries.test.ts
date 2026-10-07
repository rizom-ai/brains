import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { sdkErrorCodeSchema, sdkErrorHttpStatus } from "@brains/contracts";
import {
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  verbatim,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const secret = "private-token-and-request-body";

describe("declared route failures over HTTP", () => {
  it("preserves codes, sanitizes exceptions and keeps protocol responses intact", async () => {
    let calls = 0;
    const definition = defineServicePlugin(
      { id: "errors", config: z.object({}) },
      {
        routes: () => [
          defineRoute({
            method: "POST",
            path: "/failure",
            security: { kind: "public" },
            body: z.object({ code: z.string() }),
            response: z.unknown(),
            handle: ({ body }) => {
              calls++;
              throw Object.assign(new Error(secret), { code: body.code });
            },
          }),
          defineRoute({
            method: "GET",
            path: "/invalid-response",
            security: { kind: "public" },
            response: z.string().transform((): never => {
              throw new Error(secret);
            }),
            handle: () => "value",
          }),
          defineRoute({
            method: "POST",
            path: "/invalid-input",
            security: { kind: "public" },
            body: z.object({
              value: z.string().transform((): never => {
                throw new Error(secret);
              }),
            }),
            response: z.unknown(),
            handle: () => {
              calls++;
              return null;
            },
          }),
          defineRoute({
            method: "GET",
            path: "/session",
            security: { kind: "session" },
            response: z.unknown(),
            handle: () => {
              calls++;
              return null;
            },
          }),
          defineRoute({
            method: "GET",
            path: "/protocol",
            security: { kind: "public" },
            response: verbatim,
            handle: () =>
              new Response(
                '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Domain refusal"}}',
                { status: 418, headers: { "x-protocol": "retained" } },
              ),
          }),
        ],
      },
    );
    const harness = createPluginHarness();
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/route-errors", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Plugin not instantiated");
    await harness.installPlugin(plugin);
    const routes = plugin.getWebRoutes?.() ?? [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const route = routes.find(
          (entry) =>
            entry.method === request.method &&
            entry.path === new URL(request.url).pathname,
        );
        return route
          ? route.handler(request)
          : new Response(null, { status: 404 });
      },
    });
    try {
      for (const code of [...sdkErrorCodeSchema.options, "future_code"]) {
        const expected =
          sdkErrorCodeSchema.safeParse(code).data ?? "handler_failed";
        const response = await fetch(new URL("/failure", server.url), {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        expect(response.status).toBe(sdkErrorHttpStatus(expected));
        const body = await response.text();
        expect(JSON.parse(body)).toMatchObject({ code: expected });
        expect(body).not.toContain(secret);
        expect(body).not.toContain("stack");
      }
      const handled = calls;
      for (const [path, body] of [
        ["/failure", "{"],
        ["/failure", "{}"],
        ["/invalid-input", '{"value":"value"}'],
      ] as const) {
        const response = await fetch(new URL(path, server.url), {
          method: "POST",
          body,
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: "invalid_input" });
      }
      const session = await fetch(new URL("/session", server.url));
      expect(session.status).toBe(401);
      expect(await session.json()).toMatchObject({ code: "unauthenticated" });
      expect(calls).toBe(handled);
      const invalid = await fetch(new URL("/invalid-response", server.url));
      expect(invalid.status).toBe(500);
      expect(await invalid.json()).toEqual({
        code: "invalid_response",
        error: "Invalid response",
      });
      const protocol = await fetch(new URL("/protocol", server.url));
      expect(protocol.status).toBe(418);
      expect(protocol.headers.get("x-protocol")).toBe("retained");
      expect(await protocol.text()).toBe(
        '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Domain refusal"}}',
      );
    } finally {
      await server.stop(true);
      await harness.reset();
    }
  });
});
