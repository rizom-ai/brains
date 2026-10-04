import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { defineServicePlugin, z } from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { RouteRegistry } from "@brains/site-engine";
import { routeSubscriptions } from "../src/lib/route-handlers";

// The site builds in the worker process, which registers plugins but takes
// no ordinary subscriptions. The route registry there still has to hear the
// pages other plugins declare, or the built site lacks them.
describe("route registration in the worker process", () => {
  it("reaches the registry in an execution-only process", async () => {
    const h = createPluginHarness({ domain: "brain.test" });
    const shell = h.getMockShell();
    const logger = shell.getLogger().child("test");
    const registry = new RouteRegistry(logger);
    const definition = defineServicePlugin(
      { id: "routes", config: z.object({}) },
      { subscriptions: () => routeSubscriptions(registry) },
    );
    const plugin = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/site-routes", version: "0.0.0-test" },
    )[0];
    if (!plugin) throw new Error("Missing route subscription fixture");
    await plugin.register(shell, { executionOnly: true });

    await shell.getMessageBus().send({
      type: SITE_BUILDER_CHANNELS.routeRegister,
      payload: {
        pluginId: "contact",
        routes: [
          {
            id: "contact",
            path: "/contact",
            title: "Contact",
            sections: [{ id: "form", template: "contact:page", content: {} }],
            navigation: { show: false },
          },
        ],
      },
      sender: "contact",
    });

    expect(registry.list().map((route) => route.path)).toEqual(["/contact"]);
    await plugin.shutdown?.();
  });
});
