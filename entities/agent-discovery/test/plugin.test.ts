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

  it("should register dashboard widgets on plugins ready", async () => {
    const harness = createPluginHarness<AgentDiscoveryPlugin>({});
    const plugin = new AgentDiscoveryPlugin();
    const registrations: Array<{ id: string; rendererName: string }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as { id: string; rendererName: string };
      registrations.push({
        id: payload.id,
        rendererName: payload.rendererName,
      });
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toEqual([
      { id: "directory-summary", rendererName: "StatsWidget" },
      { id: "recent-discoveries", rendererName: "ListWidget" },
    ]);

    harness.reset();
  });
});
