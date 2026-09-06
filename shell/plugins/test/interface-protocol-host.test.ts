import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineRoute,
  defineTool,
  instantiatePluginPackageDefinition,
  verbatim,
} from "../src";

/**
 * What `@brains/mcp` needs that the interface surface could not say.
 *
 * An interface that hosts a protocol is not only routes and a daemon. It
 * holds a server it must not build twice, declares routes for the runtime host,
 * advertises where it can be reached, and offers tools of its own.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/protocol-host",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Interface plugin was not created");
  return plugin;
}

describe("an interface that hosts a protocol", () => {
  it("holds one server, and offers tools of its own", async () => {
    let built = 0;
    const definition = defineInterface({
      id: "protocol-host",
      config: z.object({ transport: z.enum(["stdio", "http"]) }),
      setup: ({ config, endpoints, interactions }) => {
        if (config.transport === "http") {
          endpoints.register({
            label: "Host",
            url: "/host",
            priority: 30,
            visibility: "trusted",
          });
          interactions.register({
            id: "protocol-host",
            label: "Host",
            href: "/host",
            kind: "protocol",
            priority: 30,
            visibility: "trusted",
          });
        }
        // Built once and reused: every route answers through the same
        // transport, and a second one would answer to nobody.
        built += 1;
        return { server: built };
      },
      tools: ({ state }) => [
        defineTool({
          name: "ping",
          description: "Answer over the hosted protocol.",
          input: z.object({}),
          output: z.object({ server: z.number() }),
          permission: "public",
          execute: async () => ({ server: state.server }),
        }),
      ],
    });

    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(
      instantiate(definition, { transport: "stdio" }),
    );

    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "protocol-host_ping",
    ]);
    expect(await harness.executeTool("protocol-host_ping", {})).toMatchObject({
      success: true,
      data: { server: 1 },
    });
    // stdio has no URL, so nothing was advertised.
    expect(harness.getMockShell().listInteractions()).toEqual([]);
  });

  it("hands back the transport's own response, untouched", async () => {
    // The protocol on the wire is not this interface's to shape. An MCP
    // client reads an event stream with its own headers and status codes;
    // re-encoding that as a JSON envelope would break every one of them.
    const definition = defineInterface({
      id: "protocol-host",
      config: z.object({}),
      setup: () => ({}),
      routes: () => [
        defineRoute({
          method: "POST",
          path: "/mcp",
          security: { kind: "public" },
          response: verbatim,
          handle: () =>
            new Response("event: message\ndata: {}\n\n", {
              status: 202,
              headers: {
                "content-type": "text/event-stream",
                "mcp-session-id": "session-1",
              },
            }),
        }),
      ],
    });

    const harness = createPluginHarness();
    const plugin = instantiate(definition, {});
    await harness.installPlugin(plugin);

    const route = (plugin.getWebRoutes?.() ?? []).find(
      ({ path }) => path === "/mcp",
    );
    if (!route) throw new Error("route was not registered");
    const response = await route.handler(
      new Request("http://localhost/mcp", { method: "POST" }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("mcp-session-id")).toBe("session-1");
    expect(await response.text()).toBe("event: message\ndata: {}\n\n");
  });

  it("declares HTTP routes without a host plugin", async () => {
    const definition = defineInterface({
      id: "protocol-host",
      config: z.object({ transport: z.enum(["stdio", "http"]) }),
      routes: ({ config }) =>
        config.transport === "http"
          ? [
              defineRoute({
                method: "GET",
                path: "/protocol",
                security: { kind: "public" },
                response: verbatim,
                handle: () => new Response("protocol"),
              }),
            ]
          : [],
    });
    const harness = createPluginHarness();
    const plugin = instantiate(definition, { transport: "http" });
    await harness.installPlugin(plugin);
    expect(harness.getMockShell().hasPlugin("webserver")).toBe(false);
    expect(plugin.getWebRoutes?.()).toContainEqual(
      expect.objectContaining({ path: "/protocol" }),
    );
    await harness.reset();
  });
});
