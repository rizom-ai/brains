import { describe, it, expect, spyOn } from "bun:test";
import type { ContentVisibility } from "@brains/plugins";
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

function makeTopic(
  id: string,
  title: string,
  content = "Body.",
  visibility: ContentVisibility = "public",
): TopicEntity {
  return {
    id,
    entityType: "topic",
    content: topicAdapter.createTopicBody({ title, content }),
    contentHash: `hash-${id}`,
    visibility,
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
      const existing = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
      );
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
      const existing = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
      );
      const entityService = createMockEntityService({
        returns: { search: [] },
      });
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
      const existing = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
      );
      const entityService = createMockEntityService({
        returns: {
          search: [{ entity: existing, score: 0.9, excerpt: "" }],
        },
      });
      const service = new TopicService(entityService, logger);
      const adapterSpy = spyOn(TopicAdapter.prototype, "parseTopicBody");

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

    it("ignores candidates outside the target visibility partition", async () => {
      const logger = createSilentLogger();
      const publicTopic = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
        "Public body.",
        "public",
      );
      const restrictedTopic = makeTopic(
        "human-ai-collaboration-restricted",
        "Human-AI Collaboration",
        "Restricted body.",
        "restricted",
      );
      const entityService = createMockEntityService({
        returns: {
          search: [
            { entity: publicTopic, score: 0.9, excerpt: "" },
            { entity: restrictedTopic, score: 0.9, excerpt: "" },
          ],
        },
      });
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.85,
        targetVisibility: "restricted",
        additionalCandidates: [publicTopic],
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration-restricted");
    });
  });

  it("createTopicOptimistic recovers from concurrent insert races", async () => {
    const logger = createSilentLogger();
    const existingTopic: TopicEntity = {
      id: "race-topic",
      entityType: "topic",
      content: topicAdapter.createTopicBody({
        title: "Race Topic",
        content: "Created by another worker.",
      }),
      contentHash: "hash",
      visibility: "public",
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

  describe("visibility threading", () => {
    it("getTopic passes visibility to entityService.getEntity", async () => {
      const logger = createSilentLogger();
      const entityService = createMockEntityService();
      const service = new TopicService(entityService, logger);

      await service.getTopic("some-id", "restricted");

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "some-id",
        visibilityScope: "restricted",
      });
    });

    it("getTopic defaults visibility to public when omitted", async () => {
      const logger = createSilentLogger();
      const entityService = createMockEntityService();
      const service = new TopicService(entityService, logger);

      await service.getTopic("some-id");

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "some-id",
        visibilityScope: "public",
      });
    });

    it("createTopic checks existence within the requested visibility partition", async () => {
      const logger = createSilentLogger();
      const entityService = createMockEntityService();
      const service = new TopicService(entityService, logger);

      await service.createTopic({
        title: "Shared Topic",
        content: "Body.",
        visibility: "shared",
      });

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: expect.stringContaining("shared"),
        visibilityScope: "shared",
      });
    });

    it("createTopicOptimistic recovers an existing topic within the requested visibility partition", async () => {
      const logger = createSilentLogger();
      const existingRestricted = makeTopic(
        "race-topic-restricted",
        "Race Topic",
        "Created by another worker.",
        "restricted",
      );
      const entityService = createMockEntityService({
        returns: { getEntity: existingRestricted },
      });
      spyOn(entityService, "createEntity").mockRejectedValue(
        new Error("Entity already exists"),
      );
      const service = new TopicService(entityService, logger);

      const result = await service.createTopicOptimistic({
        title: "Race Topic",
        content: "Incoming.",
        visibility: "restricted",
      });

      expect(result.created).toBe(false);
      expect(result.topic?.id).toBe("race-topic-restricted");
      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "race-topic-restricted",
        visibilityScope: "restricted",
      });
    });

    it("updateTopic looks up the existing topic within the requested visibility partition", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic(
        "shared-topic-shared",
        "Shared Topic",
        "Original body.",
        "shared",
      );
      const entityService = createMockEntityService({
        returns: { getEntity: existing },
      });
      const service = new TopicService(entityService, logger);

      await service.updateTopic(
        "shared-topic-shared",
        { content: "Updated body." },
        "shared",
      );

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "shared-topic-shared",
        visibilityScope: "shared",
      });
    });

    it("applySynthesizedMerge looks up and updates the existing topic at the requested visibility", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic(
        "restricted-topic-restricted",
        "Restricted Topic",
        "Body.",
        "restricted",
      );
      const entityService = createMockEntityService({
        returns: { getEntity: existing },
      });
      const service = new TopicService(entityService, logger);

      await service.applySynthesizedMerge({
        existingId: "restricted-topic-restricted",
        synthesized: { title: "Restricted Topic", content: "Merged body." },
        visibility: "restricted",
      });

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "restricted-topic-restricted",
        visibilityScope: "restricted",
      });
    });

    it("mergeTopics looks up each topic at the requested visibility", async () => {
      const logger = createSilentLogger();
      const entityService = createMockEntityService();
      const service = new TopicService(entityService, logger);

      await service.mergeTopics(
        ["topic-a-shared", "topic-b-shared"],
        undefined,
        "shared",
      );

      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "topic-a-shared",
        visibilityScope: "shared",
      });
      expect(entityService.getEntity).toHaveBeenCalledWith({
        entityType: "topic",
        id: "topic-b-shared",
        visibilityScope: "shared",
      });
    });
  });
});
