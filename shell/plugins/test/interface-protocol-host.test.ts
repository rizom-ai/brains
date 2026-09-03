import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/mcp` needs that the interface surface could not say.
 *
 * An interface that hosts a protocol is not only routes and a daemon. It
 * holds a server it must not build twice, it refuses to start when the host
 * it mounts on is absent, it advertises where it can be reached, and it
 * offers tools of its own.
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
      setup: ({ config, plugins, endpoints, interactions }) => {
        // The host is a fact about the deployment, and an interface that
        // mounts on it cannot answer requests without it.
        if (config.transport === "http" && !plugins.has("webserver")) {
          throw new Error("HTTP transport requires the webserver interface");
        }
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

  it("refuses HTTP transport without the host it mounts on", async () => {
    const definition = defineInterface({
      id: "protocol-host",
      config: z.object({ transport: z.enum(["stdio", "http"]) }),
      setup: ({ config, plugins }) => {
        if (config.transport === "http" && !plugins.has("webserver")) {
          throw new Error("HTTP transport requires the webserver interface");
        }
        return {};
      },
    });

    const harness = createPluginHarness();
    let refusal: unknown;
    try {
      await harness.installPlugin(
        instantiate(definition, { transport: "http" }),
      );
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toContain(
      "requires the webserver interface",
    );
  });
});
