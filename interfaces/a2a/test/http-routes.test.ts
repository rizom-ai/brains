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
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
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

  it("adds cors headers to the agent card route", async () => {
    installWebserverPlugin();
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);

    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === "/.well-known/agent-card.json" &&
          candidate.method === "GET",
      );

    expect(route).toBeDefined();
    if (!route) {
      throw new Error("Expected A2A agent card route");
    }

    const response = await route.handler(
      new Request("http://brain/.well-known/agent-card.json"),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
