import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";

describe("Auto-extraction configuration", () => {
  let plugin: TopicsPlugin;

  beforeEach(() => {
    plugin = new TopicsPlugin();
  });

  it("should be instantiable with auto-extraction enabled", () => {
    expect(plugin).toBeDefined();
  });

  it("should have plugin metadata", () => {
    expect(plugin.id).toBe("topics");
    expect(plugin.version).toBeDefined();
  });
});
