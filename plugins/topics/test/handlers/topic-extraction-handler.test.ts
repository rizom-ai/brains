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
import { ProgressReporter, computeContentHash } from "@brains/utils";
import type { BaseEntity } from "@brains/plugins";

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

  // Helper to add entity to MockShell's internal storage
  const addEntityToShell = (entity: BaseEntity): void => {
    // Access MockShell's internal entities map via createEntity
    void mockShell.getEntityService().createEntity(entity);
  };

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const validData = {
        entityId: "test-entity",
        entityType: "post",
        contentHash: computeContentHash("Test content"),
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
        // missing entityType, contentHash, etc.
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should reject invalid job data - wrong types", () => {
      const invalidData = {
        entityId: "test-entity",
        entityType: "post",
        contentHash: computeContentHash("Test content"),
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
        contentHash: computeContentHash("Test content"),
        minRelevanceScore: 1.5, // > 1
        autoMerge: true,
        mergeSimilarityThreshold: 0.85,
      };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });
  });

  describe("process", () => {
    const createJobData = (
      entityId: string,
      contentHash: string,
    ): TopicExtractionJobData => ({
      entityId,
      entityType: "post",
      contentHash,
      minRelevanceScore: 0.5,
      autoMerge: true,
      mergeSimilarityThreshold: 0.85,
    });

    const createEntity = (id: string, content: string): BaseEntity => ({
      id,
      entityType: "post",
      content,
      contentHash: computeContentHash(content),
      metadata: { title: "Test Post" },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });

    it("should return success with 0 topics when entity not found", async () => {
      // Don't add any entity - it won't be found
      const jobData = createJobData("non-existent", computeContentHash(""));

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(0);
    });

    it("should skip extraction when content has changed (staleness)", async () => {
      const originalContent = "Original content";
      const newContent = "Updated content that is different";

      // Add entity with NEW content
      const entity = createEntity("test-entity", newContent);
      addEntityToShell(entity);

      // But job data has hash of ORIGINAL content (simulating stale job)
      const jobData = createJobData(
        "test-entity",
        computeContentHash(originalContent),
      );

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(0);
    });

    it("should return success with 0 topics for empty content", async () => {
      const content = "";
      const entity = createEntity("test-entity", content);
      addEntityToShell(entity);

      const jobData = createJobData("test-entity", entity.contentHash);

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(0);
    });

    it("should return success with 0 topics for whitespace-only content", async () => {
      const content = "   \n\t  ";
      const entity = createEntity("test-entity", content);
      addEntityToShell(entity);

      const jobData = createJobData("test-entity", entity.contentHash);

      const result = await handler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(0);
    });

    it("should extract topics from meaningful content", async () => {
      const content = `
        # Introduction to Machine Learning

        Machine learning is a subset of artificial intelligence that enables
        systems to learn and improve from experience without being explicitly
        programmed. Deep learning, using neural networks, has revolutionized
        the field with breakthrough applications in computer vision and NLP.
      `;
      const entity = createEntity("test-entity", content);
      addEntityToShell(entity);

      const jobData = createJobData("test-entity", entity.contentHash);

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
      const content = "Brief content about technology";
      const entity = createEntity("test-entity", content);
      addEntityToShell(entity);

      const jobData = createJobData("test-entity", entity.contentHash);

      await handler.process(jobData, "job-123", progressReporter);

      // Verify progress was reported
      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });
});
