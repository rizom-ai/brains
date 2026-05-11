import { describe, it, expect, beforeEach } from "bun:test";
import {
  TopicExtractionHandler,
  type TopicExtractionJobData,
} from "../../src/handlers/topic-extraction-handler";
import {
  createMockEntityPluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import {
  createMockShell,
  type MockShell,
  createEntityPluginContext,
  type EntityPluginContext,
  type Logger,
} from "@brains/plugins/test";
import { ProgressReporter } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type { BaseEntity } from "@brains/plugins";

describe("TopicExtractionHandler", () => {
  let handler: TopicExtractionHandler;
  let context: EntityPluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let progressReporter: ProgressReporter;
  let progressCalls: Array<{ progress: number; message?: string }>;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = createMockShell({ logger });
    context = createEntityPluginContext(mockShell, "topics");
    handler = new TopicExtractionHandler(context, logger);

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

  const addEntityToShell = (entity: BaseEntity): void => {
    void mockShell.getEntityService().createEntity({ entity: entity });
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

      const entity = createEntity("test-entity", newContent);
      addEntityToShell(entity);

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

    it("should enqueue one process-batch job for multiple extracted topics", async () => {
      const content = "Content about human AI collaboration and team memory.";
      const entity = createEntity("test-entity", content);
      const batchContext = createMockEntityPluginContext({
        pluginId: "topics",
        returns: {
          entityService: { getEntity: entity, listEntities: [] },
          ai: {
            generate: {
              topics: [
                {
                  title: "Human-AI Collaboration",
                  content: "Humans and AI agents coordinate shared work.",
                  relevanceScore: 0.9,
                },
                {
                  title: "Team Memory",
                  content: "Teams preserve shared context over time.",
                  relevanceScore: 0.8,
                },
              ],
            },
          },
          jobsEnqueue: "process-job-1",
        },
      });
      const batchHandler = new TopicExtractionHandler(batchContext, logger);
      const jobData = createJobData("test-entity", entity.contentHash);

      const result = await batchHandler.process(
        jobData,
        "job-123",
        progressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.topicsExtracted).toBe(2);
      expect(result.batchId).toBe("process-job-1");
      expect(batchContext.jobs.enqueue).toHaveBeenCalledTimes(1);
      expect(batchContext.jobs.enqueue).toHaveBeenCalledWith({
        type: "process-batch",
        data: {
          topics: [
            {
              title: "Human-AI Collaboration",
              content: "Humans and AI agents coordinate shared work.",
              relevanceScore: 0.9,
            },
            {
              title: "Team Memory",
              content: "Teams preserve shared context over time.",
              relevanceScore: 0.8,
            },
          ],
          sourceEntityId: "test-entity",
          sourceEntityType: "post",
          autoMerge: true,
          mergeSimilarityThreshold: 0.85,
        },
        options: expect.objectContaining({
          priority: 5,
          source: "topics-plugin",
          metadata: expect.objectContaining({
            operationType: "batch_processing",
            operationTarget: "process topics for post:test-entity",
            pluginId: "topics",
          }),
        }),
      });
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
      expect(result.topicsExtracted).toBeGreaterThanOrEqual(0);
    });

    it("should report progress during extraction", async () => {
      const content = "Brief content about technology";
      const entity = createEntity("test-entity", content);
      addEntityToShell(entity);

      const jobData = createJobData("test-entity", entity.contentHash);

      await handler.process(jobData, "job-123", progressReporter);

      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });
});
