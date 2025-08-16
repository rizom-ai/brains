import { describe, it, expect, beforeEach } from "bun:test";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import type { EntityService } from "@brains/core";
import { Logger } from "@brains/utils";
import type { TopicSource } from "../../src/schemas/topic";

describe("TopicAdapter", () => {
  let adapter: TopicAdapter;
  let mockEntityService: EntityService;
  let logger: Logger;

  beforeEach(() => {
    logger = Logger.getInstance().child("test");

    // Create a minimal mock EntityService
    mockEntityService = {
      create: async (entity) => ({
        ...entity,
        id: "test-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async (_id, updates) => ({
        id: "test-id",
        type: "topic",
        title: "Test Topic",
        body: updates.body || "",
        metadata: updates.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      get: async () => null,
      delete: async () => true,
      list: async () => [],
      search: async () => [],
    } as unknown as EntityService;

    adapter = new TopicAdapter({
      entityService: mockEntityService,
      logger,
    });
  });

  describe("createTopicBody", () => {
    it("should create structured content body", () => {
      const sources: TopicSource[] = ["conv-123", "note-456"];

      const body = adapter.createTopicBody({
        title: "Test Topic",
        summary: "This is a test summary",
        content: "This is the main content",
        keywords: ["test", "example"],
        sources,
      });

      expect(body).toContain("# Test Topic");
      expect(body).toContain("## Summary");
      expect(body).toContain("This is a test summary");
      expect(body).toContain("## Content");
      expect(body).toContain("This is the main content");
      expect(body).toContain("## Keywords");
      expect(body).toContain("test");
      expect(body).toContain("example");
      expect(body).toContain("## Sources");
      expect(body).toContain("conv-123");
      expect(body).toContain("note-456");
    });
  });

  describe("parseTopicBody", () => {
    it("should parse structured content back to components", () => {
      const body = `# Test Topic

## Summary
This is a test summary

## Content
This is the main content

## Keywords
- test
- example

## Sources
- conv-123
- note-456`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.summary).toBe("This is a test summary");
      expect(parsed.content).toBe("This is the main content");
      expect(parsed.keywords).toEqual(["test", "example"]);
      expect(parsed.sources).toEqual(["conv-123", "note-456"]);
    });
  });

  describe("schema", () => {
    it("should have a valid zod schema", () => {
      const schema = adapter.schema;

      const validTopic = {
        id: "Test Topic",
        entityType: "topic",
        content: "Test body",
        metadata: {
          keywords: ["test"],
          relevanceScore: 0.5,
          firstSeen: new Date(),
          lastSeen: new Date(),
          mentionCount: 1,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(validTopic)).not.toThrow();
    });

    it("should reject invalid topic type", () => {
      const schema = adapter.schema;

      const invalidTopic = {
        id: "Test Topic",
        entityType: "note", // Wrong type
        content: "Test body",
        metadata: {
          keywords: ["test"],
          relevanceScore: 0.5,
          firstSeen: new Date(),
          lastSeen: new Date(),
          mentionCount: 1,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidTopic)).toThrow();
    });
  });
});
