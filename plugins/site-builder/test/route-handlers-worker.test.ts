import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createServicePluginContext } from "@brains/plugins";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { RouteRegistry } from "@brains/site-engine";
import { setupRouteHandlers } from "../src/lib/route-handlers";

// The site builds in the worker process, which registers plugins but takes
// no ordinary subscriptions. The route registry there still has to hear the
// pages other plugins declare, or the built site lacks them.
describe("route registration in the worker process", () => {
  it("reaches the registry in an execution-only process", async () => {
    const h = createPluginHarness({ domain: "brain.test" });
    const shell = h.getMockShell();
    const context = createServicePluginContext(shell, "site-builder", {
      executionOnly: true,
    });
    const logger = shell.getLogger().child("test");
    const registry = new RouteRegistry(logger);
    setupRouteHandlers(context, registry, logger);

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
  });
});
