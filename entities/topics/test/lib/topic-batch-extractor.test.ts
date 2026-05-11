import { describe, it, expect, spyOn } from "bun:test";
import {
  buildBatchPrompt,
  extractTopicsBatched,
} from "../../src/lib/topic-batch-extractor";
import type { BaseEntity } from "@brains/plugins";
import {
  createEntityPluginContext,
  createMockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { TopicAdapter } from "../../src/lib/topic-adapter";

const topicAdapter = new TopicAdapter();

function makeEntity(
  id: string,
  entityType: string,
  title: string,
  content: string,
): BaseEntity {
  return {
    id,
    entityType,
    content,
    contentHash: "x",
    metadata: { title },
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
  };
}

describe("buildBatchPrompt", () => {
  it("should include all entities with index, type, and title", () => {
    const entities = [
      makeEntity("p1", "post", "Institutional Design", "Content about DAOs"),
      makeEntity("p2", "post", "Token Engineering", "Content about tokens"),
    ];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("[1] Post: Institutional Design");
    expect(prompt).toContain("[2] Post: Token Engineering");
  });

  it("should include entity content", () => {
    const entities = [
      makeEntity("p1", "post", "My Post", "This is the full post content."),
    ];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("This is the full post content.");
  });

  it("should separate entities with dividers", () => {
    const entities = [
      makeEntity("a", "post", "A", "Content A"),
      makeEntity("b", "note", "B", "Content B"),
    ];

    const prompt = buildBatchPrompt(entities);

    // Should have --- dividers between entities
    expect(prompt).toContain("---");
  });

  it("should capitalize entity type in header", () => {
    const entities = [makeEntity("p1", "social-post", "My Post", "content")];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("Social-post: My Post");
  });

  it("should use entity id as title fallback", () => {
    const entities = [
      {
        id: "my-entity",
        entityType: "post",
        content: "content",
        contentHash: "x",
        metadata: {},
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
      },
    ];

    const prompt = buildBatchPrompt(entities);

    expect(prompt).toContain("my-entity");
  });

  it("should handle empty batch", () => {
    const prompt = buildBatchPrompt([]);
    expect(prompt).toBe("");
  });
});

describe("extractTopicsBatched", () => {
  it("preloads existing topics once per run", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const entityService = mockShell.getEntityService();

    await entityService.createEntity({
      entity: {
        id: "existing-topic",
        entityType: "topic",
        content: topicAdapter.createTopicBody({
          title: "Existing Topic",
          content: "Already known.",
        }),
        metadata: { aliases: [] },
      },
    });

    let topicListCalls = 0;
    const originalListEntities = entityService.listEntities.bind(entityService);
    spyOn(entityService, "listEntities").mockImplementation(async (request) => {
      if (request.entityType === "topic") topicListCalls++;
      return originalListEntities(request);
    });

    spyOn(context.ai, "generate").mockResolvedValue({
      topics: [
        {
          title: "Knowledge Management",
          content: "Teams organize durable shared context.",
          relevanceScore: 0.9,
        },
        {
          title: "Team Memory",
          content: "Teams preserve useful memory over time.",
          relevanceScore: 0.85,
        },
      ],
    });

    const result = await extractTopicsBatched(
      [
        makeEntity("p1", "post", "Post 1", "Content 1"),
        makeEntity("p2", "post", "Post 2", "Content 2"),
      ],
      context,
      logger,
    );

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(topicListCalls).toBe(1);
  });

  it("emits one topic batch completion event after creating topics", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const send = spyOn(context.messaging, "send");

    spyOn(context.ai, "generate").mockResolvedValue({
      topics: [
        {
          title: "Batch Events",
          content: "Topic batches emit one completion event.",
          relevanceScore: 0.9,
        },
        {
          title: "Source Backpressure",
          content: "Source changes are processed together.",
          relevanceScore: 0.8,
        },
      ],
    });

    await extractTopicsBatched(
      [makeEntity("p1", "post", "Post 1", "Content 1")],
      context,
      logger,
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "topics:batch-completed",
      payload: {
        created: 2,
        skipped: 0,
        batches: 1,
      },
      broadcast: true,
    });
  });

  it("does not emit a topic batch completion event when nothing changes", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const send = spyOn(context.messaging, "send");

    spyOn(context.ai, "generate").mockResolvedValue({ topics: [] });

    await extractTopicsBatched(
      [makeEntity("p1", "post", "Post 1", "Content 1")],
      context,
      logger,
    );

    expect(send).not.toHaveBeenCalled();
  });

  it("filters extracted topics below the configured relevance threshold", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");

    spyOn(context.ai, "generate").mockResolvedValue({
      topics: [
        {
          title: "High Relevance",
          content: "This topic should be created.",
          relevanceScore: 0.9,
        },
        {
          title: "Low Relevance",
          content: "This topic should be ignored.",
          relevanceScore: 0.2,
        },
      ],
    });

    const result = await extractTopicsBatched(
      [makeEntity("p1", "post", "Post 1", "Content 1")],
      context,
      logger,
      { minRelevanceScore: 0.5 },
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);

    const topics = await mockShell.getEntityService().listEntities({
      entityType: "topic",
    });
    expect(topics).toHaveLength(1);
    expect(topics[0]?.id).toBe("high-relevance");
  });

  it("updates the in-memory index after creates in the same run", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");

    spyOn(context.ai, "generate").mockResolvedValue({
      topics: [
        {
          title: "Team Memory",
          content: "Teams preserve useful memory over time.",
          relevanceScore: 0.9,
        },
        {
          title: "Team Memory",
          content: "Duplicate title from the same extraction batch.",
          relevanceScore: 0.8,
        },
      ],
    });

    const result = await extractTopicsBatched(
      [makeEntity("p1", "post", "Post 1", "Content 1")],
      context,
      logger,
    );

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);

    const topics = await mockShell.getEntityService().listEntities({
      entityType: "topic",
    });
    expect(topics).toHaveLength(1);
    expect(topics[0]?.id).toBe("team-memory");
  });
});
