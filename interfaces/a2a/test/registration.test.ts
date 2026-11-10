import { afterEach, describe, expect, it } from "bun:test";
import { a2aAgentsContract } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  createA2APlugin,
  routeOf,
  webserverPlugin as webserver,
} from "./a2a-plugin";

/**
 * What the A2A interface registers, pinned as its class registered it: the
 * agent_call tool, the Agent Card and JSON-RPC routes on the shared host,
 * its endpoint and way in, its daemon and the a2a contracts it answers.
 */
describe("the A2A interface's registered surface", () => {
  const harness = createPluginHarness({ logger: createSilentLogger() });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    await harness.reset();
  });

  it("registers plugin a2a with the agent_call tool and its daemon", async () => {
    const plugin = createA2APlugin();
    const capabilities = await harness.installPlugin(plugin);
    const registry = harness.getMockShell().getDaemonRegistry();

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "a2a",
      "interface",
      "@brains/a2a",
    ]);
    expect(
      capabilities.tools.map(({ name, visibility }) => ({ name, visibility })),
    ).toEqual([{ name: "agent_call", visibility: "trusted" }]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.instructions).toBeUndefined();
    expect(registry.getAll()).toEqual(["a2a:a2a"]);
    expect(registry.get("a2a:a2a")?.pluginId).toBe("a2a");
    expect(await registry.checkHealth("a2a:a2a")).toBeUndefined();
    expect(
      "requiresDaemonStartup" in plugin &&
        typeof plugin.requiresDaemonStartup === "function"
        ? plugin.requiresDaemonStartup()
        : false,
    ).toBe(false);
  });

  it("with a webserver: the card, directory and JSON-RPC routes, its endpoint and way in", async () => {
    harness.getMockShell().addPlugin(webserver);
    const plugin = createA2APlugin();
    await harness.installPlugin(plugin);
    const shell = harness.getMockShell();

    expect(
      (plugin.getWebRoutes?.() ?? []).map(
        (route) =>
          `${route.method ?? "GET"} ${route.path} public=${String(route.public ?? false)}`,
      ),
    ).toEqual([
      "GET /.well-known/agent-card.json public=true",
      "GET /.well-known/agent-directory.json public=true",
      "GET /a2a public=true",
      "POST /a2a public=true",
      "OPTIONS /a2a public=true",
    ]);
    expect(shell.listEndpoints()).toEqual([
      {
        label: "A2A",
        url: "/a2a",
        priority: 25,
        pluginId: "a2a",
        visibility: "public",
      },
    ]);
    expect(shell.listInteractions()).toEqual([
      {
        id: "a2a",
        label: "A2A",
        description: "Let other agents discover and talk to this brain.",
        href: "/a2a",
        kind: "agent",
        priority: 25,
        pluginId: "a2a",
        visibility: "public",
        status: "available",
      },
    ]);
  });

  it("serves no Agent Card until the brain is ready, then the card", async () => {
    harness.getMockShell().addPlugin(webserver);
    const plugin = createA2APlugin();
    await harness.installPlugin(plugin);
    harness.getMockShell().getProfileKindRegistry().finalize();
    const card = routeOf(plugin, "GET", "/.well-known/agent-card.json");

    const early = await card.handler(
      new Request("http://brain/.well-known/agent-card.json"),
    );
    expect(early.status).toBe(503);
    expect(await early.json()).toEqual({ error: "Agent Card not ready" });
    expect(early.headers.get("Access-Control-Allow-Origin")).toBe("*");

    await plugin.ready?.();
    const ready = await card.handler(
      new Request("http://brain/.well-known/agent-card.json"),
    );
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      protocolVersion: expect.any(String),
      url: expect.any(String),
    });
  });

  it("without a webserver: no route, endpoint or way in", async () => {
    const plugin = createA2APlugin();
    await harness.installPlugin(plugin);
    const shell = harness.getMockShell();

    expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("answers the a2a agents contract", async () => {
    await harness.installPlugin(createA2APlugin());

    expect(
      await harness
        .getServiceContext("registration-test")
        .messaging.request(a2aAgentsContract, {
          userPermissionLevel: "admin",
        }),
    ).toEqual({ status: "answered", data: { agents: [] } });
  });
});
