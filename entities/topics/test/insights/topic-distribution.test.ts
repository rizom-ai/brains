import { describe, it, expect } from "bun:test";
import { createTopicDistributionInsight } from "../../src/insights/topic-distribution";
import type { ICoreEntityService } from "@brains/entity-service";
import type { BaseEntity } from "@brains/plugins";
import { TopicAdapter } from "../../src/lib/topic-adapter";

const adapter = new TopicAdapter();

function makeTopicEntity(id: string, title: string): BaseEntity {
  const content = adapter.createTopicBody({ title, content: "" });
  return {
    id,
    entityType: "topic",
    content,
    contentHash: "x",
    metadata: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function createMockEntityService(
  topics: ReturnType<typeof makeTopicEntity>[],
): ICoreEntityService {
  return {
    listEntities: async (type: string) => {
      if (type === "topic") return topics;
      return [];
    },
    hasEntityType: (type: string) => type === "topic",
    getEntityTypes: () => ["topic"],
    getEntity: async () => null,
    getEntityRaw: async () => null,
    search: async () => [],
    countEntities: async () => 0,
    getEntityCounts: async () => [],
    getWeightMap: () => ({}),
  } as unknown as ICoreEntityService;
}

describe("topic-distribution insight", () => {
  it("should return topics with titles", async () => {
    const topics = [
      makeTopicEntity("education", "Education"),
      makeTopicEntity("typescript", "TypeScript"),
    ];

    const handler = createTopicDistributionInsight();
    const result = await handler(createMockEntityService(topics));
    const dist = result["topics"] as Array<{
      topic: string;
      title: string;
    }>;

    expect(dist).toHaveLength(2);
    expect(dist[0]).toMatchObject({
      topic: "education",
      title: "Education",
    });
    expect(dist[1]).toMatchObject({
      topic: "typescript",
      title: "TypeScript",
    });
  });

  it("should return empty when no topics exist", async () => {
    const handler = createTopicDistributionInsight();
    const result = await handler(createMockEntityService([]));

    const dist = result["topics"] as unknown[];
    expect(dist).toHaveLength(0);
  });

  it("should return empty when topic entity type is not registered", async () => {
    const es = {
      hasEntityType: () => false,
      listEntities: async () => [],
      getEntityTypes: () => [],
    } as unknown as ICoreEntityService;

    const handler = createTopicDistributionInsight();
    const result = await handler(es);

    expect(result["topics"]).toEqual([]);
  });
});
