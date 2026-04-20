import { describe, expect, test } from "bun:test";
import { agentDiscovery } from "../src";

describe("agent-discovery composite", () => {
  test("returns the agent, skill, and swot plugins", () => {
    const plugins = agentDiscovery();
    expect(plugins).toHaveLength(3);
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("agent-discovery");
    expect(ids).toContain("skill");
    expect(ids).toContain("swot");
  });

  test("both sub-plugins have type 'entity'", () => {
    const plugins = agentDiscovery();
    expect(plugins.every((p) => p.type === "entity")).toBe(true);
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
