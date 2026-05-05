import { beforeEach, describe, expect, it } from "bun:test";
import { TopicProcessingHandler } from "../../src/handlers/topic-processing-handler";
import { createSilentLogger } from "@brains/test-utils";
import {
  createEntityPluginContext,
  createMockShell,
  type EntityPluginContext,
  type Logger,
  type MockShell,
} from "@brains/plugins/test";
import { ProgressReporter } from "@brains/utils";
import type { ITopicMergeSynthesizer } from "../../src/lib/topic-merge-synthesizer";
import type { TopicMergeSynthesisResult } from "../../src/templates/merge-synthesis-template";
import { TopicAdapter } from "../../src/lib/topic-adapter";

const topicAdapter = new TopicAdapter();

describe("TopicProcessingHandler", () => {
  let handler: TopicProcessingHandler;
  let context: EntityPluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;
  let topicMergeSynthesizer: ITopicMergeSynthesizer;

  beforeEach((): void => {
    logger = createSilentLogger();
    mockShell = createMockShell({ logger });
    context = createEntityPluginContext(mockShell, "topics");
    topicMergeSynthesizer = {
      synthesize: async (): Promise<TopicMergeSynthesisResult> => ({
        title: "Human-Agent Collaboration",
        content:
          "AI agents collaborate with humans on shared work. Agents participate as collaborators in distributed teams.",
      }),
    };
    handler = new TopicProcessingHandler(
      context,
      logger,
      topicMergeSynthesizer,
    );

    const reporter = ProgressReporter.from(async () => {});
    if (!reporter) {
      throw new Error("Failed to create progress reporter");
    }
    progressReporter = reporter;
  });

  async function createExistingTopic(params: {
    id: string;
    title: string;
    content: string;
  }): Promise<void> {
    await mockShell.getEntityService().createEntity({
      entity: {
        id: params.id,
        entityType: "topic",
        content: topicAdapter.createTopicBody({
          title: params.title,
          content: params.content,
        }),
        metadata: { aliases: [] },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    });
  }

  it("merges into an existing similar topic when autoMerge is enabled", async () => {
    await createExistingTopic({
      id: "human-ai-collaboration",
      title: "Human-AI Collaboration",
      content: "AI agents collaborate with humans on shared work.",
    });

    const result = await handler.process(
      {
        topic: {
          title: "Human-Agent Collaboration",
          content: "Agents participate as collaborators in distributed teams.",
          relevanceScore: 0.9,
        },
        sourceEntityId: "post-1",
        sourceEntityType: "post",
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      },
      "job-1",
      progressReporter,
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe("merged");
    expect(result.topicId).toBe("human-ai-collaboration");

    const topics = await mockShell.getEntityService().listEntities({
      entityType: "topic",
    });
    expect(topics).toHaveLength(1);
    expect(topics[0]?.id).toBe("human-ai-collaboration");
    expect(topicAdapter.parseTopicBody(topics[0]?.content ?? "").title).toBe(
      "Human-AI Collaboration",
    );
    expect(topics[0]?.content).toContain(
      "AI agents collaborate with humans on shared work.",
    );
    expect(topics[0]?.content).toContain(
      "Agents participate as collaborators in distributed teams.",
    );
    expect(topics[0]?.metadata).toEqual({
      aliases: ["Human-Agent Collaboration"],
    });
  });

  it("creates a new topic when no merge candidate is found", async () => {
    await createExistingTopic({
      id: "biomimicry",
      title: "Biomimicry",
      content: "Nature inspires design and innovation.",
    });

    const result = await handler.process(
      {
        topic: {
          title: "Educational Technology",
          content: "Digital tools reshape how people learn.",
          relevanceScore: 0.8,
        },
        sourceEntityId: "post-2",
        sourceEntityType: "post",
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      },
      "job-2",
      progressReporter,
    );

    expect(result.success).toBe(true);
    expect(result.action).toBe("created");

    const topics = await mockShell.getEntityService().listEntities({
      entityType: "topic",
    });
    expect(topics).toHaveLength(2);
    expect(topics.map((topic) => topic.id).sort()).toEqual([
      "biomimicry",
      "educational-technology",
    ]);
  });
});
