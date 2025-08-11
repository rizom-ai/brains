import { describe, it, expect, beforeEach } from "bun:test";
import { TopicService } from "../../src/lib/topic-service";
import { MockShell } from "@brains/core/test";
import { Logger } from "@brains/utils";
import type { TopicEntity } from "../../src/types";
import type { TopicSource } from "../../src/schemas/topic";

describe("TopicService", () => {
  let service: TopicService;
  let mockShell: MockShell;
  let logger: Logger;

  beforeEach(() => {
    logger = Logger.getInstance().child("test");
    mockShell = new MockShell({ logger });

    // Get the real EntityService from MockShell
    const entityService = mockShell.getEntityService();

    // Create TopicService with real dependencies
    service = new TopicService(entityService, logger);
  });

  describe("createTopic", () => {
    it("should create a new topic", async () => {
      const sources: TopicSource[] = [
        {
          type: "conversation",
          id: "conv-123",
          timestamp: new Date(),
          context: "Test context",
        },
      ];

      const topic = await service.createTopic({
        title: "Test Topic",
        summary: "Test summary",
        content: "Test content",
        sources,
        keywords: ["test"],
        relevanceScore: 0.8,
      });

      expect(topic).not.toBeNull();
      expect(topic?.id).toBe("Test Topic"); // Title is used as ID
      expect(topic?.metadata.keywords).toEqual(["test"]);
      expect(topic?.metadata.relevanceScore).toBe(0.8);
      expect(topic?.metadata.mentionCount).toBe(1);
    });
  });

  describe("updateTopic", () => {
    it("should update an existing topic", async () => {
      // Create a topic first
      const topic = await service.createTopic({
        title: "Original Topic",
        summary: "Original summary",
        content: "Original content",
        sources: [],
        keywords: ["original"],
        relevanceScore: 0.5,
      });

      // Update it
      const updated = await service.updateTopic(topic!.id, {
        summary: "Updated summary",
        keywords: ["original", "updated"],
        relevanceScore: 0.9,
      });

      expect(updated).not.toBeNull();
      expect(updated?.metadata.keywords).toEqual(["original", "updated"]);
      expect(updated?.metadata.relevanceScore).toBe(0.9);
    });

    it("should return null for non-existent topic", async () => {
      const updated = await service.updateTopic("non-existent", {
        summary: "New summary",
      });

      expect(updated).toBeNull();
    });
  });

  describe("getTopic", () => {
    it("should retrieve a topic by ID", async () => {
      const created = await service.createTopic({
        title: "Test Topic",
        summary: "Test summary",
        content: "Test content",
        sources: [],
        keywords: ["test"],
        relevanceScore: 0.7,
      });

      const retrieved = await service.getTopic(created!.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created!.id);
      expect(retrieved?.id).toBe("Test Topic"); // ID is the title
    });

    it("should return null for non-existent topic", async () => {
      const topic = await service.getTopic("non-existent");
      expect(topic).toBeNull();
    });
  });

  describe("listTopics", () => {
    it("should list all topics", async () => {
      // Create multiple topics
      await service.createTopic({
        title: "Topic 1",
        summary: "Summary 1",
        content: "Content 1",
        sources: [],
        keywords: ["one"],
        relevanceScore: 0.5,
      });

      await service.createTopic({
        title: "Topic 2",
        summary: "Summary 2",
        content: "Content 2",
        sources: [],
        keywords: ["two"],
        relevanceScore: 0.6,
      });

      const topics = await service.listTopics();

      expect(topics.length).toBeGreaterThanOrEqual(2);
      const topicIds = topics.map((t) => t.id);
      expect(topicIds).toContain("Topic 1");
      expect(topicIds).toContain("Topic 2");
    });

    it("should filter by date range", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await service.createTopic({
        title: "Recent Topic",
        summary: "Summary",
        content: "Content",
        sources: [],
        keywords: ["recent"],
        relevanceScore: 0.5,
      });

      const topics = await service.listTopics({
        startDate: yesterday,
        endDate: tomorrow,
      });

      const topicIds = topics.map((t) => t.id);
      expect(topicIds).toContain("Recent Topic");

      const noTopics = await service.listTopics({
        startDate: tomorrow,
        endDate: tomorrow,
      });

      expect(noTopics).toHaveLength(0);
    });
  });

  describe("searchTopics", () => {
    it("should call search on entity service", async () => {
      await service.createTopic({
        title: "Machine Learning",
        summary: "About ML",
        content: "Content about machine learning",
        sources: [],
        keywords: ["ml", "ai"],
        relevanceScore: 0.8,
      });

      await service.createTopic({
        title: "Web Development",
        summary: "About web dev",
        content: "Content about web development",
        sources: [],
        keywords: ["web", "javascript"],
        relevanceScore: 0.7,
      });

      // MockShell's search always returns empty array
      // This test just verifies the method works without errors
      const results = await service.searchTopics("machine");

      // We expect empty array from MockShell
      expect(results).toEqual([]);
    });
  });

  describe("deleteTopic", () => {
    it("should delete a topic", async () => {
      const topic = await service.createTopic({
        title: "To Delete",
        summary: "Summary",
        content: "Content",
        sources: [],
        keywords: ["delete"],
        relevanceScore: 0.5,
      });

      const deleted = await service.deleteTopic(topic!.id);
      expect(deleted).toBe(true);

      const retrieved = await service.getTopic(topic!.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("mergeTopics", () => {
    it("should merge multiple topics", async () => {
      const topic1 = await service.createTopic({
        title: "Topic A",
        summary: "Summary A",
        content: "Content A",
        sources: [],
        keywords: ["a", "common"],
        relevanceScore: 0.7,
      });

      const topic2 = await service.createTopic({
        title: "Topic B",
        summary: "Summary B",
        content: "Content B",
        sources: [],
        keywords: ["b", "common"],
        relevanceScore: 0.8,
      });

      const merged = await service.mergeTopics([topic1!.id, topic2!.id]);

      expect(merged).not.toBeNull();
      expect(merged?.metadata.keywords).toContain("a");
      expect(merged?.metadata.keywords).toContain("b");
      expect(merged?.metadata.keywords).toContain("common");
      expect(merged?.metadata.relevanceScore).toBe(0.8); // Max of the two

      // Topic B should be deleted
      const deletedTopic = await service.getTopic(topic2!.id);
      expect(deletedTopic).toBeNull();

      // Topic A should be the merged result
      const mergedTopic = await service.getTopic(topic1!.id);
      expect(mergedTopic).not.toBeNull();
    });

    it("should return null with insufficient topics", async () => {
      const merged = await service.mergeTopics([
        "non-existent-1",
        "non-existent-2",
      ]);
      expect(merged).toBeNull();
    });
  });
});
