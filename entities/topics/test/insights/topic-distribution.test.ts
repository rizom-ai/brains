import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  createTopicDistributionInsight,
  type TopicDistributionEntry,
} from "../../src/insights/topic-distribution";
import type { BaseEntity } from "@brains/plugins";
import { createMockEntityService } from "@brains/test-utils";
import { TopicAdapter } from "../../src/lib/topic-adapter";

const topicDistributionSchema = z.array(
  z.object({ topic: z.string(), title: z.string() }),
);

const adapter = new TopicAdapter();

function makeTopicEntity(id: string, title: string): BaseEntity {
  const content = adapter.createTopicBody({ title, content: "" });
  return {
    id,
    entityType: "topic",
    content,
    contentHash: "x",
    visibility: "public",
    metadata: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function topicService(topics: BaseEntity[]) {
  return createMockEntityService({
    entityTypes: ["topic"],
    listEntitiesImpl: async (request) =>
      request.entityType === "topic" ? topics : [],
  });
}

function getTopicDistribution(
  result: Record<string, unknown>,
): TopicDistributionEntry[] {
  return topicDistributionSchema.parse(result["topics"]);
}

describe("topic-distribution insight", () => {
  it("should return topics with titles", async () => {
    const topics = [
      makeTopicEntity("education", "Education"),
      makeTopicEntity("typescript", "TypeScript"),
    ];

    const handler = createTopicDistributionInsight();
    const result = await handler(topicService(topics), "public");
    const dist = getTopicDistribution(result);

    expect(dist).toEqual([
      { topic: "education", title: "Education" },
      { topic: "typescript", title: "TypeScript" },
    ]);
  });

  it("should return empty when no topics exist", async () => {
    const handler = createTopicDistributionInsight();
    const result = await handler(topicService([]), "public");

    expect(getTopicDistribution(result)).toEqual([]);
  });

  it("should return empty when topic entity type is not registered", async () => {
    const handler = createTopicDistributionInsight();
    const result = await handler(
      createMockEntityService({ entityTypes: [] }),
      "public",
    );

    expect(getTopicDistribution(result)).toEqual([]);
  });
});
