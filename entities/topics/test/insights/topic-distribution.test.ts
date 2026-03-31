import { describe, it, expect } from "bun:test";
import { createTopicDistributionInsight } from "../../src/insights/topic-distribution";
import type { ICoreEntityService } from "@brains/entity-service";
import { createMockTopicEntity } from "../fixtures/topic-entities";

function createMockEntityService(
  topics: ReturnType<typeof createMockTopicEntity>[],
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
  it("should return topics sorted by source count (descending)", async () => {
    const topics = [
      createMockTopicEntity({
        id: "education",
        content: "# Education",
        metadata: {
          sources: [
            {
              slug: "p1",
              title: "P1",
              type: "post",
              entityId: "p1",
              contentHash: "x",
            },
            {
              slug: "p2",
              title: "P2",
              type: "post",
              entityId: "p2",
              contentHash: "x",
            },
            {
              slug: "n1",
              title: "N1",
              type: "note",
              entityId: "n1",
              contentHash: "x",
            },
          ],
        },
      }),
      createMockTopicEntity({
        id: "typescript",
        content: "# TypeScript",
        metadata: {
          sources: [
            {
              slug: "p3",
              title: "P3",
              type: "post",
              entityId: "p3",
              contentHash: "x",
            },
          ],
        },
      }),
    ];

    const handler = createTopicDistributionInsight();
    const result = await handler(createMockEntityService(topics));
    const dist = result["topics"] as Array<{
      topic: string;
      sourceCount: number;
    }>;

    expect(dist).toHaveLength(2);
    expect(dist[0]).toMatchObject({ topic: "education", sourceCount: 3 });
    expect(dist[1]).toMatchObject({ topic: "typescript", sourceCount: 1 });
  });

  it("should include source types per topic", async () => {
    const topics = [
      createMockTopicEntity({
        id: "education",
        content: "# Education",
        metadata: {
          sources: [
            {
              slug: "p1",
              title: "P1",
              type: "post",
              entityId: "p1",
              contentHash: "x",
            },
            {
              slug: "n1",
              title: "N1",
              type: "note",
              entityId: "n1",
              contentHash: "x",
            },
          ],
        },
      }),
    ];

    const handler = createTopicDistributionInsight();
    const result = await handler(createMockEntityService(topics));
    const dist = result["topics"] as Array<{ sourceTypes: string[] }>;

    expect(dist[0]?.sourceTypes).toContain("post");
    expect(dist[0]?.sourceTypes).toContain("note");
  });

  it("should include orphaned topics (no sources)", async () => {
    const topics = [
      createMockTopicEntity({
        id: "active",
        content: "# Active",
        metadata: {
          sources: [
            {
              slug: "p1",
              title: "P1",
              type: "post",
              entityId: "p1",
              contentHash: "x",
            },
          ],
        },
      }),
      createMockTopicEntity({
        id: "orphaned",
        content: "# Orphaned",
        metadata: { sources: [] },
      }),
      createMockTopicEntity({
        id: "no-sources-field",
        content: "# No sources",
        metadata: {},
      }),
    ];

    const handler = createTopicDistributionInsight();
    const result = await handler(createMockEntityService(topics));

    const orphaned = result["orphanedTopics"] as Array<{ topic: string }>;
    expect(orphaned).toHaveLength(2);
    expect(orphaned.some((t) => t.topic === "orphaned")).toBe(true);
    expect(orphaned.some((t) => t.topic === "no-sources-field")).toBe(true);
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
