import { describe, it, expect, beforeEach } from "bun:test";
import { TopicExtractionHandler } from "../../src/handlers/topic-extraction-handler";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { ProgressReporter } from "@brains/utils";
import type { TopicsPluginConfig } from "../../src/schemas/config";

describe("TopicExtractionHandler", () => {
  let handler: TopicExtractionHandler;
  let context: ServicePluginContext;
  let config: TopicsPluginConfig;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    config = {
      windowSize: 30,
      minRelevanceScore: 0.7,
      mergeSimilarityThreshold: 0.8,
      autoMerge: true,
      enableAutoExtraction: true,
    };
    handler = new TopicExtractionHandler(context, config, logger);
    progressReporter = {
      report: async () => {},
      complete: async () => {},
      error: async () => {},
    } as unknown as ProgressReporter;
  });

  it("should be instantiable", () => {
    expect(handler).toBeDefined();
  });

  it("should have process method", () => {
    expect(typeof handler.process).toBe("function");
  });

  it("should process extraction job with valid data", async () => {
    const jobData = {
      conversationId: "test-conversation",
      windowSize: 20,
      minRelevanceScore: 0.5,
    };

    const result = await handler.process(
      jobData,
      "test-job-id",
      progressReporter,
    );
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.extractedCount).toBe("number");
    expect(typeof result.mergedCount).toBe("number");
  });
});
