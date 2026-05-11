import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";
import { createTestEntity } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";

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

    it("should allow additional statuses when configured", () => {
      const pluginWithDrafts = new TopicsPlugin({
        extractableStatuses: ["published", "draft"],
      });
      const draftEntity = createTestEntity("post", {
        metadata: { status: "draft" },
      });
      expect(pluginWithDrafts.isEntityPublished(draftEntity)).toBe(true);
    });
  });

  describe("shouldProcessEntityType", () => {
    const allowAll = {
      getEntityTypeConfig: (): { projectionSource?: boolean } => ({}),
    };
    const blockSkill = {
      getEntityTypeConfig: (type: string): { projectionSource?: boolean } =>
        type === "skill" ? { projectionSource: false } : {},
    };

    it("should always skip topic entity type to prevent recursion", () => {
      const pluginWithWhitelist = new TopicsPlugin({
        includeEntityTypes: ["topic", "post"],
      });
      expect(
        pluginWithWhitelist.shouldProcessEntityType("topic", allowAll),
      ).toBe(false);
    });

    it("should register topic entity type with projectionSource: false", async () => {
      const harness = createPluginHarness<TopicsPlugin>({});
      await harness.installPlugin(new TopicsPlugin());

      expect(
        harness.getEntityRegistry().getEntityTypeConfig("topic")
          .projectionSource,
      ).toBe(false);
    });

    it("should process whitelisted entity types and reject ones marked projectionSource: false", () => {
      const pluginWithWhitelist = new TopicsPlugin({
        includeEntityTypes: ["post", "summary", "skill"],
      });
      expect(
        pluginWithWhitelist.shouldProcessEntityType("post", allowAll),
      ).toBe(true);
      expect(
        pluginWithWhitelist.shouldProcessEntityType("summary", allowAll),
      ).toBe(true);
      expect(
        pluginWithWhitelist.shouldProcessEntityType("skill", blockSkill),
      ).toBe(false);
      expect(
        pluginWithWhitelist.shouldProcessEntityType("link", allowAll),
      ).toBe(false);
      expect(
        pluginWithWhitelist.shouldProcessEntityType("deck", allowAll),
      ).toBe(false);
    });

    it("should process nothing when includeEntityTypes is empty", () => {
      const pluginWithEmpty = new TopicsPlugin({
        includeEntityTypes: [],
      });
      expect(pluginWithEmpty.shouldProcessEntityType("post", allowAll)).toBe(
        false,
      );
      expect(pluginWithEmpty.shouldProcessEntityType("link", allowAll)).toBe(
        false,
      );
      expect(pluginWithEmpty.shouldProcessEntityType("deck", allowAll)).toBe(
        false,
      );
      expect(pluginWithEmpty.shouldProcessEntityType("topic", allowAll)).toBe(
        false,
      );
    });
  });
});
