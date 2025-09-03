import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";

describe("TopicsPlugin", () => {
  let plugin: TopicsPlugin;

  beforeEach(() => {
    plugin = new TopicsPlugin();
  });

  it("should be instantiable", () => {
    expect(plugin).toBeDefined();
  });

  it("should have correct plugin name", () => {
    expect(plugin.id).toBe("topics");
  });

  it("should have plugin metadata", () => {
    expect(plugin.version).toBeDefined();
  });
});
