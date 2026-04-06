import { describe, expect, test } from "bun:test";
import { agentDiscovery } from "../src";

describe("agent-discovery composite", () => {
  test("returns both the agent plugin and the skill plugin", () => {
    const plugins = agentDiscovery();
    expect(plugins).toHaveLength(2);
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("agent-discovery");
    expect(ids).toContain("skill");
  });

  test("both sub-plugins have type 'entity'", () => {
    const plugins = agentDiscovery();
    expect(plugins.every((p) => p.type === "entity")).toBe(true);
  });

  test("works when called with an empty config", () => {
    const plugins = agentDiscovery({});
    expect(plugins).toHaveLength(2);
  });

  test("works when called with no arguments", () => {
    const plugins = agentDiscovery();
    expect(plugins).toHaveLength(2);
  });

  test("returns fresh instances on each call", () => {
    const a = agentDiscovery();
    const b = agentDiscovery();
    expect(a[0]).not.toBe(b[0]);
    expect(a[1]).not.toBe(b[1]);
  });
});
