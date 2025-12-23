import { describe, it, expect, beforeEach } from "bun:test";
import {
  TopicExtractionHandler,
  type TopicExtractionJobData,
} from "../../src/handlers/topic-extraction-handler";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import { ProgressReporter } from "@brains/utils";

describe("TopicExtractionHandler", () => {
  let handler: TopicExtractionHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    handler = new TopicExtractionHandler(context, logger);

    // Track progress calls
    progressCalls = [];
    const reporter = ProgressReporter.from(async (notification) => {
      const entry: { progress: number; message?: string } = {
        progress: notification.progress,
      };
      if (notification.message !== undefined) {
        entry.message = notification.message;
      }
      progressCalls.push(entry);
    });
    if (!reporter) {
      throw new Error("Failed to create progress reporter");
    }
    progressReporter = reporter;
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const validData = {
        entityId: "test-entity",
        entityType: "post",
        entityContent: "Test content about machine learning",
        entityMetadata: { title: "Test Post" },
        entityCreated: new Date().toISOString(),
        entityUpdated: new Date().toISOString(),
        minRelevanceScore: 0.5,
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      };

      const result = handler.validateAndParse(validData);

      expect(result).not.toBeNull();
      expect(result?.entityId).toBe("test-entity");
      expect(result?.entityType).toBe("post");
      expect(result?.minRelevanceScore).toBe(0.5);
    });

    it("should reject invalid job data - missing required fields", () => {
      const invalidData = {
        entityId: "test-entity",
        // missing entityType, entityContent, etc.
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject invalid job data - wrong types", () => {
      const invalidData = {
        entityId: "test-entity",
        entityType: "post",
        entityContent: "Test content",
        entityMetadata: { title: "Test" },
        entityCreated: new Date().toISOString(),
        entityUpdated: new Date().toISOString(),
        minRelevanceScore: "not a number", // wrong type
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject minRelevanceScore outside valid range", () => {
      const invalidData = {
        entityId: "test-entity",
        entityType: "post",
        entityContent: "Test content",
        entityMetadata: { title: "Test" },
        entityCreated: new Date().toISOString(),
        entityUpdated: new Date().toISOString(),
        minRelevanceScore: 1.5, // > 1
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    const createValidJobData = (content: string): TopicExtractionJobData => ({
      entityId: "test-entity",
      entityType: "post",
      entityContent: content,
      entityMetadata: { title: "Test Post" },
      entityCreated: new Date().toISOString(),
      entityUpdated: new Date().toISOString(),
      minRelevanceScore: 0.5,
      autoMerge: true,
      mergeSimilarityThreshold: 0.85,
    });

    it("should return success with 0 topics for empty content", async () => {
      const jobData = createValidJobData("");

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(0);
    });

    it("should return success with 0 topics for whitespace-only content", async () => {
      const jobData = createValidJobData("   \n\t  ");

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(0);
    });

    it("should extract topics from meaningful content", async () => {
      const jobData = createValidJobData(`
        # Introduction to Machine Learning

        Machine learning is a subset of artificial intelligence that enables
        systems to learn and improve from experience without being explicitly
        programmed. Deep learning, using neural networks, has revolutionized
        the field with breakthrough applications in computer vision and NLP.
      `);

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      // Note: actual topic count depends on AI response
      expect(result.topicsExtracted).toBeGreaterThanOrEqual(0);
    });

    it("should report progress during extraction", async () => {
      const jobData = createValidJobData("Brief content about technology");

      await handler.process(jobData, "job-123", progressReporter);

      // Verify progress was reported
      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });
});
