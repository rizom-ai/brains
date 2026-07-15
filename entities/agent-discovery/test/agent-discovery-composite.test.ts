import { describe, expect, test } from "bun:test";
import { agentDiscovery, agentDiscoveryCompositeConfigSchema } from "../src";

describe("agent-discovery composite", () => {
  test("returns the agent, agent tools, and skill plugins", () => {
    const plugins = agentDiscovery();
    expect(plugins).toHaveLength(3);
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("agent-discovery");
    expect(ids).toContain("agent");
    expect(ids).toContain("skill");
  });

  test("includes entity plugins plus the agent service tool plugin", () => {
    const plugins = agentDiscovery();
    expect(plugins.map((p) => p.type)).toEqual(["entity", "service", "entity"]);
  });

  test("disables new-agent notifications by default", () => {
    expect(agentDiscoveryCompositeConfigSchema.parse({})).toEqual({
      notifyOnNewAgents: false,
    });
  });

  test("accepts explicit new-agent notification opt-in", () => {
    expect(
      agentDiscoveryCompositeConfigSchema.parse({ notifyOnNewAgents: true }),
    ).toEqual({ notifyOnNewAgents: true });
  });

  test("works when called with no arguments", () => {
    const plugins = agentDiscovery();
    expect(plugins).toHaveLength(3);
  });

  test("returns fresh instances on each call", () => {
    const a = agentDiscovery();
    const b = agentDiscovery();
    expect(a[0]).not.toBe(b[0]);
    expect(a[1]).not.toBe(b[1]);
    expect(a[2]).not.toBe(b[2]);
  });
});
