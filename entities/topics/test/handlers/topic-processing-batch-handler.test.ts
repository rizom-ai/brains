import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { TopicProcessingBatchHandler } from "../../src/handlers/topic-processing-batch-handler";
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

describe("TopicProcessingBatchHandler", () => {
  let handler: TopicProcessingBatchHandler;
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
      synthesize: async ({
        existingTopic,
        incomingTopic,
      }): Promise<TopicMergeSynthesisResult> => {
        const parsed = topicAdapter.parseTopicBody(existingTopic.content);
        return {
          title: parsed.title,
          content: `${parsed.content}\n\n${incomingTopic.content}`,
        };
      },
    };
    handler = new TopicProcessingBatchHandler(
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

  it("preloads existing topics once for multiple incoming topics", async () => {
    await createExistingTopic({
      id: "biomimicry",
      title: "Biomimicry",
      content: "Nature inspires design and innovation.",
    });

    const entityService = mockShell.getEntityService();
    const originalListEntities = entityService.listEntities.bind(entityService);
    let topicListCalls = 0;
    spyOn(entityService, "listEntities").mockImplementation(async (request) => {
      if (request.entityType === "topic") topicListCalls++;
      return originalListEntities(request);
    });

    const result = await handler.process(
      {
        topics: [
          {
            title: "Educational Technology",
            content: "Digital tools reshape how people learn.",
            relevanceScore: 0.8,
          },
          {
            title: "Knowledge Management",
            content: "Teams organize durable shared context.",
            relevanceScore: 0.85,
          },
        ],
        sourceEntityId: "post-1",
        sourceEntityType: "post",
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      },
      "job-1",
      progressReporter,
    );

    expect(result.success).toBe(true);
    expect(result.created).toBe(2);
    expect(result.merged).toBe(0);
    expect(topicListCalls).toBe(1);
  });

  it("updates the in-memory index so later topics can merge with earlier creates", async () => {
    const result = await handler.process(
      {
        topics: [
          {
            title: "Human-AI Collaboration",
            content: "AI agents collaborate with humans on shared work.",
            relevanceScore: 0.9,
          },
          {
            title: "Human-Agent Collaboration",
            content:
              "Agents participate as collaborators in distributed teams.",
            relevanceScore: 0.9,
          },
        ],
        sourceEntityId: "post-2",
        sourceEntityType: "post",
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      },
      "job-2",
      progressReporter,
    );

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    expect(result.merged).toBe(1);

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
});
