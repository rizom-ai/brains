import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  protocol,
} from "../src";

/**
 * A service that serves HTTP.
 *
 * `@brains/atproto-registry` publishes canonical lexicons as public GET
 * routes; dashboard and studio serve operator pages the same way. Routes are
 * one vocabulary across both families — the interface `defineRoute`, with
 * its security, body and response validation — not a second, weaker one.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
  name: string,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name,
    version: "0.1.0",
  });
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

describe("declarative service routes", () => {
  it("serves a public route with a validated response", async () => {
    const definition = defineServicePlugin({
      id: "registry",
      config: z.object({ enabled: z.boolean().default(true) }),
      routes: ({ config }) =>
        config.enabled
          ? [
              defineRoute({
                method: "GET",
                path: "/registry/index.json",
                security: { kind: "public" },
                response: z.object({ entries: z.array(z.string()) }),
                handle: () => ({ entries: ["one", "two"] }),
              }),
            ]
          : [],
    });
    const harness = createPluginHarness();
    const plugin = instantiate(definition, {}, "@fixture/registry");
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const routes = plugin.getWebRoutes?.() ?? [];
    expect(routes).toHaveLength(1);
    const route = routes[0];
    if (!route) throw new Error("route absent");
    expect(route.path).toBe("/registry/index.json");
    expect(route.public).toBe(true);

    const response = await route.handler(
      new Request("http://localhost/registry/index.json"),
    );
    expect(await response.json()).toEqual({ entries: ["one", "two"] });
  });

  it("refuses an unauthenticated caller on a protocol route", async () => {
    const definition = defineServicePlugin({
      id: "guarded",
      config: z.object({}),
      routes: () => [
        defineRoute({
          method: "POST",
          path: "/guarded/echo",
          security: protocol({
            authenticate: ({ request }) =>
              request.headers.get("x-user")
                ? { id: request.headers.get("x-user") ?? "" }
                : null,
          }),
          body: z.object({ text: z.string() }),
          response: z.object({ echoed: z.string() }),
          handle: ({ body, caller }) => ({
            echoed: `${caller.actor.id}:${body.text}`,
          }),
        }),
      ],
    });
    const harness = createPluginHarness();
    const plugin = instantiate(definition, {}, "@fixture/guarded");
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    const route = (plugin.getWebRoutes?.() ?? [])[0];
    if (!route) throw new Error("route absent");

    const denied = await route.handler(
      new Request("http://localhost/guarded/echo", {
        method: "POST",
        body: JSON.stringify({ text: "hi" }),
      }),
    );
    expect(denied.status).toBe(401);

    const allowed = await route.handler(
      new Request("http://localhost/guarded/echo", {
        method: "POST",
        headers: { "x-user": "mira" },
        body: JSON.stringify({ text: "hi" }),
      }),
    );
    expect(await allowed.json()).toEqual({ echoed: "mira:hi" });
  });
});
