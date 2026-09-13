import { createMockEntityService } from "@brains/entity-service/test";
import { describe, it, expect, spyOn } from "bun:test";
import type { ContentVisibility } from "@brains/plugins";
import type { TopicMetadata } from "../../src/schemas/topic";
import type { TopicEntity } from "../../src/types";
import { TopicService } from "../../src/lib/topic-service";
import { createSilentLogger } from "@brains/test-utils";
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
    it("uses semantic distance as the merge arbiter", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic(
        "messaging-validation",
        "Messaging Validation",
        "Validating message resonance and audience understanding.",
      );
      const entityService = createMockEntityService({
        returns: { getEntity: existing },
      });
      spyOn(entityService, "searchWithDistances").mockResolvedValue([
        {
          entityId: existing.id,
          entityType: "topic",
          distance: 0.2,
        },
      ]);
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: {
          title: "Message Testing",
          content: "Testing whether positioning language works for readers.",
        },
        threshold: 0.35,
      });

      expect(candidate?.topic.id).toBe("messaging-validation");
      expect(candidate?.score).toBe(0.8);
    });

    it("does not merge lexical near matches when semantic distance is too high", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic("ai-collaboration", "AI Collaboration");
      const entityService = createMockEntityService({
        returns: {
          search: [{ entity: existing, score: 0.9, excerpt: "" }],
          getEntity: existing,
        },
      });
      spyOn(entityService, "searchWithDistances").mockResolvedValue([
        {
          entityId: existing.id,
          entityType: "topic",
          distance: 0.7,
        },
      ]);
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-AI Collaboration" },
        threshold: 0.35,
      });

      expect(candidate).toBeNull();
    });

    it("returns distance-result candidate within threshold", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
      );
      const entityService = createMockEntityService({
        returns: { getEntity: existing },
      });
      spyOn(entityService, "searchWithDistances").mockResolvedValue([
        { entityId: existing.id, entityType: "topic", distance: 0.2 },
      ]);
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.35,
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration");
      expect(candidate?.title).toBe("Human-AI Collaboration");
    });

    it("keeps exact-title additionalCandidates as a fast path", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
      );
      const entityService = createMockEntityService();
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-AI Collaboration" },
        threshold: 0.35,
        additionalCandidates: [existing],
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration");
      expect(entityService.searchWithDistances).toHaveBeenCalled();
    });

    it("dedupes a topic appearing in both distance search and additionalCandidates", async () => {
      const logger = createSilentLogger();
      const existing = makeTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
      );
      const entityService = createMockEntityService({
        returns: { getEntity: existing },
      });
      spyOn(entityService, "searchWithDistances").mockResolvedValue([
        { entityId: existing.id, entityType: "topic", distance: 0.2 },
      ]);
      const service = new TopicService(entityService, logger);
      const adapterSpy = spyOn(TopicAdapter.prototype, "parseTopicBody");

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-AI Collaboration" },
        threshold: 0.35,
        additionalCandidates: [existing],
      });

      expect(candidate?.topic.id).toBe("human-ai-collaboration");
      expect(adapterSpy).toHaveBeenCalledTimes(1);
      adapterSpy.mockRestore();
    });

    it("returns null when no distance candidate clears the threshold", async () => {
      const logger = createSilentLogger();
      const unrelated = makeTopic("biomimicry", "Biomimicry");
      const entityService = createMockEntityService({
        returns: { getEntity: unrelated },
      });
      spyOn(entityService, "searchWithDistances").mockResolvedValue([
        { entityId: unrelated.id, entityType: "topic", distance: 0.7 },
      ]);
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.35,
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
        returns: { getEntity: restrictedTopic },
      });
      spyOn(entityService, "searchWithDistances").mockResolvedValue([
        { entityId: publicTopic.id, entityType: "topic", distance: 0.1 },
        { entityId: restrictedTopic.id, entityType: "topic", distance: 0.2 },
      ]);
      const service = new TopicService(entityService, logger);

      const candidate = await service.findMergeCandidate({
        incoming: { title: "Human-Agent Collaboration" },
        threshold: 0.35,
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
    function seededService(topics: TopicEntity[]): {
      service: TopicService;
      shell: ReturnType<typeof createMockShell>;
    } {
      const shell = createMockShell();
      shell.addEntities(topics);
      return {
        service: new TopicService(
          shell.getEntityService(),
          createSilentLogger(),
        ),
        shell,
      };
    }

    it("getTopic fails closed to public when visibility is omitted", async () => {
      const { service } = seededService([
        makeTopic("private-topic", "Private Topic", "Body.", "restricted"),
      ]);

      expect(await service.getTopic("private-topic")).toBeNull();
      const scoped = await service.getTopic("private-topic", "restricted");
      expect(scoped?.id).toBe("private-topic");
    });

    it("getTopic rejects lower-visibility entities returned within the read scope", async () => {
      // A shared read scope can see public entities, but the service treats
      // visibility as a partition key and rejects the cross-partition hit.
      const { service } = seededService([
        makeTopic("same-id", "Same ID", "Public content.", "public"),
      ]);

      expect(await service.getTopic("same-id", "shared")).toBeNull();
    });

    it("getTopic returns an entity from the requested visibility partition", async () => {
      const { service } = seededService([
        makeTopic("same-id-shared", "Same ID", "Shared content.", "shared"),
      ]);

      const result = await service.getTopic("same-id-shared", "shared");

      expect(result?.id).toBe("same-id-shared");
    });

    it("createTopic preserves an existing topic in the requested partition", async () => {
      const shell = createMockShell();
      const service = new TopicService(
        shell.getEntityService(),
        createSilentLogger(),
      );
      const existingId = service.getTopicIdForTitle("Shared Topic", "shared");
      shell.addEntities([
        makeTopic(existingId, "Shared Topic", "User-edited body.", "shared"),
      ]);

      const result = await service.createTopic({
        title: "Shared Topic",
        content: "Incoming body.",
        visibility: "shared",
      });

      expect(result?.id).toBe(existingId);
      expect(result?.content).toContain("User-edited body.");
    });

    it("createTopicOptimistic recovers an existing topic within the requested visibility partition", async () => {
      const shell = createMockShell();
      const service = new TopicService(
        shell.getEntityService(),
        createSilentLogger(),
      );
      const existingId = service.getTopicIdForTitle("Race Topic", "restricted");
      shell.addEntities([
        makeTopic(
          existingId,
          "Race Topic",
          "Created by another worker.",
          "restricted",
        ),
      ]);
      spyOn(shell.getEntityService(), "createEntity").mockRejectedValue(
        new Error("Entity already exists"),
      );

      const result = await service.createTopicOptimistic({
        title: "Race Topic",
        content: "Incoming.",
        visibility: "restricted",
      });

      expect(result.created).toBe(false);
      expect(result.topic?.id).toBe(existingId);
      expect(result.topic?.content).toContain("Created by another worker.");
    });

    it("updateTopic updates only within the requested visibility partition", async () => {
      const { service } = seededService([
        makeTopic(
          "shared-topic-shared",
          "Shared Topic",
          "Original body.",
          "shared",
        ),
      ]);

      // Wrong partition: the shared-only topic is not updatable as public.
      expect(
        await service.updateTopic(
          "shared-topic-shared",
          { content: "Updated body." },
          "public",
        ),
      ).toBeNull();

      const updated = await service.updateTopic(
        "shared-topic-shared",
        { content: "Updated body." },
        "shared",
      );
      expect(updated?.content).toContain("Updated body.");
    });

    it("applySynthesizedMerge updates the existing topic at the requested visibility", async () => {
      const { service } = seededService([
        makeTopic(
          "restricted-topic-restricted",
          "Restricted Topic",
          "Body.",
          "restricted",
        ),
      ]);

      await service.applySynthesizedMerge({
        existingId: "restricted-topic-restricted",
        synthesized: { title: "Restricted Topic", content: "Merged body." },
        visibility: "restricted",
      });

      const merged = await service.getTopic(
        "restricted-topic-restricted",
        "restricted",
      );
      expect(merged?.content).toContain("Merged body.");
    });

    it("mergeTopics only merges topics visible in the requested partition", async () => {
      const { service } = seededService([
        makeTopic("topic-a-shared", "Topic A", "Body A.", "shared"),
        makeTopic("topic-b-shared", "Topic B", "Body B.", "shared"),
        makeTopic("topic-c-public", "Topic C", "Body C.", "public"),
      ]);

      const merged = await service.mergeTopics(
        ["topic-a-shared", "topic-b-shared"],
        undefined,
        "shared",
      );

      expect(merged?.id).toBe("topic-a-shared");
      expect(merged?.content).toContain("Body A.");
      expect(merged?.content).toContain("Body B.");
      expect(await service.getTopic("topic-b-shared", "shared")).toBeNull();

      // Public-partition topics are invisible to a merge scoped elsewhere.
      expect(
        await service.mergeTopics(
          ["topic-c-public", "topic-a-shared"],
          undefined,
          "restricted",
        ),
      ).toBeNull();
    });
  });
});
