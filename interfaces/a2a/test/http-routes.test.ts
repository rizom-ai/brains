import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { A2AInterface } from "../src/a2a-interface";

describe("A2A HTTP routes", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  function installWebserverPlugin(): void {
    harness.getMockShell().addPlugin({
      id: "webserver",
      version: "1.0.0",
      type: "interface",
      packageName: "@brains/webserver",
      register: async () => ({ tools: [], resources: [] }),
    });
  }

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-test"),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
  });

  it("returns a helpful 405 for GET /a2a", async () => {
    installWebserverPlugin();
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) => candidate.path === "/a2a" && candidate.method === "GET",
      );

    expect(route).toBeDefined();
    if (!route) {
      throw new Error("Expected A2A GET route");
    }

    const response = await route.handler(new Request("http://brain/a2a"));

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body).toEqual({
      error: "Use POST with JSON-RPC 2.0 requests.",
      agentCard: "/.well-known/agent-card.json",
    });
  });

  it("requires webserver for registration", async () => {
    const plugin = new A2AInterface({ port: 0 });

    return expect(harness.installPlugin(plugin)).rejects.toThrow(
      "A2A requires the webserver interface",
    );
  });

  it("exposes shared-host routes for agent card and a2a", async () => {
    installWebserverPlugin();
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes();
    expect(routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/.well-known/agent-card.json",
          method: "GET",
        }),
        expect.objectContaining({ path: "/a2a", method: "GET" }),
        expect.objectContaining({ path: "/a2a", method: "POST" }),
        expect.objectContaining({ path: "/a2a", method: "OPTIONS" }),
      ]),
    );
  });
});
