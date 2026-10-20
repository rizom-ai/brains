import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsPlugin } from "../src";
import { createPluginHarness } from "@brains/plugins/test";
import { TopicAdapter } from "../src/lib/topic-adapter";
import {
  topicExtractionStores,
  topicVotePromptVersion,
} from "../src/lib/topic-extraction-run";

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
      const capabilities = await harness.installPlugin(new TopicsPlugin());

      expect(
        harness.getEntityRegistry().getEntityTypeConfig("topic")
          .projectionSource,
      ).toBe(false);
      expect("projections" in capabilities).toBe(false);
      expect(capabilities.projectionRules).toBeUndefined();
    });

    it("should process registered projection sources by default", () => {
      expect(plugin.shouldProcessEntityType("post", allowAll)).toBe(true);
      expect(plugin.shouldProcessEntityType("note", allowAll)).toBe(true);
      expect(plugin.shouldProcessEntityType("skill", blockSkill)).toBe(false);
      expect(plugin.shouldProcessEntityType("topic", allowAll)).toBe(false);
    });

    it("uses excludeEntityTypes as the normal source blacklist", () => {
      const pluginWithBlacklist = new TopicsPlugin({
        excludeEntityTypes: ["note"],
      });
      expect(
        pluginWithBlacklist.shouldProcessEntityType("post", allowAll),
      ).toBe(true);
      expect(
        pluginWithBlacklist.shouldProcessEntityType("note", allowAll),
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

describe("topic-distribution report wiring", () => {
  it("counts sources from the extraction votes the plugin recorded", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    // Resolving the votes prompt stores a prompt entity; in a brain the
    // prompt plugin excludes its type from topic sources.
    await harness.installPlugin(
      new TopicsPlugin({ excludeEntityTypes: ["prompt"] }),
    );
    const context = harness.getEntityContext("topics");
    const note = createTestEntity("note", {
      id: "read",
      contentHash: "read-hash",
      visibility: "public",
      metadata: {},
    });
    harness.getMockShell().addEntities([
      createTestEntity("topic", {
        id: "ethics",
        content: new TopicAdapter().createTopicBody({
          title: "Ethics",
          content: "",
        }),
        visibility: "public",
      }),
      note,
      createTestEntity("note", {
        id: "unread",
        visibility: "public",
        metadata: {},
      }),
      // Extraction reads public sources only, so it never reads this one.
      createTestEntity("note", {
        id: "private",
        visibility: "restricted",
        metadata: {},
      }),
    ]);
    const stores = topicExtractionStores(context);
    await stores.votes.set("note:read", {
      contentHash: "read-hash",
      promptVersion: await topicVotePromptVersion(context),
      visibility: "public",
      supported: [{ slug: "morals", title: "Morals", relevanceScore: 0.9 }],
      proposal: null,
    });
    await stores.aliases.set("morals", "ethics");

    const result = await harness.getMockShell().getAnalyticsRegistry().run({
      type: "topic-distribution",
      entityService: harness.getEntityService(),
      permission: "admin",
    });

    expect(result).toEqual({
      topics: [{ topic: "ethics", title: "Ethics", sources: 1 }],
      coverage: { sourceEntities: 2, attributed: 1, unattributed: 1 },
    });
  });
});
