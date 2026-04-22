import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AgentDiscoveryPlugin } from "../src/plugin";

describe("AgentDiscoveryPlugin", () => {
  it("should not auto-create agents from a2a call completion events", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "a2a:call:completed",
      { domain: "yeehaa.io" },
      "a2a",
    );

    const agent = await harness
      .getEntityService()
      .getEntity("agent", "yeehaa.io");
    expect(agent).toBeNull();

    harness.reset();
  });

  it("should treat explicit agent saves as approved generation jobs", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();

    await harness.installPlugin(plugin);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("agent");
    if (!interceptor) throw new Error("Expected agent create interceptor");

    const result = await interceptor(
      {
        entityType: "agent",
        url: "https://yeehaa.io",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { status: "generating" },
      },
    });

    harness.reset();
  });

  it("should register dashboard widgets on plugins ready", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const registrations: Array<{
      id: string;
      rendererName: string;
      hasComponent: boolean;
      hasClientScript: boolean;
    }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as {
        id: string;
        rendererName: string;
        component?: unknown;
        clientScript?: unknown;
      };
      registrations.push({
        id: payload.id,
        rendererName: payload.rendererName,
        hasComponent: typeof payload.component === "function",
        hasClientScript: typeof payload.clientScript === "string",
      });
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toEqual([
      {
        id: "agent-network",
        rendererName: "AgentNetworkWidget",
        hasComponent: true,
        hasClientScript: true,
      },
    ]);

    harness.reset();
  });
});
