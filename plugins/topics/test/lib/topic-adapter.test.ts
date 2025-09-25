import { describe, it, expect, beforeEach } from "bun:test";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import type { TopicSource } from "../../src/schemas/topic";
import type { TopicEntity } from "../../src/types";

describe("TopicAdapter", () => {
  let adapter: TopicAdapter;

  beforeEach(() => {
    adapter = new TopicAdapter();
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
        id: "test-topic",
        entityType: "topic",
        content: "Test body",
        metadata: {}, // Empty metadata now
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(validTopic)).not.toThrow();
    });

    it("should reject invalid topic type", () => {
      const schema = adapter.schema;

      const invalidTopic = {
        id: "test-topic",
        entityType: "note", // Wrong type
        content: "Test body",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidTopic)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should return content without frontmatter when no metadata", () => {
      const entity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Content\nSome content",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toBe(entity.content);
    });

    it("should include frontmatter when metadata exists", () => {
      const entity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Content\nSome content",
        metadata: { keywords: ["test", "topic"] },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("---");
      expect(markdown).toContain("keywords:");
      expect(markdown).toContain("# Test Topic");
    });
  });

  describe("fromMarkdown", () => {
    it("should create partial entity from markdown", () => {
      const markdown = "# Test Topic\n\n## Content\nSome content";

      const result = adapter.fromMarkdown(markdown);

      expect(result.content).toBe(markdown);
      expect(result.entityType).toBe("topic");
    });
  });

  describe("extractMetadata", () => {
    it("should return empty metadata when no metadata", () => {
      const entity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Content\nSome content",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({});
    });

    it("should return metadata when it exists", () => {
      const entity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Content\nSome content",
        metadata: { keywords: ["test"], sourceCount: 1 },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({ keywords: ["test"], sourceCount: 1 });
    });
  });

  describe("parseFrontMatter", () => {
    it("should parse frontmatter from markdown", () => {
      const markdown = `---
metadata: {}
---

# Content`;

      const schema = adapter.schema.pick({ metadata: true });
      const result = adapter.parseFrontMatter(markdown, schema);

      expect(result.metadata).toEqual({});
    });
  });

  describe("generateFrontMatter", () => {
    it("should return empty string when no metadata", () => {
      const entity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Content\nSome content",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = adapter.generateFrontMatter(entity);
      expect(result).toBe("");
    });

    it("should generate frontmatter when metadata exists", () => {
      const entity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: "# Test Topic\n\n## Content\nSome content",
        metadata: { keywords: ["test", "topic"], sourceCount: 2 },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = adapter.generateFrontMatter(entity);
      expect(result).toContain("keywords:");
      expect(result).toContain("sourceCount: 2");
    });
  });

  describe("parseTopicBody edge cases", () => {
    it("should handle body without H1 title", () => {
      const body = `## Summary
Test summary

## Content
Test content`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Unknown Topic");
      expect(parsed.summary).toBe("");
      expect(parsed.content).toBe(body);
    });

    it("should handle malformed body", () => {
      const body = "Some random text without structure";

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Unknown Topic");
      expect(parsed.summary).toBe("");
      expect(parsed.content).toBe(body);
      expect(parsed.keywords).toEqual([]);
      expect(parsed.sources).toEqual([]);
    });
  });
});
