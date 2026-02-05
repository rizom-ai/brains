import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";
import { createTestEntity } from "@brains/test-utils";

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

  describe("isEntityPublished", () => {
    it("should return false for draft entities", () => {
      const draftEntity = createTestEntity("post", {
        metadata: { status: "draft" },
      });
      expect(plugin.isEntityPublished(draftEntity)).toBe(false);
    });

    it("should return false for pending entities", () => {
      const pendingEntity = createTestEntity("post", {
        metadata: { status: "pending" },
      });
      expect(plugin.isEntityPublished(pendingEntity)).toBe(false);
    });

    it("should return true for published entities", () => {
      const publishedEntity = createTestEntity("post", {
        metadata: { status: "published" },
      });
      expect(plugin.isEntityPublished(publishedEntity)).toBe(true);
    });

    it("should return true for entities without status field", () => {
      const entityWithoutStatus = createTestEntity("post", {
        metadata: { title: "Some title" },
      });
      expect(plugin.isEntityPublished(entityWithoutStatus)).toBe(true);
    });

    it("should return true for entities with empty metadata", () => {
      const entityEmptyMetadata = createTestEntity("post", {
        metadata: {},
      });
      expect(plugin.isEntityPublished(entityEmptyMetadata)).toBe(true);
    });
  });

  describe("shouldProcessEntityType", () => {
    it("should always skip topic entity type to prevent recursion", () => {
      const pluginWithWhitelist = new TopicsPlugin({
        includeEntityTypes: ["topic", "post"],
      });
      expect(pluginWithWhitelist.shouldProcessEntityType("topic")).toBe(false);
    });

    it("should process only whitelisted types", () => {
      const pluginWithWhitelist = new TopicsPlugin({
        includeEntityTypes: ["post", "summary"],
      });
      expect(pluginWithWhitelist.shouldProcessEntityType("post")).toBe(true);
      expect(pluginWithWhitelist.shouldProcessEntityType("summary")).toBe(true);
      expect(pluginWithWhitelist.shouldProcessEntityType("link")).toBe(false);
      expect(pluginWithWhitelist.shouldProcessEntityType("deck")).toBe(false);
    });

    it("should process nothing when includeEntityTypes is empty", () => {
      const pluginWithEmpty = new TopicsPlugin({
        includeEntityTypes: [],
      });
      expect(pluginWithEmpty.shouldProcessEntityType("post")).toBe(false);
      expect(pluginWithEmpty.shouldProcessEntityType("link")).toBe(false);
      expect(pluginWithEmpty.shouldProcessEntityType("deck")).toBe(false);
      expect(pluginWithEmpty.shouldProcessEntityType("topic")).toBe(false);
    });
  });
});
