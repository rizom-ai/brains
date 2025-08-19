import { describe, it, expect, beforeEach } from "bun:test";
import { TopicService } from "../../src/lib/topic-service";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import { MockShell, createSilentLogger, type Logger } from "@brains/plugins";
import type { TopicEntity } from "../../src/types";
import type { TopicSource } from "../../src/schemas/topic";

describe("TopicService", () => {
  let service: TopicService;
  let mockShell: MockShell;
  let logger: Logger;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });

    // Get the real EntityService from MockShell
    const entityService = mockShell.getEntityService();

    // Create TopicService with real dependencies
    service = new TopicService(entityService, logger);
  });

  describe("createTopic", () => {
    it("should create a new topic", async () => {
      const sources: TopicSource[] = ["conv-123"];

      const topic = await service.createTopic({
        title: "Test Topic",
        summary: "Test summary",
        content: "Test content",
        sources,
        keywords: ["test"],
      });

      expect(topic).not.toBeNull();
      expect(topic?.id).toBe("test-topic"); // Title is slugified for ID
      // Parse body to check keywords
      const adapter = new TopicAdapter();
      const parsed = adapter.parseTopicBody(topic!.content);
      expect(parsed.keywords).toEqual(["test"]);
      expect(parsed.sources).toHaveLength(1);
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
      });

      // Update it
      const updated = await service.updateTopic(topic!.id, {
        summary: "Updated summary",
        keywords: ["original", "updated"],
      });

      expect(updated).not.toBeNull();
      const adapter = new TopicAdapter();
      const parsed = adapter.parseTopicBody(updated!.content);
      expect(parsed.keywords).toEqual(["original", "updated"]);
      expect(parsed.summary).toBe("Updated summary");
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
      });

      const retrieved = await service.getTopic(created!.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created!.id);
      expect(retrieved?.id).toBe("test-topic"); // ID is slugified
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
      });

      await service.createTopic({
        title: "Topic 2",
        summary: "Summary 2",
        content: "Content 2",
        sources: [],
        keywords: ["two"],
      });

      const topics = await service.listTopics();

      expect(topics.length).toBeGreaterThanOrEqual(2);
      const topicIds = topics.map((t) => t.id);
      expect(topicIds).toContain("topic-1");
      expect(topicIds).toContain("topic-2");
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
      });

      await service.createTopic({
        title: "Web Development",
        summary: "About web dev",
        content: "Content about web development",
        sources: [],
        keywords: ["web", "javascript"],
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
      });

      const topic2 = await service.createTopic({
        title: "Topic B",
        summary: "Summary B",
        content: "Content B",
        sources: [],
        keywords: ["b", "common"],
      });

      const merged = await service.mergeTopics([topic1!.id, topic2!.id]);

      expect(merged).not.toBeNull();
      const adapter = new TopicAdapter();
      const parsed = adapter.parseTopicBody(merged!.content);
      expect(parsed.keywords).toContain("a");
      expect(parsed.keywords).toContain("b");
      expect(parsed.keywords).toContain("common");

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
