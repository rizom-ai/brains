import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createTopicDistributionInsight,
  type TopicDistributionEntry,
} from "../../src/insights/topic-distribution";
import type {
  BaseEntity,
  ContentVisibility,
  IEntityService,
} from "@brains/plugins";
import { createMockEntityService } from "@brains/test-utils";
import { TopicAdapter } from "../../src/lib/topic-adapter";

const topicDistributionSchema = z.array(
  z.object({ topic: z.string(), title: z.string() }),
);

const adapter = new TopicAdapter();

function makeTopicEntity(
  id: string,
  title: string,
  visibility: ContentVisibility = "public",
): BaseEntity {
  const content = adapter.createTopicBody({ title, content: "" });
  return {
    id,
    entityType: "topic",
    content,
    contentHash: "x",
    visibility,
    metadata: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function topicService(topics: BaseEntity[]): IEntityService {
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
    const entityService = topicService(topics);
    const result = await handler(entityService, "public");
    const dist = getTopicDistribution(result);

    expect(entityService.listEntities).toHaveBeenCalledWith({
      entityType: "topic",
      options: { filter: { visibilityScope: "public" } },
    });
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

  it("should pass the caller visibility scope to topic listing", async () => {
    const handler = createTopicDistributionInsight();
    const entityService = topicService([
      makeTopicEntity("shared-topic", "Shared Topic", "shared"),
    ]);

    await handler(entityService, "shared");

    expect(entityService.listEntities).toHaveBeenCalledWith({
      entityType: "topic",
      options: { filter: { visibilityScope: "shared" } },
    });
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
