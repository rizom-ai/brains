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
      const sources: TopicSource[] = [
        {
          type: "conversation",
          id: "conv-123",
          timestamp: new Date("2024-01-01"),
          context: "Test context",
        },
      ];

      const body = adapter.createTopicBody({
        summary: "This is a test summary",
        content: "This is the main content",
        references: sources,
      });

      expect(body).toContain("# Topic Content");
      expect(body).toContain("## Summary");
      expect(body).toContain("This is a test summary");
      expect(body).toContain("## Content");
      expect(body).toContain("This is the main content");
      expect(body).toContain("## References");
    });
  });

  describe("parseTopicBody", () => {
    it("should parse structured content back to components", () => {
      const body = `# Topic Content

## Summary
This is a test summary

## Content
This is the main content

## References

### Reference 1

#### Type
conversation

#### ID
conv-123

#### Timestamp
2024-01-01T00:00:00.000Z

#### Context
Test context`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.summary).toBe("This is a test summary");
      expect(parsed.content).toBe("This is the main content");
      expect(parsed.sources).toHaveLength(1);
      expect(parsed.sources[0]?.type).toBe("conversation");
      expect(parsed.sources[0]?.id).toBe("conv-123");
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
