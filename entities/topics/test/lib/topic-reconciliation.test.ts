import { describe, expect, it, mock, spyOn } from "bun:test";
import type { ContentVisibility } from "@brains/plugins";
import {
  createEntityPluginContext,
  createMockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { TopicEntity } from "../../src/types";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import { reconcileTopics } from "../../src/lib/topic-reconciliation";
import type { ITopicMergeSynthesizer } from "../../src/lib/topic-merge-synthesizer";

const adapter = new TopicAdapter();

function makeTopic(params: {
  id: string;
  title: string;
  content: string;
  visibility?: ContentVisibility;
  created?: string;
}): TopicEntity {
  const created = params.created ?? "2026-01-01T00:00:00Z";
  return {
    id: params.id,
    entityType: "topic",
    content: adapter.createTopicBody({
      title: params.title,
      content: params.content,
    }),
    contentHash: `hash-${params.id}`,
    visibility: params.visibility ?? "public",
    metadata: {},
    created,
    updated: created,
  };
}

describe("reconcileTopics", () => {
  it("merges already-existing duplicate topics through the synthesizer", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    mockShell.addEntities([
      makeTopic({
        id: "human-ai-collaboration",
        title: "Human-AI Collaboration",
        content: "Humans and AI systems collaborate in shared workflows.",
        created: "2026-01-01T00:00:00Z",
      }),
      makeTopic({
        id: "human-agent-collaboration",
        title: "Human-Agent Collaboration",
        content: "Software agents participate alongside people.",
        created: "2026-01-02T00:00:00Z",
      }),
    ]);
    spyOn(context.entityService, "searchWithDistances").mockResolvedValue([
      {
        entityId: "human-agent-collaboration",
        entityType: "topic",
        distance: 0.18,
      },
    ]);
    const synthesizer: ITopicMergeSynthesizer = {
      synthesize: mock(async () => ({
        verdict: "merge" as const,
        title: "Human-AI Collaboration",
        content:
          "Humans and AI systems collaborate in shared workflows. Software agents participate alongside people.",
      })),
    };

    const result = await reconcileTopics({
      context,
      logger,
      semanticMergeDistance: 0.35,
      targetVisibility: "public",
      synthesizer,
    });

    expect(result).toMatchObject({ merged: 1, distinct: 0, scannedPairs: 1 });
    expect(result.deletedIds).toEqual(["human-agent-collaboration"]);
    const remaining = await context.entityService.listEntities<TopicEntity>({
      entityType: "topic",
      options: { filter: { visibilityScope: "public" } },
    });
    expect(remaining.map((topic) => topic.id)).toEqual([
      "human-ai-collaboration",
    ]);
    expect(remaining[0]?.content).toContain(
      "Software agents participate alongside people",
    );
  });

  it("keeps semantically close topics when the synthesizer returns distinct", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    mockShell.addEntities([
      makeTopic({
        id: "biomimicry",
        title: "Biomimicry",
        content: "Learning design principles from living systems.",
      }),
      makeTopic({
        id: "biosecurity",
        title: "Biosecurity",
        content: "Managing biological risks and safeguards.",
      }),
    ]);
    spyOn(context.entityService, "searchWithDistances").mockResolvedValue([
      { entityId: "biosecurity", entityType: "topic", distance: 0.2 },
    ]);
    const synthesizer: ITopicMergeSynthesizer = {
      synthesize: mock(async () => ({
        verdict: "distinct" as const,
        title: "Biomimicry",
        content: "Learning design principles from living systems.",
      })),
    };

    const result = await reconcileTopics({
      context,
      logger,
      semanticMergeDistance: 0.35,
      targetVisibility: "public",
      synthesizer,
    });

    expect(result).toMatchObject({ merged: 0, distinct: 1, scannedPairs: 1 });
    const remaining = await context.entityService.listEntities<TopicEntity>({
      entityType: "topic",
      options: { filter: { visibilityScope: "public" } },
    });
    expect(remaining.map((topic) => topic.id).sort()).toEqual([
      "biomimicry",
      "biosecurity",
    ]);
  });

  it("does not reconcile across visibility partitions", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    mockShell.addEntities([
      makeTopic({
        id: "public-collaboration",
        title: "Human-AI Collaboration",
        content: "Public collaboration notes.",
        visibility: "public",
      }),
      makeTopic({
        id: "restricted-collaboration",
        title: "Human-Agent Collaboration",
        content: "Restricted collaboration notes.",
        visibility: "restricted",
      }),
    ]);
    spyOn(context.entityService, "searchWithDistances").mockResolvedValue([
      {
        entityId: "restricted-collaboration",
        entityType: "topic",
        distance: 0.1,
      },
    ]);
    const synthesizer: ITopicMergeSynthesizer = {
      synthesize: mock(async () => ({
        verdict: "merge" as const,
        title: "Human-AI Collaboration",
        content: "Should not be used.",
      })),
    };

    const result = await reconcileTopics({
      context,
      logger,
      semanticMergeDistance: 0.35,
      targetVisibility: "public",
      synthesizer,
    });

    expect(result).toMatchObject({ merged: 0, scannedPairs: 0 });
    expect(synthesizer.synthesize).not.toHaveBeenCalled();
    expect(
      await context.entityService.getEntity({
        entityType: "topic",
        id: "restricted-collaboration",
        visibilityScope: "restricted",
      }),
    ).not.toBeNull();
  });

  it("respects the configured scan budget", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    mockShell.addEntities([
      makeTopic({ id: "topic-a", title: "Topic A", content: "A" }),
      makeTopic({ id: "topic-b", title: "Topic B", content: "B" }),
      makeTopic({ id: "topic-c", title: "Topic C", content: "C" }),
    ]);
    const searchSpy = spyOn(
      context.entityService,
      "searchWithDistances",
    ).mockResolvedValue([
      { entityId: "topic-b", entityType: "topic", distance: 0.2 },
      { entityId: "topic-c", entityType: "topic", distance: 0.25 },
    ]);
    const synthesizer: ITopicMergeSynthesizer = {
      synthesize: mock(async () => ({
        verdict: "distinct" as const,
        title: "Topic A",
        content: "A",
      })),
    };

    const result = await reconcileTopics({
      context,
      logger,
      semanticMergeDistance: 0.35,
      targetVisibility: "public",
      maxPairs: 1,
      synthesizer,
    });

    expect(result).toMatchObject({ merged: 0, distinct: 1, scannedPairs: 1 });
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1);
  });
});
