import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { A2AInterface } from "../src/a2a-interface";

describe("A2A HTTP routes", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-test"),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
  });

  it("redirects bare / to the agent card", async () => {
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);
    await harness.getMockShell().getDaemonRegistry().startPlugin("a2a");

    const response = await fetch(
      `http://127.0.0.1:${plugin.getServerPort()}/`,
      { redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/.well-known/agent-card.json",
    );
  });

  it("returns a helpful 405 for GET /a2a", async () => {
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);
    await harness.getMockShell().getDaemonRegistry().startPlugin("a2a");

    const response = await fetch(
      `http://127.0.0.1:${plugin.getServerPort()}/a2a`,
    );

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body).toEqual({
      error: "Use POST with JSON-RPC 2.0 requests.",
      agentCard: "/.well-known/agent-card.json",
    });
  });

  it("does not start a standalone HTTP listener when webserver is present", async () => {
    harness.getMockShell().addPlugin({
      id: "webserver",
      version: "1.0.0",
      type: "interface",
      packageName: "@brains/webserver",
      register: async () => ({ tools: [], resources: [] }),
    });
    const plugin = new A2AInterface({ port: 0 });
    await harness.installPlugin(plugin);
    await harness.getMockShell().getDaemonRegistry().startPlugin("a2a");

    expect(plugin.isStandaloneServerRunning()).toBe(false);
  });

  it("exposes shared-host routes for agent card and a2a", async () => {
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
