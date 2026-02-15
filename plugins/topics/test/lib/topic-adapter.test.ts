import { describe, it, expect, beforeEach } from "bun:test";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import type { TopicSource } from "../../src/schemas/topic";
import { createMockTopicEntity } from "../fixtures/topic-entities";

describe("TopicAdapter", () => {
  let adapter: TopicAdapter;

  beforeEach(() => {
    adapter = new TopicAdapter();
  });

  describe("frontmatterSchema", () => {
    it("should expose frontmatterSchema for CMS", () => {
      expect(adapter.frontmatterSchema).toBeDefined();
      expect(adapter.frontmatterSchema.shape).toHaveProperty("title");
      expect(adapter.frontmatterSchema.shape).toHaveProperty("keywords");
    });
  });

  describe("createTopicBody", () => {
    it("should create frontmatter+body format", () => {
      const sources: TopicSource[] = [
        {
          slug: "conv-123",
          title: "Team Standup",
          type: "conversation",
          entityId: "entity-1",
          contentHash: "hash-1",
        },
        {
          slug: "note-456",
          title: "Project Notes",
          type: "conversation",
          entityId: "entity-2",
          contentHash: "hash-2",
        },
      ];

      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "This is the main content",
        keywords: ["test", "example"],
        sources,
      });

      expect(body).toContain("---");
      expect(body).toContain("title: Test Topic");
      expect(body).toContain("keywords:");
      expect(body).toContain("test");
      expect(body).toContain("example");
      expect(body).toContain("This is the main content");
      expect(body).toContain("## Sources");
      expect(body).toContain("Team Standup (conv-123)");
      expect(body).toContain("Project Notes (note-456)");
      expect(body).toContain("<entity-1|hash-1>");
      expect(body).toContain("<entity-2|hash-2>");
    });

    it("should omit keywords from frontmatter when empty", () => {
      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "Content here",
        keywords: [],
        sources: [],
      });

      expect(body).toContain("title: Test Topic");
      expect(body).not.toContain("keywords:");
    });

    it("should omit sources section when no sources", () => {
      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "Content here",
        keywords: ["test"],
        sources: [],
      });

      expect(body).not.toContain("## Sources");
    });
  });

  describe("parseTopicBody", () => {
    it("should parse frontmatter+body format", () => {
      const body = `---
title: Test Topic
keywords:
  - test
  - example
---
This is the main content

## Sources
- Team Standup (conv-123) [conversation] <entity-1|hash-1>
- Project Notes (note-456) [conversation] <entity-2|hash-2>`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("This is the main content");
      expect(parsed.keywords).toEqual(["test", "example"]);
      expect(parsed.sources).toEqual([
        {
          slug: "conv-123",
          title: "Team Standup",
          type: "conversation",
          entityId: "entity-1",
          contentHash: "hash-1",
        },
        {
          slug: "note-456",
          title: "Project Notes",
          type: "conversation",
          entityId: "entity-2",
          contentHash: "hash-2",
        },
      ]);
    });

    it("should parse legacy structured content format", () => {
      const body = `# Test Topic

## Content
This is the main content

## Keywords
- test
- example

## Sources
- Team Standup (conv-123) [conversation] <entity-1|hash-1>
- Project Notes (note-456) [conversation] <entity-2|hash-2>`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("This is the main content");
      expect(parsed.keywords).toEqual(["test", "example"]);
      expect(parsed.sources).toEqual([
        {
          slug: "conv-123",
          title: "Team Standup",
          type: "conversation",
          entityId: "entity-1",
          contentHash: "hash-1",
        },
        {
          slug: "note-456",
          title: "Project Notes",
          type: "conversation",
          entityId: "entity-2",
          contentHash: "hash-2",
        },
      ]);
    });
  });

  describe("schema", () => {
    it("should have a valid zod schema", () => {
      const schema = adapter.schema;

      const validTopic = createMockTopicEntity({
        id: "test-topic",
        content: "Test body",
      });

      expect(() => schema.parse(validTopic)).not.toThrow();
    });

    it("should reject invalid topic type", () => {
      const schema = adapter.schema;

      const invalidTopic = {
        id: "test-topic",
        entityType: "note",
        content: "Test body",
        contentHash: "fake-hash",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => schema.parse(invalidTopic)).toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should convert entity content to frontmatter format", () => {
      const content = adapter.createTopicBody({
        title: "Test Topic",
        content: "Some content",
        keywords: ["test"],
        sources: [],
      });

      const entity = createMockTopicEntity({
        id: "test-topic",
        content,
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Test Topic");
      expect(markdown).toContain("Some content");
    });

    it("should convert legacy entity content to frontmatter format", () => {
      const entity = createMockTopicEntity({
        id: "test-topic",
        content:
          "# Test Topic\n\n## Content\nSome content\n\n## Keywords\n- test\n\n## Sources\n_No sources_",
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Test Topic");
      expect(markdown).toContain("Some content");
    });
  });

  describe("fromMarkdown", () => {
    it("should pass through frontmatter format", () => {
      const markdown = `---
title: Test Topic
keywords:
  - keyword1
---
Some content here.

## Sources
- Title One (slug-one) [post] <entity-1|hash-1>`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("topic");
      expect(result.content).toContain("---");
      expect(result.content).toContain("title: Test Topic");
      expect(result.metadata?.sources).toHaveLength(1);
      expect(result.metadata?.sources?.[0]).toEqual({
        title: "Title One",
        slug: "slug-one",
        type: "post",
        entityId: "entity-1",
        contentHash: "hash-1",
      });
    });

    it("should auto-convert legacy structured markdown to frontmatter", () => {
      const markdown = `# Test Topic

## Content
Some content here.

## Keywords
- keyword1

## Sources
- Title One (slug-one) [post] <entity-1|hash-1>
- Title Two (slug-two) [link] <entity-2|hash-2>`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("topic");
      expect(result.content).toContain("---");
      expect(result.content).toContain("title: Test Topic");
      expect(result.metadata?.sources).toHaveLength(2);
      expect(result.metadata?.sources?.[0]).toEqual({
        title: "Title One",
        slug: "slug-one",
        type: "post",
        entityId: "entity-1",
        contentHash: "hash-1",
      });
    });

    it("should return undefined sources when no Sources section", () => {
      const markdown = `---
title: Topic
---
Some content without sources section`;

      const result = adapter.fromMarkdown(markdown);
      expect(result.metadata?.sources).toBeUndefined();
    });

    it("should return undefined sources when Sources section is empty", () => {
      const markdown = `---
title: Topic
---
Some content

## Sources
_No sources_`;

      const result = adapter.fromMarkdown(markdown);
      expect(result.metadata?.sources).toBeUndefined();
    });
  });

  describe("extractMetadata", () => {
    it("should return empty metadata (topics don't use metadata)", () => {
      const entity = createMockTopicEntity({
        id: "test-topic",
        content: "# Test Topic\n\n## Content\nSome content",
      });

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({});
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string from entity", () => {
      const content = adapter.createTopicBody({
        title: "Test Topic",
        content: "Some content",
        keywords: ["test", "example"],
        sources: [],
      });

      const entity = createMockTopicEntity({
        id: "test-topic",
        content,
      });

      const result = adapter.generateFrontMatter(entity);

      expect(result).toContain("title: Test Topic");
      expect(result).toContain("keywords:");
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

  describe("parseTopicBody edge cases", () => {
    it("should handle body without H1 title (legacy)", () => {
      const body = `## Content
Test content`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Unknown Topic");
      expect(parsed.content).toBe(body);
    });

    it("should handle malformed body", () => {
      const body = "Some random text without structure";

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Unknown Topic");
      expect(parsed.content).toBe(body);
      expect(parsed.keywords).toEqual([]);
      expect(parsed.sources).toEqual([]);
    });
  });

  describe("roundtrip conversion", () => {
    it("should preserve data through createTopicBody and parseTopicBody", () => {
      const sources: TopicSource[] = [
        {
          slug: "conv-123",
          title: "Team Standup",
          type: "conversation",
          entityId: "entity-1",
          contentHash: "hash-1",
        },
      ];

      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "Main content here",
        keywords: ["test", "example"],
        sources,
      });

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("Main content here");
      expect(parsed.keywords).toEqual(["test", "example"]);
      expect(parsed.sources).toEqual(sources);
    });
  });
});
