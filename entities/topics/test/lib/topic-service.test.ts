import { describe, it, expect, spyOn } from "bun:test";
import type { TopicMetadata } from "../../src/schemas/topic";
import type { TopicEntity } from "../../src/types";
import { TopicService } from "../../src/lib/topic-service";
import {
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
import {
  createMockShell,
  createEntityPluginContext,
} from "@brains/plugins/test";
import { TopicAdapter } from "../../src/lib/topic-adapter";

function makeTopic(id: string, title: string, content = "Body."): TopicEntity {
  return {
    id,
    entityType: "topic",
    content: topicAdapter.createTopicBody({ title, content }),
    contentHash: `hash-${id}`,
    metadata: {},
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
  };
}

const topicAdapter = new TopicAdapter();

describe("TopicService", () => {
  it("should be instantiable", () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    expect(service).toBeDefined();
  });

  it("should return null for non-existent topic", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.getTopic("non-existent");
    expect(result).toBeNull();
  });

  it("should return empty array when no topics exist", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.listTopics();
    expect(result).toEqual([]);
  });

  it("should return empty search results for empty query", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const result = await service.searchTopics("");
    expect(result).toEqual([]);
  });

  it("defaults created topic metadata to empty object", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const service = new TopicService(context.entityService, logger);

    const created = await service.createTopic({
      title: "Test Topic",
      content: "Topic content",
    });

    expect(created?.metadata).toEqual({} satisfies TopicMetadata);
  });

  describe("findMergeCandidate", () => {
    it("returns search-result candidate above threshold", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic("human-ai-collaboration", "Human-AI Collaboration");
      const entityService = createMockEntityService({
        returns: {
          search: [{ entity: existing, score: 0.9, excerpt: "" }],
        },
      });
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.85,
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration");
      expect(candidate?.title).toBe("Human-AI Collaboration");
    });

    it("returns additionalCandidates hit when search is empty", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic("human-ai-collaboration", "Human-AI Collaboration");
      const entityService = createMockEntityService({ returns: { search: [] } });
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.85,
        additionalCandidates: [existing],
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration");
    });

    it("dedupes a topic appearing in both search and additionalCandidates", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic("human-ai-collaboration", "Human-AI Collaboration");
      const entityService = createMockEntityService({
        returns: {
          search: [{ entity: existing, score: 0.9, excerpt: "" }],
        },
      });
      const service = new TopicService(entityService, logger);
      const adapterSpy = spyOn(
        TopicAdapter.prototype,
        "parseTopicBody",
      );

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.85,
        additionalCandidates: [existing],
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration");
      expect(adapterSpy).toHaveBeenCalledTimes(1);
      adapterSpy.mockRestore();
    });

    it("returns null when no candidate clears the threshold", async () => {
      const logger = createSilentLogger();
      const unrelated = makeTopic("biomimicry", "Biomimicry");
      const entityService = createMockEntityService({
        returns: {
          search: [{ entity: unrelated, score: 0.1, excerpt: "" }],
        },
      });
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.85,
      });

      expect(candidate).toBeNull();
    });
  });

  it("createTopicOptimistic recovers from concurrent insert races", async () => {
    const logger = createSilentLogger();
    const existingTopic = {
      id: "race-topic",
      entityType: "topic",
      content: topicAdapter.createTopicBody({
        title: "Race Topic",
        content: "Created by another worker.",
      }),
      contentHash: "hash",
      metadata: {},
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    };
    const entityService = createMockEntityService({
      returns: { getEntity: existingTopic },
    });
    spyOn(entityService, "createEntity").mockRejectedValue(
      new Error("Entity already exists"),
    );
    const service = new TopicService(entityService, logger);

    const result = await service.createTopicOptimistic({
      title: "Race Topic",
      content: "Incoming content.",
    });

    expect(result.created).toBe(false);
    expect(result.topic?.id).toBe("race-topic");
  });
});
