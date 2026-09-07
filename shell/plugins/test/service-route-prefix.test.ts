import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  verbatim,
} from "../src";

/**
 * A page that owns everything under its mount.
 *
 * A single-page app serves one shell for every path beneath it and lets its
 * own router decide what is shown; a bundle of assets is served from one
 * prefix. Neither is a list of exact paths, and a declaration that could
 * only name exact paths could not serve either.
 * Named consumer: @brains/studio.
 */
describe("a route declared over a prefix", () => {
  it("is registered with the runtime as a prefix match", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "studio",
          config: z.object({}),
        },
        {
          routes: () => [
            defineRoute({
              method: "GET",
              path: "/studio/entities",
              match: "prefix",
              security: { kind: "public" },
              response: verbatim,
              handle: () => new Response("shell"),
            }),
            defineRoute({
              method: "GET",
              path: "/studio/api/types",
              security: { kind: "public" },
              response: verbatim,
              handle: () => new Response("types"),
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/studio", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Studio plugin was not created");
    const harness = createPluginHarness();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const routes = plugin.getWebRoutes?.() ?? [];

    expect(routes.map((route) => [route.path, route.match])).toEqual([
      ["/studio/entities", "prefix"],
      ["/studio/api/types", undefined],
    ]);
  });
});
