import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeEach } from "bun:test";
import { createTopicsPlugins, installTopics } from "./topics-plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { topicDocument } from "../src/lib/topic-document";
import {
  isTopicSourceEligible,
  isTopicSourceType,
} from "../src/lib/topic-source-policy";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfigInput,
} from "../src/schemas/config";
import type { BaseEntity } from "@brains/plugins";

/**
 * The source rules the package's listeners and extraction apply, as the
 * topics class exposed them: whether a record is published enough to be
 * read, and whether a type is a topic source.
 */
function sourceRules(input: TopicsPluginConfigInput = {}): {
  id: string;
  isEntityPublished(entity: BaseEntity): boolean;
  shouldProcessEntityType(
    entityType: string,
    entityService: {
      getEntityTypeConfig: (type: string) => { projectionSource?: boolean };
    },
  ): boolean;
} {
  const config = topicsPluginConfigSchema.parse(input);
  const service = createTopicsPlugins(input).at(-1);
  return {
    id: service?.id ?? "",
    isEntityPublished: (entity) => isTopicSourceEligible(entity, config),
    shouldProcessEntityType: (entityType, entityService) =>
      isTopicSourceType(
        entityType,
        config,
        entityService.getEntityTypeConfig(entityType),
      ),
  };
}
import {
  topicExtractionStores,
  topicVotePromptVersion,
} from "../src/lib/topic-extraction-run";

describe("the topics package", () => {
  let plugin: ReturnType<typeof sourceRules>;

  beforeEach(() => {
    plugin = sourceRules();
  });

  it("should have correct plugin name", () => {
    expect(plugin.id).toBe("topics");
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
      const pluginWithDrafts = sourceRules({
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
      const pluginWithRoleOverride = sourceRules({
        sourceRoleOverrides: { topic: "primary" },
      });
      expect(
        pluginWithRoleOverride.shouldProcessEntityType("topic", allowAll),
      ).toBe(false);
    });

    it("should register topic entity type with projectionSource: false", async () => {
      const harness = createPluginHarness({});
      const capabilities = await installTopics(harness);

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
      const pluginWithBlacklist = sourceRules({
        excludeEntityTypes: ["note"],
      });
      expect(
        pluginWithBlacklist.shouldProcessEntityType("post", allowAll),
      ).toBe(true);
      expect(
        pluginWithBlacklist.shouldProcessEntityType("note", allowAll),
      ).toBe(false);
    });
  });
});

describe("topic-distribution report wiring", () => {
  it("counts sources from the extraction votes the plugin recorded", async () => {
    const harness = createPluginHarness({});
    // Resolving the votes prompt stores a prompt entity; in a brain the
    // prompt plugin excludes its type from topic sources.
    await installTopics(harness, { excludeEntityTypes: ["prompt"] });
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
        content: topicDocument.createTopicBody({
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
