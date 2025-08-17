import { describe, it, expect, beforeEach } from "bun:test";
import { TopicExtractionHandler } from "../../src/handlers/topic-extraction-handler";
import { MockShell } from "@brains/plugins";
import { createServicePluginContext } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import { Logger, ProgressReporter } from "@brains/utils";
import {
  defaultTopicsPluginConfig,
  type TopicsPluginConfig,
} from "../../src/schemas/config";

describe("TopicExtractionHandler", () => {
  let handler: TopicExtractionHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let config: TopicsPluginConfig;

  beforeEach(async () => {
    logger = Logger.getInstance().child("test");
    mockShell = new MockShell({ logger });

    // Create service plugin context with mock shell
    context = createServicePluginContext(mockShell, "topics", logger);

    // Build config with defaults
    config = {
      extractionWindowHours:
        defaultTopicsPluginConfig.extractionWindowHours ?? 24,
      minRelevanceScore: defaultTopicsPluginConfig.minRelevanceScore ?? 0.5,
      mergeSimilarityThreshold:
        defaultTopicsPluginConfig.mergeSimilarityThreshold ?? 0.8,
      autoExtract: defaultTopicsPluginConfig.autoExtract ?? true,
      autoMerge: defaultTopicsPluginConfig.autoMerge ?? true,
    };

    handler = new TopicExtractionHandler(context, config, logger);
  });

  describe("validateAndParse", () => {
    it("should validate valid extraction config", () => {
      const validConfig = {
        conversationId: "conv-123",
        startIdx: 1,
        endIdx: 30,
        minRelevanceScore: 0.5,
      };

      const result = handler.validateAndParse(validConfig);

      expect(result).not.toBeNull();
      expect(result?.conversationId).toBe("conv-123");
      expect(result?.startIdx).toBe(1);
      expect(result?.endIdx).toBe(30);
      expect(result?.minRelevanceScore).toBe(0.5);
    });

    it("should use defaults for missing fields", () => {
      const result = handler.validateAndParse({
        conversationId: "conv-123",
        startIdx: 1,
        endIdx: 30,
      });

      expect(result).not.toBeNull();
      expect(result?.conversationId).toBe("conv-123");
      expect(result?.startIdx).toBe(1);
      expect(result?.endIdx).toBe(30);
      expect(result?.minRelevanceScore).toBeUndefined();
    });

    it("should return null for invalid startIdx", () => {
      const invalidConfig = {
        conversationId: "conv-123",
        startIdx: 0, // Must be at least 1
        endIdx: 30,
      };

      const result = handler.validateAndParse(invalidConfig);
      expect(result).toBeNull();
    });

    it("should return null for invalid relevance score", () => {
      const invalidConfig = {
        conversationId: "conv-123",
        startIdx: 1,
        endIdx: 30,
        minRelevanceScore: 1.5, // Must be between 0 and 1
      };

      const result = handler.validateAndParse(invalidConfig);
      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    it("should handle extraction request", async () => {
      // Create a mock progress reporter
      const mockProgressReporter = {
        report: async () => {},
        complete: async () => {},
        error: async () => {},
      };

      // Mock conversation search to return empty array
      const result = await handler.process(
        {
          conversationId: "conv-123",
          startIdx: 1,
          endIdx: 30,
          minRelevanceScore: 0.7,
        },
        "test-job-id",
        mockProgressReporter as ProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.extractedCount).toBe(0);
      expect(result.mergedCount).toBe(0);
    });

    it("should throw on database errors", async () => {
      // Create a handler with a context that will throw
      const errorContext = {
        ...context,
        getMessages: async () => {
          throw new Error("Database error");
        },
      } as ServicePluginContext;

      const errorHandler = new TopicExtractionHandler(
        errorContext,
        config,
        logger,
      );

      // Create a mock progress reporter
      const mockProgressReporter = {
        report: async () => {},
        complete: async () => {},
        error: async () => {},
      };

      // Job handlers should throw on errors so the job queue can retry
      await expect(
        errorHandler.process(
          {
            conversationId: "conv-123",
            startIdx: 1,
            endIdx: 30,
            minRelevanceScore: 0.5,
          },
          "test-job-id",
          mockProgressReporter as ProgressReporter,
        ),
      ).rejects.toThrow("Database error");
    });
  });
});
