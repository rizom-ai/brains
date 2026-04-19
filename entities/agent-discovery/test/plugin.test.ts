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
});
