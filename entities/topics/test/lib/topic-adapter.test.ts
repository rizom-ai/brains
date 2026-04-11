import { describe, it, expect, beforeEach } from "bun:test";
import { TopicAdapter } from "../../src/lib/topic-adapter";
import { topicEntitySchema } from "../../src/schemas/topic";
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
      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "This is the main content",
        keywords: ["test", "example"],
      });

      expect(body).toContain("---");
      expect(body).toContain("title: Test Topic");
      expect(body).toContain("keywords:");
      expect(body).toContain("test");
      expect(body).toContain("example");
      expect(body).toContain("This is the main content");
      expect(body).not.toContain("## Sources");
    });

    it("should omit keywords from frontmatter when empty", () => {
      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "Content here",
        keywords: [],
      });

      expect(body).toContain("title: Test Topic");
      expect(body).not.toContain("keywords:");
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
This is the main content`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("This is the main content");
      expect(parsed.keywords).toEqual(["test", "example"]);
    });

    it("should ignore legacy ## Sources section in old entities", () => {
      const body = `---
title: Old Topic
keywords:
  - legacy
---
Main content here

## Sources
- Team Standup (conv-123) [conversation] <entity-1|hash-1>`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Old Topic");
      expect(parsed.content).toBe("Main content here");
      expect(parsed.keywords).toEqual(["legacy"]);
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
      expect(schema.parse(validTopic).metadata.aliases).toBeUndefined();
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

    it("should accept old entities with sources in metadata", () => {
      const schema = adapter.schema;

      const oldEntity = createMockTopicEntity({
        id: "old-topic",
        content: "Test body",
        metadata: {
          ...({
            sources: [
              {
                slug: "s",
                title: "t",
                type: "post",
                entityId: "e",
                contentHash: "h",
              },
            ],
          } as Record<string, unknown>),
        },
      });

      // Schema should not reject old entities — sources are just ignored
      expect(() => schema.parse(oldEntity)).not.toThrow();
    });
  });

  describe("toMarkdown", () => {
    it("should convert entity content to frontmatter format", () => {
      const content = adapter.createTopicBody({
        title: "Test Topic",
        content: "Some content",
        keywords: ["test"],
      });

      const entity = createMockTopicEntity({
        id: "test-topic",
        content,
      });

      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("---");
      expect(markdown).toContain("title: Test Topic");
      expect(markdown).toContain("Some content");
      expect(markdown).not.toContain("## Sources");
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter format", () => {
      const markdown = `---
title: Test Topic
keywords:
  - keyword1
---
Some content here.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("topic");
      expect(result.content).toContain("title: Test Topic");
      expect(result).not.toHaveProperty("metadata");
    });

    it("should ignore legacy Sources section in markdown", () => {
      const markdown = `---
title: Topic
---
Content

## Sources
- Title One (slug-one) [post] <entity-1|hash-1>`;

      const result = adapter.fromMarkdown(markdown);
      expect(result.entityType).toBe("topic");
      // Sources are not extracted into metadata
      expect(result).not.toHaveProperty("metadata");
    });
  });

  describe("extractMetadata", () => {
    it("should return empty metadata", () => {
      const entity = createMockTopicEntity({
        id: "test-topic",
        content: "# Test Topic\n\n## Content\nSome content",
      });

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({ aliases: [] });
    });
  });

  describe("generateFrontMatter", () => {
    it("should generate frontmatter string from entity", () => {
      const content = adapter.createTopicBody({
        title: "Test Topic",
        content: "Some content",
        keywords: ["test", "example"],
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

      const schema = topicEntitySchema.pick({ metadata: true });
      const result = adapter.parseFrontMatter(markdown, schema);

      expect(result.metadata).toEqual({});
    });
  });

  describe("roundtrip conversion", () => {
    it("should preserve data through createTopicBody and parseTopicBody", () => {
      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "Main content here",
        keywords: ["test", "example"],
      });

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("Main content here");
      expect(parsed.keywords).toEqual(["test", "example"]);
    });
  });
});
