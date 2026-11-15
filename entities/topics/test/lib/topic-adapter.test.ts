import { describe, it, expect, beforeEach } from "bun:test";
import { topicDocument } from "../../src/lib/topic-document";
import { topicEntitySchema } from "../../src/schemas/topic";
import { createMockTopicEntity } from "../fixtures/topic-entities";
import { topicTypeAdapter } from "../topics-plugins";

/**
 * The topic type as declared: its document read and written by
 * topicDocument, and its adapter as the installed package registers it.
 */
const declared = topicTypeAdapter();
const topicAdapter = { ...declared, ...topicDocument };

describe("the topic type", () => {
  let adapter: typeof topicAdapter;

  beforeEach(() => {
    adapter = topicAdapter;
  });

  describe("frontmatterSchema", () => {
    it("should expose frontmatterSchema for Studio", () => {
      expect(adapter.frontmatterSchema).toBeDefined();
      expect(adapter.frontmatterSchema?.shape).toHaveProperty("title");
      expect(adapter.frontmatterSchema?.shape).not.toHaveProperty("keywords");
    });
  });

  describe("createTopicBody", () => {
    it("should create frontmatter+body format", () => {
      const body = adapter.createTopicBody({
        title: "Test Topic",
        content: "This is the main content",
      });

      expect(body).toContain("---");
      expect(body).toContain("title: Test Topic");
      expect(body).toContain("This is the main content");
      expect(body).not.toContain("## Sources");
      expect(body).not.toContain("keywords:");
    });
  });

  describe("parseTopicBody", () => {
    it("should parse frontmatter+body format", () => {
      const body = `---
title: Test Topic
---
This is the main content`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("This is the main content");
    });

    it("should ignore legacy ## Sources section in old entities", () => {
      const body = `---
title: Old Topic
---
Main content here

## Sources
- Team Standup (conv-123) [conversation] <entity-1|hash-1>`;

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Old Topic");
      expect(parsed.content).toBe("Main content here");
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
      expect(schema.parse(validTopic).metadata).toEqual({});
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
          sources: [
            {
              slug: "s",
              title: "t",
              type: "post",
              entityId: "e",
              contentHash: "h",
            },
          ],
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
---
Some content here.`;

      const result = adapter.fromMarkdown(markdown);

      // Read as stored: the title stays in the document; nothing is indexed.
      expect(result.content).toContain("title: Test Topic");
      expect(result.metadata).toEqual({});
    });

    it("should ignore legacy Sources section in markdown", () => {
      const markdown = `---
title: Topic
---
Content

## Sources
- Title One (slug-one) [post] <entity-1|hash-1>`;

      const result = adapter.fromMarkdown(markdown);
      // Sources are not extracted into metadata
      expect(result.metadata).toEqual({});
    });
  });

  describe("extractMetadata", () => {
    it("should return empty metadata", () => {
      const entity = createMockTopicEntity({
        id: "test-topic",
        content: "# Test Topic\n\n## Content\nSome content",
      });

      const metadata = adapter.extractMetadata(entity);
      expect(metadata).toEqual({});
    });
  });

  describe("the written header", () => {
    it("states the topic's title and nothing more", () => {
      const content = adapter.createTopicBody({
        title: "Test Topic",
        content: "Some content",
      });

      const entity = createMockTopicEntity({
        id: "test-topic",
        content,
      });

      const result = adapter.toMarkdown(entity);

      expect(result).toContain("title: Test Topic");
      expect(result).not.toContain("keywords:");
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
      });

      const parsed = adapter.parseTopicBody(body);

      expect(parsed.title).toBe("Test Topic");
      expect(parsed.content).toBe("Main content here");
    });
  });
});
