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

  describe("shouldProcessEntityType", () => {
    it("should always skip topic entity type to prevent recursion", () => {
      const pluginWithWhitelist = new TopicsPlugin({
        includeEntityTypes: ["topic", "post"], // Even if topic is in whitelist
      });
      expect(pluginWithWhitelist.shouldProcessEntityType("topic")).toBe(false);
    });

    it("should process only whitelisted types when includeEntityTypes is set", () => {
      const pluginWithWhitelist = new TopicsPlugin({
        includeEntityTypes: ["post", "summary"],
      });
      expect(pluginWithWhitelist.shouldProcessEntityType("post")).toBe(true);
      expect(pluginWithWhitelist.shouldProcessEntityType("summary")).toBe(true);
      expect(pluginWithWhitelist.shouldProcessEntityType("link")).toBe(false);
      expect(pluginWithWhitelist.shouldProcessEntityType("deck")).toBe(false);
    });

    it("should process all types except blacklisted when includeEntityTypes is empty", () => {
      const pluginWithBlacklist = new TopicsPlugin({
        includeEntityTypes: [],
        excludeEntityTypes: ["profile", "deck"],
      });
      expect(pluginWithBlacklist.shouldProcessEntityType("post")).toBe(true);
      expect(pluginWithBlacklist.shouldProcessEntityType("summary")).toBe(true);
      expect(pluginWithBlacklist.shouldProcessEntityType("link")).toBe(true);
      expect(pluginWithBlacklist.shouldProcessEntityType("profile")).toBe(
        false,
      );
      expect(pluginWithBlacklist.shouldProcessEntityType("deck")).toBe(false);
    });

    it("should process all types when both lists are empty", () => {
      const pluginWithNoFilter = new TopicsPlugin({
        includeEntityTypes: [],
        excludeEntityTypes: [],
      });
      expect(pluginWithNoFilter.shouldProcessEntityType("post")).toBe(true);
      expect(pluginWithNoFilter.shouldProcessEntityType("link")).toBe(true);
      expect(pluginWithNoFilter.shouldProcessEntityType("deck")).toBe(true);
      // But topic is still excluded
      expect(pluginWithNoFilter.shouldProcessEntityType("topic")).toBe(false);
    });
  });
});
